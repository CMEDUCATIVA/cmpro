require 'net/http'
require 'uri'
require 'json'

module Documentos
  # API sin filtros de ApplicationController para evitar chequeos de autorización/CSRF de OpenProject.
  class UploadsController < ActionController::API
    ALLOWED_EXT = %w[
      txt md docx pdf pptx xlsx rtf odt epub html htm tex json xml yaml yml csv log conf ini properties sql bat sh
      c cpp py java js ts swift go rb php css scss less
    ].freeze

    def create
      file = params[:file]
      return render json: { error: 'Archivo no recibido' }, status: :bad_request unless file

      ext = File.extname(file.original_filename.to_s).delete('.').downcase
      unless ALLOWED_EXT.include?(ext)
        return render json: { error: "Extension no permitida: #{ext}" }, status: :unprocessable_entity
      end

      cfg = lightrag_config_from_params
      unless cfg[:url].present? && cfg[:token].present? && cfg[:api_key].present?
        return render json: { error: 'Configuracion LightRAG incompleta', detail: 'Define URL, token y API key en Ajustes IA' }, status: :unprocessable_entity
      end

      response = forward_to_lightrag(file, cfg)
      status_code = response[:status] || :ok
      render json: response, status: status_code
    rescue StandardError => e
      Rails.logger.error("[Documentos] Upload a LightRAG fallo: #{e.class} #{e.message}\n#{e.backtrace&.first}")
      render json: { error: 'No se pudo subir a LightRAG', detail: e.message }, status: :bad_gateway
    end

    def show_config
      cfg = ::Documentos::Config.current
      render json: {
        url: cfg.url.to_s,
        token: cfg.token.to_s,
        api_key: cfg.api_key.to_s
      }
    end

    def update_config
      cfg = ::Documentos::Config.current
      cfg.url = config_params[:url]
      cfg.token = config_params[:token]
      cfg.api_key = config_params[:api_key]

      if cfg.save
        render json: { status: 'ok' }
      else
        render json: { error: 'No se pudo guardar config', detail: cfg.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def log
      level = params[:level].to_s
      message = params[:message].to_s
      data = params[:data]
      data_text = begin
        data.nil? ? "" : " data=#{data.to_json}"
      rescue StandardError
        " data=[unserializable]"
      end

      logger_method =
        case level
        when "warn" then :warn
        when "error" then :error
        else :info
        end

      Rails.logger.public_send(logger_method, "[Documentos] #{message}#{data_text}")
      render json: { status: "ok" }
    end

    def direct_upload_proxy
      file = params[:file]
      url = params[:direct_upload_url].to_s
      name = params[:name].presence || file&.original_filename.to_s

      unless file && url.present?
        return render json: { error: 'Archivo o URL no recibida' }, status: :bad_request
      end

      uri = begin
        URI.parse(url)
      rescue StandardError
        nil
      end

      unless uri && uri.scheme == 'https' && uri.host.present? && uri.path.to_s.include?('/apps/integration_openproject/direct-upload/')
        return render json: { error: 'URL no permitida' }, status: :unprocessable_entity
      end

      Rails.logger.info("[Documentos] direct-upload proxy start url=#{uri} name=#{name} size=#{file.size}")

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true

      request = Net::HTTP::Post.new(uri.request_uri)
      request.set_form(
        [['file', file.tempfile, { filename: name, 'Content-Type' => file.content_type.to_s }]],
        'multipart/form-data'
      )

      res = http.request(request)
      body = res.body.to_s
      Rails.logger.info("[Documentos] direct-upload proxy response status=#{res.code} body=#{body[0, 1500]}")

      render json: { status: res.code.to_i, body: body }, status: res.code.to_i
    rescue StandardError => e
      Rails.logger.error("[Documentos] direct-upload proxy error: #{e.class} #{e.message}")
      render json: { error: 'No se pudo reenviar a Nextcloud', detail: e.message }, status: :bad_gateway
    end

    private

    def lightrag_config_from_params
      incoming = {
        url: params[:lightrag_url].presence,
        token: params[:lightrag_token].presence,
        api_key: params[:lightrag_api_key].presence
      }.compact

      {
        url: incoming[:url],
        token: incoming[:token],
        api_key: incoming[:api_key]
      }
    end

    def config_params
      {
        url: params[:url].presence,
        token: params[:token].presence,
        api_key: params[:api_key].presence || params[:apiKey].presence
      }
    end

    def forward_to_lightrag(file, cfg)
      uri = URI.parse(cfg[:url])

      # Si la URL no trae ruta, asumir /documents/upload (endpoint de ingesta conocido)
      if uri.path.to_s.strip.empty? || uri.path == '/'
        uri = URI.join(uri.to_s.chomp('/'), '/documents/upload')
      end

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'

      request = Net::HTTP::Post.new(uri.request_uri)
      request['accept'] = 'application/json'
      # Asegurar prefijo Bearer si falta
      auth_token = cfg[:token].to_s.strip
      request['Authorization'] = auth_token.start_with?('Bearer ') ? auth_token : "Bearer #{auth_token}"
      request['X-API-Key'] = cfg[:api_key]

      request.set_form(
        [['file', file.tempfile, { filename: file.original_filename, 'Content-Type' => file.content_type }]],
        'multipart/form-data'
      )

      res = http.request(request)
      body = res.body.to_s
      json_body = begin
        body.empty? ? {} : JSON.parse(body)
      rescue StandardError
        { 'raw_body' => body }
      end

      unless res.is_a?(Net::HTTPSuccess)
        Rails.logger.error("[Documentos] LightRAG devolvio #{res.code} body=#{json_body.inspect}")
        return { error: "LightRAG devolvio #{res.code}", body: json_body, status: res.code.to_i }
      end

      json_body.symbolize_keys.merge(status: res.code.to_i)
    end
  end
end
