module IaColaborativa
  module SaraTools
    class SessionRuntime
      class << self
        def load(user_id:, thread_id:, agent: 'sara_tools')
          return empty_state(thread_id: thread_id) if user_id.blank?

          session = ::IaColaborativa::AgentSession.find_by(agent: agent, user_id: user_id, thread_id: thread_id)
          session ||= ::IaColaborativa::AgentSession.where(agent: agent, user_id: user_id).order(updated_at: :desc, id: :desc).first

          state = session ? serialize(session) : empty_state(thread_id: thread_id)
          facts = semantic_facts(state)
          recent_turns = Array(state.dig(:memory, 'recent_turns')).length
          Rails.logger.info(
            "[SaraTools::SessionRuntime] load user_id=#{user_id.inspect} thread_id=#{thread_id.inspect} " \
            "found=#{session.present?} active_project_id=#{state[:active_project_id].inspect} " \
            "last_tool=#{state[:last_tool_name].inspect} facts=#{facts.keys.inspect} recent_turns=#{recent_turns}"
          )
          state
        end

        def update_from_turn(user_id:, thread_id:, project_id:, question:, executed_tools:, final_response:, project_name: nil, agent: 'sara_tools')
          return if user_id.blank? || thread_id.blank?

          session = ::IaColaborativa::AgentSession.find_or_initialize_by(agent: agent, user_id: user_id, thread_id: thread_id)
          memory = session.memory

          session.project_id = project_id if project_id.present?
          session.active_project_id = project_id if project_id.present?
          session.active_project_name = project_name if project_name.present?
          session.active_project_name ||= memory['active_project_name']

          if (tool_state = extract_tool_state(executed_tools)).present?
            session.last_tool_name = tool_state[:tool_name]
            session.last_tool_summary = tool_state[:summary]
            memory['last_projects'] = tool_state[:projects] if tool_state[:projects]
            memory['last_projects_summary'] = tool_state[:summary] if tool_state[:summary]
          end

          memory['semantic_facts'] = merge_semantic_facts(memory['semantic_facts'], extract_semantic_facts(question, final_response))
          memory['last_user_query'] = question.to_s
          memory['last_response_excerpt'] = truncate_text(final_response, 240)
          memory['recent_turns'] = append_recent_turn(
            memory['recent_turns'],
            question: question,
            final_response: final_response,
            executed_tools: executed_tools,
            semantic_facts: memory['semantic_facts']
          )
          if session.active_project_id.present?
            session.active_project_name ||= project_name_from_memory(memory, session.active_project_id)
            memory['active_project_id'] = session.active_project_id
          end
          memory['active_project_name'] = session.active_project_name if session.active_project_name.present?
          session.memory = memory
          session.save!

          facts = memory['semantic_facts'].is_a?(Hash) ? memory['semantic_facts'] : {}
          Rails.logger.info(
            "[SaraTools::SessionRuntime] update user_id=#{user_id.inspect} thread_id=#{thread_id.inspect} " \
            "active_project_id=#{session.active_project_id.inspect} last_tool=#{session.last_tool_name.inspect} " \
            "facts=#{facts.keys.inspect} recent_turns=#{Array(memory['recent_turns']).length}"
          )
          serialize(session)
        rescue StandardError => e
          Rails.logger.warn("[SaraTools::SessionRuntime] update error=#{e.class} #{e.message}")
          nil
        end

        def prompt_text(state)
          return nil if state.blank?

          parts = []
          if state[:active_project_id].present?
            label = state[:active_project_name].present? ? " (#{state[:active_project_name]})" : ''
            parts << "Proyecto activo de la sesion: #{state[:active_project_id]}#{label}"
          end
          if state[:last_tool_summary].present?
            parts << "Ultimo resultado operativo util: #{state[:last_tool_summary]}"
          end
          facts = semantic_facts(state)
          if facts['age'].present?
            parts << "Dato recordado del usuario: tiene #{facts['age']} anos"
          end
          return nil if parts.blank?

          "Estado persistente de la sesion:\n- #{parts.join("\n- ")}"
        end

        def summary(state)
          return nil if state.blank?

          parts = []
          parts << "La sesion mantiene el proyecto activo #{state[:active_project_id]}." if state[:active_project_id].present?
          parts << "Hay un resultado operativo reciente de #{state[:last_tool_name]}." if state[:last_tool_name].present?
          if (age = semantic_facts(state)['age']).present?
            parts << "Se recuerda que el usuario indico tener #{age} anos."
          end
          parts.join(' ').presence
        end

        private

        def empty_state(thread_id:)
          {
            thread_id: thread_id,
            active_project_id: nil,
            active_project_name: nil,
            last_tool_name: nil,
            last_tool_summary: nil,
            memory: {}
          }
        end

        def serialize(session)
          {
            thread_id: session.thread_id,
            active_project_id: session.active_project_id || session.project_id,
            active_project_name: session.active_project_name,
            last_tool_name: session.last_tool_name,
            last_tool_summary: session.last_tool_summary,
            memory: session.memory
          }
        end

        def semantic_facts(state)
          memory = state[:memory].is_a?(Hash) ? state[:memory] : {}
          facts = memory['semantic_facts']
          facts.is_a?(Hash) ? facts : {}
        end

        def extract_tool_state(executed_tools)
          Array(executed_tools).reverse_each do |tool|
            next unless tool.is_a?(Hash)

            name = tool[:name] || tool['name']
            result = tool[:result] || tool['result']
            next unless result.is_a?(Hash) && (result[:success] == true || result['success'] == true)

            if name.to_s == 'list_projects'
              projects = Array(result[:projects] || result['projects']).first(10).map do |project|
                next unless project.is_a?(Hash)
                { 'id' => project[:id] || project['id'], 'name' => project[:name] || project['name'] }
              end.compact
              total = result[:total] || result['total'] || projects.length
              summary = "Lista reciente de proyectos (#{total}): #{projects.first(5).map { |project| project['name'] }.join(', ')}"
              return { tool_name: 'list_projects', summary: summary, projects: projects }
            end
          end

          nil
        end

        def append_recent_turn(existing_turns, question:, final_response:, executed_tools:, semantic_facts:)
          turns = Array(existing_turns).select { |entry| entry.is_a?(Hash) }.last(4)
          tool_state = extract_tool_state(executed_tools)
          turns << {
            'turn_id' => nil,
            'query' => question.to_s,
            'response' => truncate_text(final_response, 320),
            'rag_used' => false,
            'tool_calls_count' => Array(executed_tools).length,
            'tool_names' => Array(executed_tools).map { |tool| tool[:name] || tool['name'] }.compact,
            'result_summary' => tool_state && tool_state[:summary],
            'facts' => semantic_facts
          }
          turns.last(5)
        end

        def extract_semantic_facts(question, final_response)
          facts = {}
          text = [question.to_s, final_response.to_s].join("\n")
          if (match = text.match(/\btengo\s+(\d{1,3})\s+a(?:ñ|n)os?\b/i))
            facts['age'] = match[1].to_i
          elsif (match = text.match(/\btienes\s+(\d{1,3})\s+a(?:ñ|n)os?\b/i))
            facts['age'] = match[1].to_i
          end
          facts
        end

        def merge_semantic_facts(existing, fresh)
          base = existing.is_a?(Hash) ? existing.dup : {}
          fresh.each { |key, value| base[key] = value if value.present? }
          base
        end

        def project_name_from_memory(memory, project_id)
          Array(memory['last_projects']).each do |project|
            next unless project.is_a?(Hash)

            return project['name'] || project[:name] if Integer(project['id'] || project[:id]) == project_id
          rescue ArgumentError, TypeError
            next
          end
          nil
        end

        def truncate_text(text, max_len)
          return '' if text.blank?

          content = text.to_s.strip
          content.length > max_len ? "#{content[0...max_len]}..." : content
        end
      end
    end
  end
end
