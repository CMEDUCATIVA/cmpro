require 'date'
require 'digest/sha1'
require 'json'
require 'net/http'
require 'uri'
require 'base64'
require_relative 'base_agent'
require_relative 'sara_tools/agent'

module IaColaborativa
  class SaraObraAgent < BaseAgent
    class << self
      AGENT_ID = 'openproject-agent'
      DEFAULT_MODEL = 'openai-compatible'
      HISTORY_LIMIT = 10
      MAX_HISTORY_CHARS = 2000
      MAX_MESSAGE_CHARS = 300

      def agent_name
        'SaraIA Obra'
      end

      def agent_icon
        'IA'
      end

      def chat(message, current_user_data = nil, project_payload = nil, _intent = :project, thread_id_override = nil, raw_response: false)
        question = message.to_s.strip
        return 'Por favor escribe tu consulta.' if question.empty?

        unless base_url.present?
          log_error 'Servidor MCP del CDE no configurado'
          return 'Configura el Servidor MCP del CDE en Ajustes para usar SaraIA Obra.'
        end

        user_name = extract_user_name(current_user_data)
        raw_user_id = extract_user_id(current_user_data, user_name)
        user_id = build_user_id(raw_user_id)
        thread_id = thread_id_override.to_s.strip.presence || build_thread_id(raw_user_id)

        full_history = wants_full_history?(question)
        history_context = nil
        if use_history_context?
          history_messages = fetch_history(thread_id)
          history_context = format_history_context(history_messages, full_history)
        end

        prompt = build_agent_prompt(
          question: question,
          user_name: user_name,
          history_context: history_context,
          full_history: full_history
        )

        invoke_result = invoke_agent_response(prompt, thread_id, user_id)
        ai_response = invoke_result[:response]
        tool_calls = invoke_result[:tool_calls]
        if ai_response.present?
          return {
            response: raw_response ? ai_response.to_s : format_response(ai_response),
            tool_calls: tool_calls,
            metadata: {
              provider: 'cm-agent',
              model: AGENT_ID,
              thread_id: thread_id,
              tool_calls_count: tool_calls&.length.to_i
            }
          }
        end

        log_error 'La IA no devolvio contenido'
        {
          response: 'Lo siento, no fue posible obtener datos en este momento.',
          tool_calls: tool_calls,
          metadata: {
            provider: 'cm-agent',
            model: AGENT_ID,
            thread_id: thread_id,
            tool_calls_count: tool_calls&.length.to_i
          }
        }
      rescue StandardError => e
        log_error "Error en SaraObraAgent.chat: #{e.class} - #{e.message}"
        {
          response: 'Hubo un error al consultar la inteligencia artificial.',
          tool_calls: [],
          metadata: {
            provider: 'cm-agent',
            model: AGENT_ID
          }
        }
      end

      private

      def base_url
        setting = IaColaborativa::McpSetting.first rescue nil
        setting&.url.presence.to_s.chomp('/')
      end

      def build_thread_id(user_id)
        date_key = Date.today.strftime('%Y%m%d')
        base = "thread:#{user_id}:#{date_key}"
        deterministic_uuid(base)
      end

      def build_user_id(user_id)
        base = "user:#{user_id}"
        deterministic_uuid(base)
      end

      def deterministic_uuid(value)
        hex = Digest::SHA1.hexdigest(value.to_s)[0, 32]
        "#{hex[0, 8]}-#{hex[8, 4]}-#{hex[12, 4]}-#{hex[16, 4]}-#{hex[20, 12]}"
      end

      def extract_user_name(current_user_data)
        return nil unless current_user_data.present?
        current_user_data['name'] || current_user_data[:name]
      end

      def extract_user_id(current_user_data, fallback_name)
        if current_user_data.present?
          current_user_data['id'] || current_user_data[:id] || fallback_name
        else
          fallback_name || 'anon'
        end
      end

      def extract_project_id(project_payload)
        return nil unless project_payload.present?
        payload = normalize_project_payload(project_payload)
        return nil unless payload.present?

        selection = payload['selection'] || payload[:selection]
        selection_id = selection&.[]('id') || selection&.[](:id)
        details_id = payload.dig('details', 'id') || payload.dig(:details, :id)
        selection_id || details_id
      end

      def normalize_project_payload(payload)
        return nil if payload.nil?
        return payload.to_h if payload.respond_to?(:to_h)
        payload.is_a?(Hash) ? payload : nil
      end

      def wants_full_history?(question)
        normalized = question.to_s.downcase
        normalized.include?('todo el historial') ||
          normalized.include?('historial completo') ||
          normalized.include?('ver todo el historial')
      end

      def use_history_context?
        ENV['IA_OBRA_USE_HISTORY'].to_s.downcase == 'true'
      end

      def fetch_history(thread_id)
        uri = URI("#{base_url}/history")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.read_timeout = 30
        http.open_timeout = 5

        request = Net::HTTP::Post.new(uri.path, history_headers)
        request.body = { thread_id: thread_id }.to_json

        response = http.request(request)
        return [] unless response.code.to_i == 200

        payload = JSON.parse(response.body) rescue {}
        messages = payload['messages']
        messages.is_a?(Array) ? messages : []
      rescue StandardError => e
        log_warn "No se pudo leer historial: #{e.class} - #{e.message}"
        []
      end

      def format_history_context(messages, full_history)
        return nil if messages.blank?
        filtered = messages.select { |m| m.is_a?(Hash) && %w[human ai].include?(m['type']) }
        slice = full_history ? filtered : filtered.last(HISTORY_LIMIT)
        return nil if slice.blank?

        lines = []
        lines << (full_history ? 'Historial completo:' : 'Historial reciente:')
        total_chars = lines.join("\n").length
        slice.each do |entry|
          label = entry['type'] == 'human' ? 'Usuario' : 'Agente'
          content = truncate_text(entry['content'].to_s.strip, MAX_MESSAGE_CHARS)
          next if content.empty?
          line = "#{label}: #{content}"
          break if (total_chars + line.length + 1) > MAX_HISTORY_CHARS
          lines << line
          total_chars += line.length + 1
        end
        return nil if lines.length <= 1
        lines.join("\n")
      end

      def build_agent_prompt(question:, user_name:, history_context:, full_history:)
        lines = []
        name_text = user_name.present? ? user_name : 'usuario'
        lines << "Mi nombre es #{name_text}."
        lines << history_context if history_context.present?
        lines << 'El usuario solicito ver todo el historial.' if full_history
        lines << "Consulta actual: #{question}"
        lines.join("\n\n")
      end

      def truncate_text(text, max_chars)
        return '' if text.blank?
        return text if text.length <= max_chars
        text[0, max_chars] + '...'
      end

      def stream_agent_response(prompt, thread_id, user_id)
        uri = URI("#{base_url}/#{AGENT_ID}/stream")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.read_timeout = 60
        http.open_timeout = 10

        request = Net::HTTP::Post.new(uri.request_uri, stream_headers)
        request.body = {
          message: prompt,
          model: DEFAULT_MODEL,
          thread_id: thread_id,
          user_id: user_id.to_s,
          stream_tokens: true
        }.to_json

        last_message = nil
        token_buffer = ''
        buffer = +''
        tool_calls = []

        http.request(request) do |response|
          if response.code.to_i >= 400
            log_error "Error stream HTTP #{response.code}: #{response.body.to_s[0..500]}"
            return { response: nil, tool_calls: [] }
          end

          response.read_body do |chunk|
            buffer << chunk
            while (line_end = buffer.index("\n"))
              line = buffer.slice!(0, line_end + 1)
              line = line.strip
              next if line.empty?
              next unless line.start_with?('data:')
              data = line.sub(/\Adata:\s?/, '')
              if data == '[DONE]'
                response_text = last_message.presence || token_buffer.presence
                return { response: response_text, tool_calls: tool_calls }
              end

              payload = JSON.parse(data) rescue nil
              next unless payload.is_a?(Hash)

              case payload['type']
              when 'message'
                content = payload['content']
                if content.is_a?(Hash) && content['type'] == 'ai'
                  text = content['content'].to_s
                  last_message = text if text.present?
                elsif content.is_a?(Hash) && content['type'] == 'tool'
                  tool_calls << normalize_tool_call(content['content'])
                end
              when 'token'
                token = payload['content'].to_s
                token_buffer << token if token.present?
              when 'error'
                log_error "Error stream: #{payload['content']}"
              end
            end
          end
        end

        response_text = last_message.presence || token_buffer.presence
        { response: response_text, tool_calls: tool_calls }
      rescue EOFError => e
        log_warn "Stream finalizado temprano: #{e.class} - #{e.message}"
        response_text = last_message.presence || token_buffer.presence
        { response: response_text, tool_calls: tool_calls }
      rescue StandardError => e
        log_error "Error en stream_agent_response: #{e.class} - #{e.message}"
        { response: nil, tool_calls: [] }
      end

      def invoke_agent_response(prompt, thread_id, user_id)
        uri = URI("#{base_url}/#{AGENT_ID}/invoke")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.read_timeout = 60
        http.open_timeout = 10

        headers = history_headers
        log_info "IA #{agent_name}: invoke -> #{uri} (auth=#{auth_strategy_label(headers)})"
        request = Net::HTTP::Post.new(uri.request_uri, headers)
        request.body = {
          message: prompt,
          thread_id: thread_id,
          user_id: user_id.to_s
        }.to_json

        response = http.request(request)
        unless response.code.to_i == 200
          log_error "Error invoke HTTP #{response.code}: #{response.body.to_s[0..500]}"
          return { response: nil, tool_calls: [] }
        end

        payload = JSON.parse(response.body) rescue {}
        content = payload.is_a?(Hash) ? payload['content'] : nil
        { response: content, tool_calls: [] }
      rescue StandardError => e
        log_error "Error en invoke_agent_response: #{e.class} - #{e.message}"
        { response: nil, tool_calls: [] }
      end

      def normalize_tool_call(content)
        raw = content.to_s
        parsed = JSON.parse(raw) rescue nil
        {
          raw: raw,
          parsed: parsed
        }
      end

      def stream_headers
        headers = {
          'Accept' => 'text/event-stream',
          'Content-Type' => 'application/json'
        }
        headers.merge(auth_header)
      end

      def history_headers
        headers = {
          'Accept' => 'application/json',
          'Content-Type' => 'application/json'
        }
        headers.merge(auth_header)
      end

      def auth_header
        basic = mcp_basic_auth
        return { 'Authorization' => "Basic #{basic}" } if basic.present?
        return {} unless ENV['AUTH_SECRET'].present?
        { 'Authorization' => "Bearer #{ENV['AUTH_SECRET']}" }
      end

      def mcp_basic_auth
        setting = IaColaborativa::McpSetting.first rescue nil
        username = setting&.username.presence || ENV['MCP_SERVER_USERNAME']
        password = setting&.password.presence || ENV['MCP_SERVER_PASSWORD']
        return nil unless username.present? && password.present?

        Base64.strict_encode64("#{username}:#{password}")
      end

      def auth_strategy_label(headers)
        return 'none' unless headers.is_a?(Hash)
        auth = headers['Authorization'].to_s
        return 'basic' if auth.start_with?('Basic ')
        return 'bearer' if auth.start_with?('Bearer ')
        'none'
      end
    end
  end
end
