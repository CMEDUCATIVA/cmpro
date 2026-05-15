require 'date'
require 'digest/sha1'
require 'json'
require 'net/http'
require 'uri'

require_relative '../base_agent'
require_relative 'conversation_memory'
require_relative 'event_collector'
require_relative 'registry'
require_relative 'rag_service'
require_relative 'reference_resolver'
require_relative 'session_runtime'

module IaColaborativa
  module SaraTools
    class Agent < ::IaColaborativa::BaseAgent
      class << self
        MAX_TOOL_ROUNDS = 6

        def agent_name
          'Sara'
        end

        def agent_icon
          'IA'
        end

        def temperature
          0.2
        end

        def system_prompt
          <<~PROMPT
            Eres Sara, asistente del CDE CMPROYECTOSBIM.

            Responsabilidades:
            - Responder en espanol, de forma clara, tecnica y accionable.
            - Usar tools cuando la respuesta dependa de datos del CDE.
            - Usar el contexto RAG solo como apoyo documental.
            - Si falta un proyecto para operar, pides el proyecto exacto antes de ejecutar acciones.
            - No inventas IDs, estados, usuarios ni paquetes de trabajo.
            - Si ejecutas una accion de creacion, confirmas el resultado con los IDs reales devueltos por la tool.

            Reglas:
            - Prioriza datos reales del CDE por encima del contexto RAG.
            - Si el contexto RAG es insuficiente o no esta disponible, continua con los datos operativos.
            - Resume lo importante y evita repetir el resultado crudo de las tools.
            - Cuando una tool falle, explica el error de forma simple y propone el siguiente paso.
          PROMPT
        end

        def chat(message, current_user_data = nil, project_payload = nil, _intent = :general, thread_id_override = nil, turn_id_override = nil)
          question = message.to_s.strip
          return 'Por favor escribe tu consulta.' if question.blank?

          unless api_key_configured?
            log_error 'Proveedor IA no configurado (API key ausente)'
            return {
              response: 'Configura un proveedor de IA en Ajustes > General para usar Sara.',
              tool_calls: [],
              metadata: { provider: provider_config[:provider], model: ai_model(provider_config) }
            }
          end

          context = build_context(current_user_data, project_payload, thread_id_override)
          session_state = ::IaColaborativa::SaraTools::SessionRuntime.load(
            user_id: context[:user_id],
            thread_id: context[:thread_id]
          )
          if context[:project_id].blank? && session_state[:active_project_id].present?
            context[:project_id] = session_state[:active_project_id]
            log_info "[sara-tools] session_state activo project_id=#{context[:project_id]}"
          end

          collector = ::IaColaborativa::SaraTools::EventCollector.new(
            agent: 'sara_tools',
            thread_id: context[:thread_id],
            user_id: context[:user_id],
            project_id: context[:project_id],
            turn_id: turn_id_override
          )
          collector.start_turn
          collector.status('Analizando la solicitud', query: truncate_text(question, 160))
          collector.update_turn(
            query: question,
            provider: provider_config[:provider],
            model: ai_model(provider_config),
            status: 'running'
          )
          log_info "[sara-tools] inicio chat thread_id=#{context[:thread_id]} user_id=#{context[:user_id]} project_id=#{context[:project_id] || 'nil'}"
          log_info "[sara-tools] consulta=#{truncate_text(question, 300)}"

          simple_response = simple_conversation_response(question, context)
          if simple_response.present?
            collector.status('Respondiendo sin tools', mode: 'conversational_fast_path')
            collector.assistant_message('Respuesta conversacional generada', response_chars: simple_response.length)
            ::IaColaborativa::SaraTools::SessionRuntime.update_from_turn(
              user_id: context[:user_id],
              thread_id: context[:thread_id],
              project_id: context[:project_id],
              question: question,
              executed_tools: [],
              final_response: simple_response
            )
            collector.update_turn(
              response: format_response(simple_response),
              response_mode: 'conversational_fast_path',
              rag_used: false,
              tool_calls_count: 0
            )
            collector.finish_turn('Turno completado', tool_calls_count: 0, rag_used: false, response_mode: 'conversational_fast_path')
            log_info "[sara-tools] fast_path=conversational respuesta=#{simple_response.length} chars"
            return {
              response: format_response(simple_response),
              tool_calls: [],
              events: collector.events,
              turn_meta: collector.turn_meta,
              metadata: {
                provider: provider_config[:provider],
                model: ai_model(provider_config),
                thread_id: context[:thread_id],
                project_id: context[:project_id],
                rag_used: false,
                tool_calls_count: 0,
                response_mode: 'conversational_fast_path',
                agent_runtime: 'sara-tools'
              }
            }
          end

          conversation_memory = ::IaColaborativa::SaraTools::ConversationMemory.load(
            user_id: context[:user_id],
            thread_id: context[:thread_id],
            current_query: question,
            session_state: session_state
          )
          if conversation_memory[:summary].present?
            log_info(
              "[sara-tools] conversation_memory turns=#{conversation_memory[:turns_count]} " \
              "source=#{conversation_memory[:source]} reusable=#{conversation_memory[:reusable_context].present?}"
            )
            collector.reasoning(
              'Cargando memoria conversacional',
              summary: conversation_memory[:summary],
              round: 0
            )
          end
          session_summary = ::IaColaborativa::SaraTools::SessionRuntime.summary(session_state)
          if session_summary.present?
            collector.reasoning(
              'Cargando estado de sesion',
              summary: session_summary,
              round: 0
            )
          end
          reference_resolution = ::IaColaborativa::SaraTools::ReferenceResolver.resolve(
            question: question,
            context: context,
            session_state: session_state,
            conversation_memory: conversation_memory
          )
          if reference_resolution[:semantic_answer].present?
            final_response = reference_resolution[:semantic_answer]
            collector.reasoning(
              'Aplicando memoria semantica',
              summary: reference_resolution[:summary],
              round: 0
            )
            ::IaColaborativa::SaraTools::SessionRuntime.update_from_turn(
              user_id: context[:user_id],
              thread_id: context[:thread_id],
              project_id: context[:project_id],
              question: question,
              executed_tools: [],
              final_response: final_response
            )
            collector.assistant_message('Respuesta final generada', response_chars: final_response.length)
            collector.update_turn(
              response: format_response(final_response),
              rag_used: false,
              tool_calls_count: 0
            )
            collector.finish_turn('Turno completado', tool_calls_count: 0, rag_used: false)
            log_info "[sara-tools] semantic_memory respuesta=#{final_response.length} chars"
            return {
              response: format_response(final_response),
              tool_calls: [],
              events: collector.events,
              turn_meta: collector.turn_meta,
              metadata: {
                provider: provider_config[:provider],
                model: ai_model(provider_config),
                thread_id: context[:thread_id],
                project_id: context[:project_id],
                rag_used: false,
                tool_calls_count: 0,
                response_mode: 'semantic_memory',
                agent_runtime: 'sara-tools'
              }
            }
          end
          if reference_resolution[:project_id].present? && context[:project_id].blank?
            context[:project_id] = reference_resolution[:project_id]
            log_info(
              "[sara-tools] reference_resolution source=#{reference_resolution[:source]} " \
              "project_id=#{reference_resolution[:project_id]} project_name=#{reference_resolution[:project_name].inspect}"
            )
          end
          if reference_resolution[:reusable_context].present? && conversation_memory[:reusable_context].blank?
            conversation_memory = conversation_memory.merge(reusable_context: reference_resolution[:reusable_context])
          end
          if reference_resolution[:summary].present?
            collector.reasoning(
              'Resolviendo referencias conversacionales',
              summary: reference_resolution[:summary],
              round: 0
            )
          end

          context_summary = reasoning_summary_for_context(question, context, conversation_memory)
          log_info "[sara-tools] reasoning context summary=#{truncate_text(context_summary, 220)}"
          collector.reasoning(
            'Evaluando necesidad de contexto',
            summary: context_summary,
            round: 0
          )
          if conversation_memory[:reusable_context].present?
            log_info(
              "[sara-tools] conversation_memory reuse kind=#{conversation_memory[:reusable_context][:kind]} " \
              "source_turn_id=#{conversation_memory[:reusable_context][:source_turn_id]}"
            )
            collector.reasoning(
              'Reutilizando contexto conversacional',
              summary: "Se reutiliza contexto reciente del turno #{conversation_memory[:reusable_context][:source_turn_id]} antes de consultar otras fuentes.",
              round: 0
            )
          end

          rag_context = if should_fetch_rag?(question, conversation_memory)
                          fetch_rag_context(question, context[:thread_id], collector)
                        else
                          nil
                        end
          log_info "[sara-tools] rag_context=#{rag_context.present? ? "si (#{rag_context.length} chars)" : 'no'}"

          messages = initial_messages(question, context, rag_context, conversation_memory, session_state)
          executed_tools = []
          final_response = nil

          MAX_TOOL_ROUNDS.times do |round_index|
            round_summary = reasoning_summary_for_round(
              round_index: round_index,
              rag_context: rag_context,
              executed_tools: executed_tools,
              context: context,
              conversation_memory: conversation_memory
            )
            log_info "[sara-tools] reasoning round=#{round_index + 1} summary=#{truncate_text(round_summary, 220)}"
            collector.reasoning(
              "Evaluando siguiente paso (round #{round_index + 1})",
              messages_count: messages.length,
              round: round_index + 1,
              summary: round_summary
            )
            log_info "[sara-tools] round=#{round_index + 1} enviando mensajes_al_llm=#{messages.length}"
            assistant_message = request_llm(messages)
            break unless assistant_message.is_a?(Hash)

            tool_calls = assistant_message['tool_calls']
            if tool_calls.is_a?(Array) && tool_calls.any?
              log_info "[sara-tools] round=#{round_index + 1} tool_calls=#{tool_calls.length}"
              tool_phase_summary = reasoning_summary_for_tool_phase(tool_calls, executed_tools)
              log_info "[sara-tools] reasoning tool_phase round=#{round_index + 1} summary=#{truncate_text(tool_phase_summary, 220)}"
              collector.reasoning(
                "Planificando ejecución (round #{round_index + 1})",
                round: round_index + 1,
                summary: tool_phase_summary
              )
              collector.status("Ejecutando #{tool_calls.length} tool(s)", round: round_index + 1, tool_calls: tool_calls.length)
              messages << {
                role: 'assistant',
                content: assistant_message['content'],
                tool_calls: tool_calls
              }

              tool_calls.each do |tool_call|
                tool_result = execute_tool_call(tool_call, context, collector)
                executed_tools << tool_result
                success = tool_result.dig(:result, :success)
                log_info "[sara-tools] tool name=#{tool_result[:name]} success=#{success.inspect}"
                messages << {
                  role: 'tool',
                  tool_call_id: tool_call['id'],
                  content: JSON.generate(tool_result[:result] || {})
                }
              end
              next
            end

            final_response = assistant_message['content'].to_s.strip
            response_summary = reasoning_summary_for_response(rag_context, executed_tools, context, conversation_memory)
            log_info "[sara-tools] reasoning response round=#{round_index + 1} summary=#{truncate_text(response_summary, 220)}"
            collector.reasoning(
              "Preparando respuesta final (round #{round_index + 1})",
              round: round_index + 1,
              summary: response_summary
            )
            log_info "[sara-tools] round=#{round_index + 1} respuesta_final_llm=#{final_response.present? ? "#{final_response.length} chars" : 'vacia'}"
            collector.assistant_message('Respuesta final generada', response_chars: final_response.length)
            break if final_response.present?
          end

          final_response = fallback_response(question, rag_context, context) if final_response.blank?
          ::IaColaborativa::SaraTools::SessionRuntime.update_from_turn(
            user_id: context[:user_id],
            thread_id: context[:thread_id],
            project_id: context[:project_id],
            question: question,
            executed_tools: executed_tools,
            final_response: final_response,
            project_name: reference_resolution && reference_resolution[:project_name]
          )
          collector.update_turn(
            response: format_response(final_response),
            rag_used: rag_context.present?,
            tool_calls_count: executed_tools.length
          )
          collector.finish_turn('Turno completado', tool_calls_count: executed_tools.length, rag_used: rag_context.present?)
          log_info "[sara-tools] fin chat tool_calls_total=#{executed_tools.length} respuesta=#{final_response.to_s.length} chars"

          {
            response: format_response(final_response),
            tool_calls: executed_tools,
            events: collector.events,
            turn_meta: collector.turn_meta,
            metadata: {
              provider: provider_config[:provider],
              model: ai_model(provider_config),
              thread_id: context[:thread_id],
              project_id: context[:project_id],
              rag_used: rag_context.present?,
              tool_calls_count: executed_tools.length,
              agent_runtime: 'sara-tools'
            }
          }
        rescue StandardError => e
          log_error "Error en SaraTools::Agent.chat: #{e.class} - #{e.message}"
          {
            response: 'Hubo un error al procesar la solicitud en Sara.',
            tool_calls: [],
            metadata: {
              provider: provider_config[:provider],
              model: ai_model(provider_config),
              error_class: e.class.name,
              error_message: e.message,
              agent_runtime: 'sara-tools'
            }
          }
        end

        private

        def build_context(current_user_data, project_payload, thread_id_override)
          user_name = current_user_data&.dig('name') || current_user_data&.dig(:name)
          raw_user_id = current_user_data&.dig('id') || current_user_data&.dig(:id) || user_name || 'anon'
          project_id = extract_project_id(project_payload)

          {
            current_user: current_user_data,
            user_name: user_name,
            user_id: raw_user_id,
            project_id: project_id,
            thread_id: thread_id_override.to_s.strip.presence || deterministic_uuid("thread:user:#{raw_user_id}")
          }
        end

        def extract_project_id(project_payload)
          return nil unless project_payload.present?

          payload = project_payload.respond_to?(:to_h) ? project_payload.to_h : project_payload
          return nil unless payload.is_a?(Hash)

          selection = payload['selection'] || payload[:selection] || {}
          selection['id'] || selection[:id]
        end

        def deterministic_uuid(value)
          hex = Digest::SHA1.hexdigest(value.to_s)[0, 32]
          "#{hex[0, 8]}-#{hex[8, 4]}-#{hex[12, 4]}-#{hex[16, 4]}-#{hex[20, 12]}"
        end

        def fetch_rag_context(question, thread_id, collector = nil)
          log_info "[sara-tools] consultando RAG remoto thread_id=#{thread_id}"
          collector&.rag_started(meta: { thread_id: thread_id })
          result = ::IaColaborativa::SaraTools::RagService.query(question, thread_id: thread_id)
          unless result[:success]
            log_warn "[sara-tools] RAG no disponible error=#{result[:error]}"
            collector&.rag_failed(meta: { error: result[:error] })
            return nil
          end

          collector&.rag_finished(meta: { chars: result[:response].to_s.length })
          result[:response].to_s.strip.presence
        end

        def initial_messages(question, context, rag_context, conversation_memory, session_state)
          [
            { role: 'system', content: system_prompt },
            { role: 'user', content: build_user_prompt(question, context, rag_context, conversation_memory, session_state) }
          ]
        end

        def build_user_prompt(question, context, rag_context, conversation_memory, session_state)
          parts = []
          if context[:user_name].present?
            parts << "Usuario actual: #{context[:user_name]} (ID: #{context[:user_id]})"
          elsif context[:user_id].present?
            parts << "Usuario actual ID: #{context[:user_id]}"
          end

          if context[:project_id].present?
            parts << "Proyecto seleccionado ID: #{context[:project_id]}"
          else
            parts << 'Proyecto seleccionado: ninguno'
          end

          parts << ::IaColaborativa::SaraTools::SessionRuntime.prompt_text(session_state) if session_state.present?
          parts << conversation_memory[:prompt_text] if conversation_memory[:prompt_text].present?
          parts << "Contexto RAG remoto:\n#{rag_context}" if rag_context.present?
          parts << "Consulta actual: #{question}"
          parts.join("\n\n")
        end

        def simple_conversation_response(question, context)
          normalized = question.to_s.downcase.strip
          return nil if normalized.blank?

          user_name = context[:user_name].presence || 'Hola'

          if normalized.match?(/\A(hola|holi|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hey|hello)\z/)
            return "Hola, #{user_name}. Puedo ayudarte con proyectos, paquetes de trabajo, usuarios y acciones dentro de CMPROYECTOSBIM. Si quieres operar sobre un proyecto, indícame el nombre o el ID."
          end

          if normalized.match?(/\A(gracias|muchas gracias|ok gracias|perfecto gracias)\z/)
            return "De nada, #{user_name}. Cuando quieras seguimos."
          end

          if normalized.match?(/\A(como estas|como vas|que haces|quien eres)\z/)
            return 'Soy Sara, tu asistente para CMPROYECTOSBIM. Puedo conversar contigo y, cuando hace falta, consultar contexto remoto o ejecutar tools del CDE.'
          end

          nil
        end

        def truncate_text(text, max_len)
          return '' if text.nil?

          content = text.to_s.strip
          content.length > max_len ? "#{content[0...max_len]}..." : content
        end

        def reasoning_summary_for_context(question, context, conversation_memory = nil)
          return 'Analizando una consulta conversacional antes de responder.' if simple_conversation_candidate?(question)
          if conversation_memory&.dig(:reusable_context).present?
            return 'Hay contexto conversacional reciente reutilizable; evaluando si basta para responder sin repetir consultas.'
          end
          if context[:project_id].present?
            return "Hay un proyecto activo en sesion (ID: #{context[:project_id]}). Evaluando si necesito contexto documental adicional."
          end
          return 'No hay proyecto seleccionado; verificando si puedo responder o si debo pedir contexto adicional.' if context[:project_id].blank?

          "Hay un proyecto seleccionado (ID: #{context[:project_id]}). Evaluando si necesito contexto documental adicional."
        end

        def reasoning_summary_for_round(round_index:, rag_context:, executed_tools:, context:, conversation_memory: nil)
          if round_index.zero?
            if conversation_memory&.dig(:reusable_context).present?
              return 'Existe memoria operativa reciente del mismo usuario; validando si ese contexto resuelve la consulta actual.'
            end
            return 'Con contexto remoto disponible, validando si basta para responder o si hace falta consultar datos operativos.' if rag_context.present?
            return 'Sin contexto remoto, evaluando si debo consultar tools del CDE para responder con datos reales.' if context[:project_id].present?

            return 'Sin contexto remoto ni proyecto seleccionado, evaluando si debo pedir precisión al usuario o responder de forma general.'
          end

          "Ya se ejecutaron #{executed_tools.length} tool(s); revisando si la información acumulada permite cerrar la respuesta."
        end

        def reasoning_summary_for_tool_phase(tool_calls, executed_tools)
          tool_names = Array(tool_calls).map { |call| call.dig('function', 'name').to_s }.reject(&:blank?)
          names_text = tool_names.first(3).join(', ')
          base = tool_names.any? ? "Se decidió usar #{tool_names.length} tool(s): #{names_text}." : 'Se decidió usar tools operativas.'
          if executed_tools.any?
            "#{base} Ya existe información previa de #{executed_tools.length} tool(s), así que se validará consistencia antes de responder."
          else
            "#{base} Esta es la primera consulta operativa del turno."
          end
        end

        def reasoning_summary_for_response(rag_context, executed_tools, context, conversation_memory = nil)
          if conversation_memory&.dig(:reusable_context).present? && executed_tools.blank? && rag_context.blank?
            return 'Reutilizando la memoria conversacional reciente para responder con continuidad y sin repetir consultas.'
          end
          return 'Integrando resultados operativos y contexto documental en una respuesta final clara.' if rag_context.present? && executed_tools.any?
          return 'Consolidando los resultados de las tools en una respuesta final para el usuario.' if executed_tools.any?
          return 'Transformando el contexto documental recuperado en una respuesta final comprensible.' if rag_context.present?
          return 'Sin datos adicionales del sistema, preparando una respuesta general y segura.' if context[:project_id].blank?

          'Preparando una respuesta final con la información disponible del contexto actual.'
        end

        def should_fetch_rag?(question, conversation_memory)
          reusable_context = conversation_memory[:reusable_context]
          return true if reusable_context.blank?

          normalized = question.to_s.downcase
          if reusable_context[:kind] == 'projects_list' && normalized.include?('lista') && normalized.include?('proyectos')
            log_info "[sara-tools] saltando RAG por memoria conversacional reutilizable kind=#{reusable_context[:kind]}"
            return false
          end

          true
        end

        def simple_conversation_candidate?(question)
          normalized = question.to_s.downcase.strip
          return false if normalized.blank?

          normalized.match?(/\A(hola|holi|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hey|hello|gracias|muchas gracias|ok gracias|perfecto gracias|como estas|como vas|que haces|quien eres)\z/)
        end

        def request_llm(messages)
          cfg = provider_config
          log_info "[sara-tools] request_llm provider=#{cfg[:provider] || 'nil'} model=#{ai_model(cfg)} tools=#{::IaColaborativa::SaraTools::Registry.definitions.length}"
          uri = URI("#{cfg[:base_url]}/chat/completions")
          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = (uri.scheme == 'https')
          http.open_timeout = 10
          http.read_timeout = 60

          request = Net::HTTP::Post.new(uri.path, {
            'Content-Type' => 'application/json',
            'Authorization' => "Bearer #{cfg[:api_key]}"
          })
          request.body = {
            model: ai_model(cfg),
            messages: messages,
            tools: ::IaColaborativa::SaraTools::Registry.definitions,
            tool_choice: 'auto',
            temperature: temperature,
            max_tokens: max_tokens(cfg)
          }.to_json

          response = http.request(request)
          unless response.code.to_i == 200
            log_error "[sara-tools] request_llm error http=#{response.code} body=#{response.body.to_s[0..500]}"
            raise "LLM HTTP #{response.code}: #{response.body.to_s[0..500]}"
          end

          payload = JSON.parse(response.body)
          message = payload.dig('choices', 0, 'message') || {}
          log_info "[sara-tools] request_llm ok tool_calls=#{message['tool_calls']&.length.to_i} content=#{message['content'].to_s.length} chars"
          message
        end

        def execute_tool_call(tool_call, context, collector = nil)
          function = tool_call['function'] || {}
          name = function['name'].to_s
          arguments = parse_tool_arguments(function['arguments'])
          display_name = ::IaColaborativa::SaraTools::Registry.display_name(name)
          started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
          log_info "[sara-tools] ejecutando tool=#{name} args=#{arguments.inspect}"
          collector&.tool_started(name, display_name: display_name, arguments: arguments)
          result = ::IaColaborativa::SaraTools::Registry.execute(name, arguments, context)
          duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000).round
          log_info "[sara-tools] tool=#{name} resultado_success=#{result[:success].inspect}"
          if result[:success]
            collector&.tool_finished(name, display_name: display_name, arguments: arguments, result: result, duration_ms: duration_ms)
          else
            collector&.tool_failed(name, display_name: display_name, arguments: arguments, error: result[:error], duration_ms: duration_ms)
          end
          {
            id: tool_call['id'],
            name: name,
            display_name: display_name,
            arguments: arguments,
            result: result,
            duration_ms: duration_ms
          }
        end

        def parse_tool_arguments(raw_arguments)
          return {} if raw_arguments.blank?

          parsed = JSON.parse(raw_arguments) rescue {}
          parsed.is_a?(Hash) ? parsed : {}
        end

        def fallback_response(question, rag_context, context)
          if rag_context.present?
            return <<~TEXT
              No pude completar toda la respuesta con tools, pero este es el contexto disponible para tu consulta:

              #{rag_context}
            TEXT
          end

          if context[:project_id].blank?
            return "Necesito que selecciones un proyecto o me indiques el ID/nombre del proyecto para ayudarte con: #{question}"
          end

          'No pude completar la solicitud con los datos disponibles. Intenta reformular la consulta o especificar mejor la accion.'
        end
      end
    end
  end
end
