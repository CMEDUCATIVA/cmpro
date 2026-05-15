require 'base64'
require 'json'
require 'net/http'
require 'securerandom'
require 'uri'

module IaColaborativa
  module SaraTools
    class RagService
      class << self
        def query(message, thread_id: nil)
          return { success: false, response: nil, error: 'cm-agent no configurado' } unless base_url.present?

          Rails.logger.info "[SaraTools::RagService] query start thread_id=#{thread_id} base_url=#{base_url}"
          uri = URI("#{base_url}/rag-assistant/invoke")
          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = (uri.scheme == 'https')
          http.open_timeout = 5
          http.read_timeout = 45

          request = Net::HTTP::Post.new(uri.request_uri, headers)
          request.body = {
            message: build_rag_prompt(message),
            thread_id: thread_id.presence || SecureRandom.uuid,
            user_id: 'sara-tools-rag'
          }.to_json

          response = http.request(request)
          if response.code.to_i == 200
            payload = JSON.parse(response.body) rescue {}
            content = payload['content'].to_s.strip
            Rails.logger.info "[SaraTools::RagService] query ok content=#{content.length} chars"
            return { success: false, response: nil, error: 'cm-agent RAG sin contenido' } if content.blank?

            { success: true, response: content }
          else
            Rails.logger.warn "[SaraTools::RagService] query error http=#{response.code} body=#{response.body.to_s[0..300]}"
            { success: false, response: nil, error: "HTTP #{response.code}" }
          end
        rescue StandardError => e
          Rails.logger.error "[SaraTools::RagService] query exception=#{e.class} #{e.message}"
          { success: false, response: nil, error: e.message }
        end

        private

        def build_rag_prompt(message)
          <<~PROMPT
            Recupera contexto relevante para responder esta consulta desde la base de conocimiento.
            Responde solo con informacion util para el agente. No saludes y no inventes datos.

            Consulta:
            #{message}
          PROMPT
        end

        def base_url
          setting = ::IaColaborativa::McpSetting.first rescue nil
          setting&.url.presence.to_s.chomp('/')
        end

        def headers
          result = {
            'Accept' => 'application/json',
            'Content-Type' => 'application/json'
          }

          auth = auth_header
          result['Authorization'] = auth if auth.present?
          result
        end

        def auth_header
          basic = basic_auth
          return "Basic #{basic}" if basic.present?
          return nil unless ENV['AUTH_SECRET'].present?

          "Bearer #{ENV['AUTH_SECRET']}"
        end

        def basic_auth
          setting = ::IaColaborativa::McpSetting.first rescue nil
          username = setting&.username.presence || ENV['MCP_SERVER_USERNAME']
          password = setting&.password.presence || ENV['MCP_SERVER_PASSWORD']
          return nil unless username.present? && password.present?

          Base64.strict_encode64("#{username}:#{password}")
        end
      end
    end
  end
end
