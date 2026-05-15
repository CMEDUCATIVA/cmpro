require 'net/http'
require 'uri'
require 'json'

module Documentos
  class LightragDocumentsController < ActionController::API
    def index
      ids = parse_ids(params[:file_link_ids] || params[:file_link_id])
      scope = ::Documentos::LightragDocument.all
      scope = scope.where(file_link_id: ids) if ids.any?
      render json: scope.order(:file_link_id).as_json(only: %i[file_link_id doc_id filename])
    end

    def create
      file_link_id = params[:file_link_id].presence
      doc_id = params[:doc_id].presence
      filename = params[:filename].presence

      unless file_link_id && doc_id
        return render json: { error: 'file_link_id y doc_id son requeridos' }, status: :unprocessable_entity
      end

      record = ::Documentos::LightragDocument.find_or_initialize_by(file_link_id: file_link_id)
      record.doc_id = doc_id
      record.filename = filename if filename
      record.save!

      render json: record.as_json(only: %i[file_link_id doc_id filename]), status: :created
    rescue StandardError => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def destroy
      record = ::Documentos::LightragDocument.find_by(file_link_id: params[:id])
      return render json: { error: 'Documento IA no encontrado' }, status: :not_found unless record

      cfg = lightrag_config
      unless cfg[:url].present? && cfg[:token].present? && cfg[:api_key].present?
        return render json: { error: 'Configuracion LightRAG incompleta' }, status: :unprocessable_entity
      end

      response = delete_from_lightrag(record.doc_id, cfg, delete_params)
      status_code = response[:http_status] || :ok

      if response[:error]
        render json: response, status: status_code
      else
        if response[:status].to_s == 'busy'
          render json: response, status: status_code
        else
          record.destroy!
          render json: response, status: status_code
        end
      end
    rescue StandardError => e
      Rails.logger.error("[Documentos] Delete LightRAG fallo: #{e.class} #{e.message}\n#{e.backtrace&.first}")
      render json: { error: 'No se pudo eliminar en LightRAG', detail: e.message }, status: :bad_gateway
    end

    def track_status
      track_id = params[:track_id].to_s
      if track_id.blank?
        return render json: { error: 'track_id requerido' }, status: :unprocessable_entity
      end

      cfg = lightrag_config
      unless cfg[:url].present? && cfg[:token].present? && cfg[:api_key].present?
        return render json: { error: 'Configuracion LightRAG incompleta' }, status: :unprocessable_entity
      end

      Rails.logger.info("[Documentos] Track status request track_id=#{track_id}")
      response = fetch_track_status(track_id, cfg)
      status_code = response[:http_status] || :ok

      if response[:error]
        render json: response, status: status_code
      else
        Rails.logger.info("[Documentos] Track status response track_id=#{track_id} keys=#{response.keys}")
        render json: response, status: status_code
      end
    rescue StandardError => e
      Rails.logger.error("[Documentos] Track status LightRAG fallo: #{e.class} #{e.message}\n#{e.backtrace&.first}")
      render json: { error: 'No se pudo consultar track_status', detail: e.message }, status: :bad_gateway
    end

    private

    def parse_ids(value)
      return [] if value.blank?
      value
        .to_s
        .split(',')
        .map { |v| v.strip }
        .select { |v| v.match?(/^\d+$/) }
        .map(&:to_i)
        .uniq
    end

    def delete_params
      {
        delete_file: to_bool(params[:delete_file]),
        delete_llm_cache: to_bool(params[:delete_llm_cache])
      }
    end

    def to_bool(value)
      return false if value.nil?
      return value if value == true || value == false
      value.to_s.strip.downcase == 'true'
    end

    def lightrag_config
      cfg = ::Documentos::Config.current
      {
        url: cfg.url.to_s,
        token: cfg.token.to_s,
        api_key: cfg.api_key.to_s
      }
    end

    def build_lightrag_uri(base_url, target_path)
      uri = URI.parse(base_url)
      path = uri.path.to_s
      if path.strip.empty? || path == '/'
        return URI.join(uri.to_s.chomp('/'), target_path)
      end
      if path.end_with?('/documents/upload')
        uri.path = path.sub(%r{/documents/upload$}, target_path)
        return uri
      end
      if path.end_with?(target_path)
        return uri
      end
      URI.join(uri.to_s.chomp('/'), target_path)
    end

    def fetch_track_status(track_id, cfg)
      uri = build_lightrag_uri(cfg[:url], "/documents/track_status/#{track_id}")

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'

      request = Net::HTTP::Get.new(uri.request_uri)
      request['accept'] = 'application/json'
      auth_token = cfg[:token].to_s.strip
      request['Authorization'] = auth_token.start_with?('Bearer ') ? auth_token : "Bearer #{auth_token}"
      request['X-API-Key'] = cfg[:api_key]

      res = http.request(request)
      body = res.body.to_s
      json_body = begin
        body.empty? ? {} : JSON.parse(body)
      rescue StandardError
        { 'raw_body' => body }
      end

      unless res.is_a?(Net::HTTPSuccess)
        Rails.logger.error("[Documentos] LightRAG track_status devolvio #{res.code} body=#{json_body.inspect}")
        return { error: "LightRAG devolvio #{res.code}", body: json_body, http_status: res.code.to_i }
      end

      json_body.symbolize_keys.merge(http_status: res.code.to_i)
    end

    def delete_from_lightrag(doc_id, cfg, options)
      uri = build_lightrag_uri(cfg[:url], '/documents/delete_document')

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'

      request = Net::HTTP::Delete.new(uri.request_uri)
      request['accept'] = 'application/json'
      auth_token = cfg[:token].to_s.strip
      request['Authorization'] = auth_token.start_with?('Bearer ') ? auth_token : "Bearer #{auth_token}"
      request['X-API-Key'] = cfg[:api_key]
      request['Content-Type'] = 'application/json'
      request.body = {
        doc_ids: [doc_id.to_s],
        delete_file: options[:delete_file],
        delete_llm_cache: options[:delete_llm_cache]
      }.to_json

      res = http.request(request)
      body = res.body.to_s
      json_body = begin
        body.empty? ? {} : JSON.parse(body)
      rescue StandardError
        { 'raw_body' => body }
      end

      unless res.is_a?(Net::HTTPSuccess)
        Rails.logger.error("[Documentos] LightRAG delete devolvio #{res.code} body=#{json_body.inspect}")
        return { error: "LightRAG devolvio #{res.code}", body: json_body, http_status: res.code.to_i }
      end

      json_body.symbolize_keys.merge(http_status: res.code.to_i)
    end
  end
end
