module IaColaborativa
  # ============================================================================
  # 🐛 DEBUG SERVICE - MÓDULO DE DEPURACIÓN Y LOGGING
  # ============================================================================
  #
  # Propósito:
  # - Capturar logs de todas las conversaciones
  # - Rastrear estado del sistema en tiempo real
  # - Proporcionar información de depuración para todos los agentes
  # - Almacenar historial de consultas y respuestas
  #
  class DebugService
    class << self

      # ============================================================================
      # ALMACENAMIENTO EN MEMORIA (Sessión)
      # ============================================================================

      # Límite de logs en memoria
      MAX_LOGS = 2000
      MAX_CONVERSATION_ENTRIES = 1000

      # Inicializar variables de instancia
      def logs
        @logs ||= []
      end

      def conversation_history
        @conversation_history ||= []
      end

      def mutex
        @mutex ||= begin
          # Inicialización segura del mutex
          Thread.main[:debug_service_mutex] ||= Mutex.new
        end
      end

      # ============================================================================
      # LOGGING DE EVENTOS
      # ============================================================================

      # Log general de evento
      def log_event(event_type, agent_name, data = {})
        mutex.synchronize do
          entry = {
            timestamp: Time.current.iso8601,
            event_type: event_type,
            agent_name: agent_name,
            data: data
          }

          logs << entry

          # Limitar tamaño
          logs.shift if logs.size > MAX_LOGS

          Rails.logger.debug "[DebugService] #{event_type} - #{agent_name}: #{data.inspect}"
        end
      end

      # Log de consulta de usuario
      def log_user_query(agent_name, message, user_id = nil)
        log_event('user_query', agent_name, {
          message: message,
          user_id: user_id,
          message_length: message.length
        })
      end

      # Log de llamada a MCP - VERSIÓN MEJORADA CON DATOS COMPLETOS
      def log_mcp_call(endpoint, params, result, include_full_data: false)
        log_data = {
          endpoint: endpoint,
          params: params,
          success: result[:success],
          error: result[:error],
          data_size: result[:data]&.to_json&.size
        }

        # Si es exitoso y tiene datos, agregar información detallada
        if result[:success] && result[:data]
          data = result[:data]

          # Información de colección
          if data['_embedded'] && data['_embedded']['elements']
            elements = data['_embedded']['elements']
            total = data['total'] || elements.size

            log_data[:collection_info] = {
              total_elements: total,
              page_elements: elements.size,
              sample_elements: elements.first(5).map { |e|
                { id: e['id'], name: e['name'] || e['identifier'] || 'Sin nombre' }
              }
            }

            # Incluir datos completos si se solicita
            if include_full_data
              log_data[:full_data] = data
            end
          end

          # Si es un proyecto individual, mostrar detalles
          if data['id'] && data['name']
            log_data[:project_details] = {
              id: data['id'],
              name: data['name'],
              identifier: data['identifier'],
              status: data['status']
            }

            # Incluir datos completos si se solicita
            if include_full_data
              log_data[:full_data] = data
            end
          end
        end

        log_event('mcp_call', 'McpService', log_data)
      end

      # Log de llamada a IA (Gemini) - VERSIÓN MEJORADA CON DATOS COMPLETOS
      def log_ai_call(agent_name, model, prompt_size, response_size, success, full_data = {})
        log_event('ai_call', agent_name, {
          model: model,
          prompt_size: prompt_size,
          response_size: response_size,
          success: success,
          # Datos completos del request
          system_prompt: full_data[:system_prompt],
          user_prompt: full_data[:user_prompt],
          # Datos completos del response
          ai_response: full_data[:ai_response],
          # Metadatos adicionales
          temperature: full_data[:temperature],
          max_tokens: full_data[:max_tokens],
          request_time_ms: full_data[:request_time_ms]
        })
      end

      # Log de handler delegation
      def log_handler_delegation(handler_name, message, result)
        log_event('handler_delegation', handler_name, {
          message: message,
          success: result[:success],
          data_count: result[:data].is_a?(Hash) ? result[:data].dig('_embedded', 'elements')&.size : nil
        })
      end

      # Log de respuesta del agente
      def log_agent_response(agent_name, message, response, processing_time)
        log_event('agent_response', agent_name, {
          query: message,
          response_length: response&.length || 0,
          processing_time_ms: processing_time
        })
      end

      # ============================================================================
      # CONVERSACIÓN
      # ============================================================================

      # Registrar entrada de conversación completa
      # Nota: evitamos deadlock porque log_event usa el mismo mutex; por eso log_event va fuera del bloque sincronizado.
      def log_conversation_entry(agent_name, user_message, agent_response, metadata = {})
        entry = {
          timestamp: Time.current.iso8601,
          agent_name: agent_name,
          user_message: user_message,
          agent_response: agent_response,
          metadata: metadata
        }

        mutex.synchronize do
          conversation_history << entry
          conversation_history.shift if conversation_history.size > MAX_CONVERSATION_ENTRIES
        end

        # Guardar también como evento para visibilidad en el panel aunque se reinicie el servicio
        log_event('conversation', agent_name, entry)
      end

      # ============================================================================
      # OBTENER ESTADO DEL SISTEMA
      # ============================================================================

      # Estado completo del sistema
      def get_system_state
        mutex.synchronize do
          {
            timestamp: Time.current.iso8601,
            configuration: get_configuration_state,
            services: get_services_state,
            recent_logs: logs.last(50),
            recent_sara_obra_logs: logs.select { |log| log[:agent_name] == 'SaraIA Obra' }.last(10),
            conversation_history: conversation_history.last(20),
            statistics: get_statistics_unsafe
          }
        end
      end

      # Estado de configuración
      def get_configuration_state
        # Tomar configuración persistida cuando exista; caer a variables de entorno como respaldo
        provider_cfg = IaColaborativa::BaseAgent.provider_config
        mcp_cfg = (IaColaborativa::McpSetting.first rescue nil)

        {
          mcp_server: {
            configured: mcp_cfg&.url.present? || ENV['MCP_SERVER_URL'].present?,
            url: mcp_cfg&.url || ENV['MCP_SERVER_URL'] || 'not_configured',
            authenticated: ENV['MCP_SERVER_USERNAME'].present?
          },
          ai_service: {
            configured: provider_cfg[:api_key].present? && provider_cfg[:base_url].present?,
            provider: provider_cfg[:provider] || 'not_configured',
            base_url: provider_cfg[:base_url] || 'not_configured',
            model: IaColaborativa::BaseAgent.ai_model(provider_cfg)
          },
          lightrag: lightrag_config_state,
          agents: {
            sara_docs: 'SaraIA (Docs Agent)',
            sara_obra: 'SaraIA Obra (CDE Agent)'
          }
        }
      end

      # Estado de servicios
      def get_services_state
        {
          mcp_server: check_mcp_health,
          lightrag: check_lightrag_health,
          rails: {
            environment: Rails.env,
            version: Rails.version,
            uptime_seconds: Process.clock_gettime(Process::CLOCK_MONOTONIC).to_i
          }
        }
      end

      # Verificar salud de MCP
      def check_mcp_health
        return { available: false, error: 'not_configured' } unless ENV['MCP_SERVER_URL'].present?

        begin
          result = McpService.health_check
          {
            available: result[:healthy],
            status: result[:healthy] ? 'operational' : 'error',
            error: result[:error],
            data: result[:data]
          }
        rescue StandardError => e
          {
            available: false,
            status: 'error',
            error: e.message
          }
        end
      end

      # Verificar salud de LightRAG
      def check_lightrag_health
        cfg = lightrag_config_state
        return { available: false, error: 'not_configured' } unless cfg[:configured]

        begin
          uri = URI("#{cfg[:url]}/health")
          request = Net::HTTP::Get.new(uri)
          request['X-API-Key'] = cfg[:api_key] if cfg[:api_key].present?

          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = (uri.scheme == 'https')
          response = http.request(request)

          {
            available: response.code.to_i == 200,
            status: response.code.to_i == 200 ? 'operational' : 'error',
            error: (response.body if response.code.to_i != 200)
          }
        rescue StandardError => e
          {
            available: false,
            status: 'error',
            error: e.message
          }
        end
      end

      def lightrag_config_state
        setting = IaColaborativa::LightragSetting.singleton rescue nil
        url = setting&.url.presence || ENV['LIGHTRAG_URL'] || ENV['LIGHTRAG_API_URL']
        api_key = setting&.api_key.presence || ENV['LIGHTRAG_API_KEY']
        {
          configured: url.present?,
          url: url || 'not_configured',
          api_key: api_key
        }
      end

      # ============================================================================
      # ESTADÍSTICAS
      # ============================================================================

      # Obtener estadísticas de uso (con mutex)
      def get_statistics
        mutex.synchronize do
          get_statistics_unsafe
        end
      end

      # Obtener estadísticas sin mutex (para uso interno)
      def get_statistics_unsafe
        {
          total_logs: logs.size,
          total_conversations: conversation_history.size.zero? ? logs.count { |log| log[:event_type] == 'conversation' } : conversation_history.size,
          event_counts: logs.group_by { |log| log[:event_type] }
                             .transform_values(&:count),
          agent_usage: conversation_history.group_by { |entry| entry[:agent_name] }
                                            .transform_values(&:count),
          last_activity: logs.last&.dig(:timestamp) || 'never'
        }
      end

      # ============================================================================
      # CONSULTAS ESPECÍFICAS
      # ============================================================================

      # Obtener logs por tipo de evento
      def get_logs_by_type(event_type, limit = 50)
        mutex.synchronize do
          logs.select { |log| log[:event_type] == event_type }
               .last(limit)
        end
      end

      # Obtener logs por agente
      def get_logs_by_agent(agent_name, limit = 50)
        mutex.synchronize do
          logs.select { |log| log[:agent_name] == agent_name }
               .last(limit)
        end
      end

      # Obtener historial de conversación por agente
      def get_conversation_by_agent(agent_name, limit = 20)
        mutex.synchronize do
          conversation_history.select { |entry| entry[:agent_name] == agent_name }
                               .last(limit)
        end
      end

      # ============================================================================
      # LIMPIEZA
      # ============================================================================

      # Limpiar logs antiguos
      def clear_logs
        mutex.synchronize do
          logs.clear
          conversation_history.clear
        end

        Rails.logger.info "[DebugService] Logs limpiados"
      end

      # Limpiar logs de hace más de X horas
      def clear_old_logs(hours_ago = 24)
        mutex.synchronize do
          cutoff_time = Time.current - hours_ago.hours

          logs.reject! { |log| Time.parse(log[:timestamp]) < cutoff_time }
          conversation_history.reject! { |entry| Time.parse(entry[:timestamp]) < cutoff_time }
        end

        Rails.logger.info "[DebugService] Logs antiguos limpiados (>#{hours_ago}h)"
      end

    end

    # Método de inicialización para garantizar la creación del mutex
    def self.initialize_mutex
      mutex
    end
  end
end

# Llamar al método de inicialización al cargar el servicio
IaColaborativa::DebugService.initialize_mutex
