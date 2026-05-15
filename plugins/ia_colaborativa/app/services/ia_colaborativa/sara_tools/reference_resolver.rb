module IaColaborativa
  module SaraTools
    class ReferenceResolver
      ORDINAL_MAP = {
        'primer' => 0,
        'primero' => 0,
        'primera' => 0,
        'segundo' => 1,
        'segunda' => 1,
        'tercero' => 2,
        'tercera' => 2,
        'cuarto' => 3,
        'cuarta' => 3,
        'quinto' => 4,
        'quinta' => 4
      }.freeze

      class << self
        def resolve(question:, context:, session_state:, conversation_memory:)
          normalized = normalize(question)
          result = {
            source: nil,
            summary: nil,
            project_id: nil,
            project_name: nil,
            reusable_context: nil
          }

          if (explicit = resolve_explicit_project_id(normalized, session_state)).present?
            result.merge!(explicit).merge(source: 'explicit_project_id')
          elsif (ordinal = resolve_ordinal_project(normalized, session_state)).present?
            result.merge!(ordinal).merge(source: 'ordinal_reference')
          elsif (active = resolve_active_project_reference(normalized, session_state)).present?
            result.merge!(active).merge(source: 'active_project_reference')
          end

          if (fact = resolve_semantic_fact(normalized, session_state)).present?
            result[:source] ||= fact[:source]
            result[:summary] = fact[:summary]
            result[:semantic_answer] = fact[:answer]
          end

          result[:reusable_context] = resolve_reusable_context(normalized, session_state, conversation_memory)

          if result[:project_id].present?
            result[:summary] = "La consulta referencia el proyecto #{result[:project_id]}#{result[:project_name].present? ? " (#{result[:project_name]})" : ''}."
          elsif result[:reusable_context].present?
            result[:summary] = "La consulta referencia un resultado operativo reciente del turno #{result[:reusable_context][:source_turn_id]}."
          end

          Rails.logger.info(
            "[SaraTools::ReferenceResolver] resolve query=#{question.inspect} source=#{result[:source].inspect} " \
            "project_id=#{result[:project_id].inspect} reusable_kind=#{result.dig(:reusable_context, :kind).inspect}"
          )
          result
        end

        private

        def resolve_explicit_project_id(normalized, session_state)
          match = normalized.match(/proyecto\s+(\d{1,10})/)
          return nil unless match

          project_id = match[1].to_i
          {
            project_id: project_id,
            project_name: project_name_from_session(session_state, project_id)
          }
        end

        def resolve_ordinal_project(normalized, session_state)
          index = ordinal_index(normalized)
          return nil if index.nil?

          project = last_projects(session_state)[index]
          return nil unless project.is_a?(Hash)

          {
            project_id: integer_or_nil(project['id'] || project[:id]),
            project_name: project['name'] || project[:name]
          }
        end

        def resolve_active_project_reference(normalized, session_state)
          return nil unless normalized.match?(/\b(ese proyecto|este proyecto|el proyecto|ese|este)\b/)
          return nil if session_state[:active_project_id].blank?

          {
            project_id: session_state[:active_project_id],
            project_name: session_state[:active_project_name]
          }
        end

        def resolve_reusable_context(normalized, session_state, conversation_memory)
          return conversation_memory[:reusable_context] if conversation_memory[:reusable_context].present?
          return nil unless references_projects_list?(normalized)
          return nil unless session_state[:last_tool_name].to_s == 'list_projects'

          {
            kind: 'projects_list',
            source_turn_id: 'session_state',
            tool_name: 'list_projects',
            summary: session_state[:last_tool_summary]
          }
        end

        def resolve_semantic_fact(normalized, session_state)
          facts = session_facts(session_state)
          if normalized.match?(/\b(cuantos anos tengo|cuantos a(?:ñ|n)os tengo|mi edad)\b/) && facts['age'].present?
            age = facts['age']
            return {
              source: 'semantic_fact_age',
              summary: "La sesion recuerda que el usuario indico tener #{age} anos.",
              answer: "Me indicaste antes que tienes #{age} anos."
            }
          end

          nil
        end

        def last_projects(session_state)
          memory = session_state[:memory].is_a?(Hash) ? session_state[:memory] : {}
          Array(memory['last_projects'])
        end

        def session_facts(session_state)
          memory = session_state[:memory].is_a?(Hash) ? session_state[:memory] : {}
          facts = memory['semantic_facts']
          facts.is_a?(Hash) ? facts : {}
        end

        def project_name_from_session(session_state, project_id)
          project = last_projects(session_state).find do |entry|
            integer_or_nil(entry['id'] || entry[:id]) == project_id
          end
          project && (project['name'] || project[:name])
        end

        def ordinal_index(normalized)
          ORDINAL_MAP.each do |word, index|
            return index if normalized.include?(word)
          end
          nil
        end

        def references_projects_list?(normalized)
          normalized.include?('lista de proyectos') ||
            normalized.include?('la lista de proyectos') ||
            normalized.include?('estos proyectos') ||
            normalized.include?('esa lista') ||
            normalized.include?('que opinas sobre la lista') ||
            normalized.include?('queopinas sobre la lista')
        end

        def normalize(value)
          value.to_s.downcase.gsub(/\s+/, ' ').strip
        end

        def integer_or_nil(value)
          return nil if value.blank?

          Integer(value)
        rescue ArgumentError, TypeError
          nil
        end
      end
    end
  end
end
