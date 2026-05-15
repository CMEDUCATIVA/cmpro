require 'net/http'
require 'json'
require_relative 'debug_service'

module IaColaborativa
  class BaseAgent
    class << self
      attr_accessor :last_ai_error

      # Configuración por agente
      def agent_name = 'BaseAgent'
      def agent_icon = 'IA'
      def temperature = 0.7

      # Tokens de salida permitidos para el modelo actual. Prioriza la configuraciÍn guardada.
      def max_tokens(cfg = provider_config)
        tokens = cfg[:max_tokens]
        tokens = tokens.to_i if tokens
        env_tokens = ENV['IA_MAX_TOKENS'] || ENV['OPENAI_MAX_TOKENS'] || ENV['LLM_MAX_TOKENS']
        env_tokens = env_tokens.to_i if env_tokens
        candidate = tokens.to_i.positive? ? tokens.to_i : env_tokens.to_i
        candidate.positive? ? candidate : 1000
      end
      def system_prompt
        raise NotImplementedError, 'Cada agente debe definir su propio system_prompt'
      end
      def chat(message)
        raise NotImplementedError, 'Cada agente debe implementar su método chat'
      end

      # Llamada HTTP al proveedor (OpenRouter/OpenAI/etc) usando la configuración guardada
      def call_openrouter_api(user_message, custom_system_prompt = nil, image_data = nil)
        cfg = provider_config
        unless cfg[:api_key].present? && cfg[:base_url].present?
          Rails.logger.warn "#{agent_icon} #{agent_name} - Configuración de proveedor incompleta (api_key/base_url)"
          return nil
        end

        self.last_ai_error = nil
        start_time = Time.current
        uri = URI(cfg[:base_url] + '/chat/completions')

        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.open_timeout = 10
        http.read_timeout = 60

        request = Net::HTTP::Post.new(uri.path, {
          'Content-Type' => 'application/json',
          'Authorization' => "Bearer #{cfg[:api_key]}"
        })

        sys_prompt = custom_system_prompt || system_prompt

        user_content = if image_data.present?
          [
            { type: 'text', text: user_message },
            { type: 'image_url', image_url: { url: image_data } }
          ]
        else
          user_message
        end

        selected_model = image_data.present? ? ai_vision_model(cfg) : ai_model(cfg)

        request.body = {
          model: selected_model,
          messages: [
            { role: 'system', content: sys_prompt },
            { role: 'user', content: user_content }
          ],
          temperature: temperature,
          max_tokens: max_tokens(cfg)
        }.to_json

        Rails.logger.info "#{agent_icon} #{agent_name} - Enviando request"
        Rails.logger.info "   Proveedor: #{cfg[:provider] || 'desconocido'}"
        Rails.logger.info "   Modelo: #{selected_model}"
        Rails.logger.info "   Con imagen: #{image_data.present?}"
        Rails.logger.info "   Tamaño imagen: #{image_data&.bytesize || 0} bytes" if image_data.present?
        DebugService.log_event('ai_provider', agent_name, {
          provider: cfg[:provider],
          base_url: cfg[:base_url],
          model: selected_model,
          with_image: image_data.present?
        })

        response = http.request(request)
        request_time_ms = ((Time.current - start_time) * 1000).to_i
        Rails.logger.info "#{agent_icon} #{agent_name} - Respuesta: HTTP #{response.code} en #{request_time_ms}ms"

        if response.code.to_i == 200
          data = JSON.parse(response.body)
          ai_response = data.dig('choices', 0, 'message', 'content')
          self.last_ai_error = nil

          Rails.logger.info "OK #{agent_name} - Contenido recibido: #{ai_response ? "#{ai_response.length} chars" : 'NIL'}"
          if ai_response.nil?
            Rails.logger.error "Respuesta válida (HTTP 200) pero sin contenido"
            Rails.logger.error "   Response body: #{response.body[0..500]}"
            self.last_ai_error = {
              status: response.code,
              error: 'empty_content',
              provider: cfg[:provider],
              model: selected_model,
              base_url: cfg[:base_url],
              response_body: response.body[0..500]
            }
            IaColaborativa::DebugService.log_conversation_entry(
              agent_name,
              user_message,
              "ERROR: respuesta vacía del modelo",
              self.last_ai_error
            )
          end

          DebugService.log_ai_call(
            agent_name,
            selected_model,
            user_message.is_a?(String) ? user_message.length : 0,
            ai_response&.length || 0,
            true,
            {
              system_prompt: sys_prompt,
              user_prompt: user_message.is_a?(String) ? user_message : 'multimodal_content',
              ai_response: ai_response,
              temperature: temperature,
              max_tokens: max_tokens,
              request_time_ms: request_time_ms,
              with_image: image_data.present?
            }
          )

          ai_response
        else
          Rails.logger.error "Error #{agent_icon} #{agent_name} - API HTTP #{response.code}"
          Rails.logger.error "   Response body: #{response.body[0..1000]}"
          self.last_ai_error = { status: response.code, body: response.body[0..1000], provider: cfg[:provider], model: selected_model, base_url: cfg[:base_url] }

          # Log detallado de error en conversaciones para debug
          IaColaborativa::DebugService.log_conversation_entry(
            agent_name,
            user_message,
            "ERROR LLM HTTP #{response.code}",
            {
              provider: cfg[:provider],
              base_url: cfg[:base_url],
              model: selected_model,
              error: "HTTP #{response.code}",
              response_body: response.body[0..1000]
            }
          )

          DebugService.log_ai_call(
            agent_name,
            selected_model,
            user_message.length,
            0,
            false,
            {
              system_prompt: sys_prompt,
              user_prompt: user_message,
              ai_response: nil,
              temperature: temperature,
              max_tokens: max_tokens,
              request_time_ms: request_time_ms,
              error: "HTTP #{response.code}: #{response.body}"
            }
          )
          nil
        end
      rescue StandardError => e
        request_time_ms = ((Time.current - start_time) * 1000).to_i rescue 0
        Rails.logger.error "#{agent_icon} #{agent_name} - Error en call_openrouter_api: #{e.message}"
        self.last_ai_error = { error_class: e.class.name, error_message: e.message, provider: cfg[:provider], model: ai_model(cfg), base_url: cfg[:base_url] }
        DebugService.log_ai_call(
          agent_name,
          ai_model(cfg),
          user_message&.length || 0,
          0,
          false,
          {
            system_prompt: custom_system_prompt || system_prompt,
            user_prompt: user_message,
            ai_response: nil,
            temperature: temperature,
            max_tokens: max_tokens(cfg),
            request_time_ms: request_time_ms,
            error: e.message
          }
        )
        # Registrar evento de conversación con detalle del error
        IaColaborativa::DebugService.log_conversation_entry(
          agent_name,
          user_message,
          "ERROR: #{e.message}",
          {
            provider: cfg[:provider],
            base_url: cfg[:base_url],
            model: ai_model(cfg),
            error_class: e.class.name,
            error_message: e.message,
            error_type: 'exception'
          }
        )
        nil
      end

      # Formateo de respuestas
      def format_response(text)
        return "" if text.blank?
        cleaned = text.strip
        cleaned = cleaned.gsub(/^-([^\s])/, '- \1')
        cleaned = cleaned.gsub(/^(\d+)\.([^\s])/, '\1. \2')
        cleaned
      end

      # Configuración dinámica
      def api_key_configured?
        provider_config[:api_key].present?
      end

      def ai_model(cfg = provider_config)
        cfg[:model].presence || ENV['OPENAI_MODEL'] || ENV['LLM_MODEL'] || 'google/gemini-2.0-flash-exp:free'
      end

      def ai_vision_model(cfg = provider_config)
        cfg[:model].presence || ENV['OPENAI_VISION_MODEL'] || 'google/gemini-2.5-flash-image'
      end

      def provider_config
        setting = IaColaborativa::ProviderSetting.singleton rescue nil
        latest_provider = latest_present_setting_value(:provider)
        latest_base_url = latest_present_setting_value(:base_url)
        latest_api_key = latest_present_setting_value(:api_key)
        latest_model = latest_present_setting_value(:model)
        latest_max_tokens = latest_present_setting_value(:max_tokens)

        {
          provider: setting&.provider.presence || latest_provider,
          base_url: setting&.base_url.presence || latest_base_url || ENV['OPENAI_API_BASE'],
          api_key: setting&.api_key.presence || latest_api_key || ENV['OPENAI_API_KEY'],
          model: setting&.model.presence || latest_model,
          max_tokens: setting&.max_tokens.presence || latest_max_tokens
        }
      end

      def latest_present_setting_value(column)
        return nil unless IaColaborativa::ProviderSetting.respond_to?(:table_exists?) && IaColaborativa::ProviderSetting.table_exists?

        scope = if column.to_sym == :max_tokens
                  IaColaborativa::ProviderSetting.where.not(max_tokens: nil)
                else
                  IaColaborativa::ProviderSetting.where.not(column => [nil, ''])
                end

        scope.order(updated_at: :desc, id: :desc).pick(column)
      rescue StandardError
        nil
      end

      # Logging helpers
      def log_info(message) = Rails.logger.info "#{agent_icon} #{agent_name}: #{message}"
      def log_error(message) = Rails.logger.error "#{agent_icon} #{agent_name}: #{message}"
      def log_warn(message) = Rails.logger.warn "#{agent_icon} #{agent_name}: #{message}"
    end
  end
end
