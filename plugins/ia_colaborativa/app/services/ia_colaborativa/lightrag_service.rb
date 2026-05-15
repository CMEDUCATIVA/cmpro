require 'net/http'
require 'json'

module IaColaborativa
  class LightragService
    class << self
      # Consultar a LightRAG
      def query(message, mode: 'hybrid')
        unless lightrag_configured?
          Rails.logger.warn "LightRAG no configurado, usando respuesta demo"
          return { success: false, response: nil, error: 'LightRAG no configurado' }
        end

        begin
          uri = URI("#{base_url}/query")
          http = Net::HTTP.new(uri.host, uri.port)
          http.open_timeout = 5
          http.read_timeout = 30

          request = Net::HTTP::Post.new(uri.path, headers)
          request.body = {
            query: message,
            mode: mode, # 'naive', 'local', 'global', 'hybrid'
            only_need_context: false,
            only_need_prompt: false
          }.to_json

          response = http.request(request)

          if response.code.to_i == 200
            data = JSON.parse(response.body)
            { success: true, response: data['response'], context: data['context'] }
          else
            Rails.logger.error "LightRAG error: #{response.code} - #{response.body}"
            { success: false, response: nil, error: "Error #{response.code}" }
          end
        rescue StandardError => e
          Rails.logger.error "Error conectando a LightRAG: #{e.message}"
          { success: false, response: nil, error: e.message }
        end
      end

      # Consultar con streaming (para futuro)
      def query_stream(message, mode: 'hybrid', &block)
        unless lightrag_configured?
          return { success: false, error: 'LightRAG no configurado' }
        end

        begin
          uri = URI("#{base_url}/query/stream")
          http = Net::HTTP.new(uri.host, uri.port)
          http.read_timeout = 60

          request = Net::HTTP::Post.new(uri.path, headers)
          request.body = {
            query: message,
            mode: mode
          }.to_json

          http.request(request) do |response|
            response.read_body do |chunk|
              block.call(chunk) if block_given?
            end
          end

          { success: true }
        rescue StandardError => e
          Rails.logger.error "Error en streaming LightRAG: #{e.message}"
          { success: false, error: e.message }
        end
      end

      # Insertar texto en la base de conocimiento
      def insert_text(content, description: nil)
        unless lightrag_configured?
          return { success: false, error: 'LightRAG no configurado' }
        end

        begin
          uri = URI("#{base_url}/documents/text")
          http = Net::HTTP.new(uri.host, uri.port)
          
          request = Net::HTTP::Post.new(uri.path, headers)
          request.body = {
            text: content,
            description: description || "Documento desde CMPROYECTOS"
          }.to_json

          response = http.request(request)
          data = JSON.parse(response.body)

          { success: response.code.to_i == 200, data: data }
        rescue StandardError => e
          Rails.logger.error "Error insertando en LightRAG: #{e.message}"
          { success: false, error: e.message }
        end
      end

      # Verificar estado del servidor
      def health_check
        unless lightrag_configured?
          return { healthy: false, error: 'No configurado' }
        end

        begin
          uri = URI("#{base_url}/health")
          response = Net::HTTP.get_response(uri)
          
          { healthy: response.code.to_i == 200, status: response.body }
        rescue StandardError => e
          { healthy: false, error: e.message }
        end
      end

      # Obtener estadísticas de documentos
      def document_stats
        unless lightrag_configured?
          return { success: false, error: 'No configurado' }
        end

        begin
          uri = URI("#{base_url}/documents/status_counts")
          http = Net::HTTP.new(uri.host, uri.port)
          request = Net::HTTP::Get.new(uri.path, headers)
          
          response = http.request(request)
          data = JSON.parse(response.body)

          { success: true, stats: data }
        rescue StandardError => e
          Rails.logger.error "Error obteniendo stats: #{e.message}"
          { success: false, error: e.message }
        end
      end

      private

      def lightrag_configured?
        config[:url].present?
      end

      def base_url
        config[:url] || 'http://localhost:8020'
      end

      def headers
        headers = {
          'Content-Type' => 'application/json',
          'Accept' => 'application/json'
        }

        # Autenticación con X-API-Key
        if config[:api_key].present?
          headers['X-API-Key'] = config[:api_key]
        end

        headers
      end

      def config
        setting = IaColaborativa::LightragSetting.singleton rescue nil
        {
          url: setting&.url.presence || ENV['LIGHTRAG_URL'],
          api_key: setting&.api_key.presence || ENV['LIGHTRAG_API_KEY']
        }
      end
    end
  end
end
