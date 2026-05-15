module IaColaborativa
  module SaraTools
    class ConversationMemory
      MAX_TURNS = 5

      class << self
        def load(user_id:, thread_id:, current_query:, session_state: nil, limit: MAX_TURNS)
          return empty_memory if user_id.blank?

          turns = recent_turns_for(user_id: user_id, thread_id: thread_id, limit: limit)
          turns = merge_session_turns(turns, session_state, limit: limit)
          Rails.logger.info(
            "[SaraTools::ConversationMemory] load user_id=#{user_id.inspect} " \
            "thread_id=#{thread_id.inspect} turns=#{turns.length}"
          )
          return empty_memory if turns.blank?

          summarized_turns = turns.map { |turn| summarized_turn(turn) }
          reusable_context = detect_reusable_context(current_query, summarized_turns)
          facts = extract_facts_from_turns(summarized_turns)
          Rails.logger.info(
            "[SaraTools::ConversationMemory] reusable_context query=#{current_query.inspect} " \
            "kind=#{reusable_context&.dig(:kind).inspect} source_turn_id=#{reusable_context&.dig(:source_turn_id).inspect}"
          )

          {
            turns_count: summarized_turns.length,
            source: turn_thread_id(turns.last) == thread_id ? 'thread' : 'user',
            turns: summarized_turns,
            summary: build_summary(summarized_turns, reusable_context),
            prompt_text: build_prompt_text(summarized_turns, reusable_context),
            reusable_context: reusable_context,
            facts: facts
          }
        end

        private

        TURN_FACT_KEYS = %w[age name].freeze

        def empty_memory
          {
            turns_count: 0,
            source: nil,
            turns: [],
            summary: nil,
            prompt_text: nil,
            reusable_context: nil,
            facts: {}
          }
        end

        def recent_turns_for(user_id:, thread_id:, limit:)
          scoped_limit = limit.to_i.clamp(1, MAX_TURNS)
          base_scope = ::IaColaborativa::AgentTurn
            .includes(:events)
            .where(agent: 'sara_tools', user_id: user_id, status: 'completed')

          same_thread_turns = if thread_id.present?
                                base_scope
                                  .where(thread_id: thread_id)
                                  .order(created_at: :desc, id: :desc)
                                  .limit(scoped_limit)
                                  .to_a
                              else
                                []
                              end

          Rails.logger.info(
            "[SaraTools::ConversationMemory] query user_id=#{user_id.inspect} thread_id=#{thread_id.inspect} " \
            "same_thread=#{same_thread_turns.length}"
          )

          turns = if same_thread_turns.any?
                    same_thread_turns
                  else
                    fallback_turns = base_scope
                      .order(created_at: :desc, id: :desc)
                      .limit(scoped_limit)
                      .to_a
                    Rails.logger.info(
                      "[SaraTools::ConversationMemory] query fallback user_id=#{user_id.inspect} count=#{fallback_turns.length}"
                    )
                    fallback_turns
                  end

          turns
            .select { |turn| useful_turn?(turn) }
            .reverse
        end

        def summarize_turn(turn)
          tool_events = turn.events.select { |event| event.event_type == 'tool_call_finished' }.sort_by(&:position)
          tool_names = tool_events.filter_map do |event|
            meta = event.meta
            meta['tool_name'] || meta[:tool_name]
          end

          {
            turn_id: turn.turn_id,
            query: turn.query.to_s,
            response: turn.response.to_s,
            rag_used: !!turn.rag_used,
            tool_calls_count: turn.tool_calls_count.to_i,
            tool_names: tool_names,
            result_summary: build_result_summary(tool_events),
            facts: extract_semantic_facts(turn.query, turn.response)
          }
        end

        def summarized_turn(turn)
          return turn if turn.is_a?(Hash) && turn.key?(:query) && turn.key?(:response)

          summarize_turn(turn)
        end

        def turn_thread_id(turn)
          return nil if turn.blank?
          return turn.thread_id if turn.respond_to?(:thread_id)

          if turn.is_a?(Hash)
            return turn[:thread_id] || turn['thread_id']
          end

          nil
        end

        def build_result_summary(tool_events)
          tool_events.reverse_each do |event|
            meta = event.meta
            output = meta['output'] || meta[:output]
            tool_name = meta['tool_name'] || meta[:tool_name]
            next unless output.is_a?(Hash)

            if tool_name == 'list_projects'
              total = output['total'] || output[:total]
              projects = Array(output['projects'] || output[:projects]).first(5)
              names = projects.filter_map do |project|
                next unless project.is_a?(Hash)

                project['name'] || project[:name]
              end
              return "Lista reciente de proyectos (#{total || names.length}): #{names.join(', ')}"
            end
          end

          nil
        end

        def detect_reusable_context(current_query, turns)
          normalized_query = normalize(current_query)
          return nil if normalized_query.blank?

          if references_projects_list?(normalized_query)
            source_turn = turns.reverse.find { |turn| turn[:tool_names].include?('list_projects') }
            return nil unless source_turn

            return {
              kind: 'projects_list',
              source_turn_id: source_turn[:turn_id],
              tool_name: 'list_projects',
              summary: source_turn[:result_summary].presence || truncate_text(source_turn[:response], 260)
            }
          end

          nil
        end

        def references_projects_list?(normalized_query)
          normalized_query.include?('lista de proyectos') ||
            normalized_query.include?('la lista de proyectos') ||
            normalized_query.include?('lista proyectos') ||
            normalized_query.include?('estos proyectos') ||
            normalized_query.include?('esa lista') ||
            normalized_query.include?('que opinas sobre la lista') ||
            normalized_query.include?('queopinas sobre la lista')
        end

        def build_summary(turns, reusable_context)
          summary = "Se cargaron #{turns.length} turnos previos del mismo usuario."
          return summary if reusable_context.blank?

          "#{summary} Hay contexto reutilizable del turno #{reusable_context[:source_turn_id]}: #{reusable_context[:summary]}"
        end

        def build_prompt_text(turns, reusable_context)
          facts = extract_facts_from_turns(turns)
          history_lines = turns.map do |turn|
            row = []
            row << "Usuario: #{truncate_text(turn[:query], 180)}"
            row << "Sara: #{truncate_text(turn[:response], 220)}"
            row << "Resultado operativo: #{truncate_text(turn[:result_summary], 180)}" if turn[:result_summary].present?
            "- #{row.join("\n  ")}"
          end

          text = +"Memoria conversacional reciente del mismo usuario:\n#{history_lines.join("\n\n")}"
          if facts.present?
            facts_lines = facts.map { |key, value| "- #{humanize_fact(key)}: #{value}" }
            text << "\n\nHechos recordados del usuario:\n#{facts_lines.join("\n")}"
          end
          if reusable_context.present?
            text << "\n\nContexto operativo reutilizable para esta consulta:\n"
            text << "- Fuente: turno #{reusable_context[:source_turn_id]}\n"
            text << "- Resumen: #{reusable_context[:summary]}"
          end
          text
        end

        def merge_session_turns(turns, session_state, limit:)
          memory = session_state.is_a?(Hash) ? session_state[:memory] : nil
          session_turns = Array(memory.is_a?(Hash) ? memory['recent_turns'] : nil)
          return turns if session_turns.blank?

          normalized_session_turns = session_turns.map do |entry|
            next unless entry.is_a?(Hash)

            {
              turn_id: entry['turn_id'],
              query: entry['query'].to_s,
              response: entry['response'].to_s,
              rag_used: !!entry['rag_used'],
              tool_calls_count: entry['tool_calls_count'].to_i,
              tool_names: Array(entry['tool_names']).map(&:to_s),
              result_summary: entry['result_summary'].presence,
              facts: normalize_facts(entry['facts'])
            }
          end.compact

          turn_map = {}
          turns.map { |turn| summarized_turn(turn) }.each_with_index do |turn, index|
            turn_map[turn[:turn_id].presence || "db_#{index}"] = turn
          end
          normalized_session_turns.each_with_index do |turn, index|
            key = turn[:turn_id].presence || "session_#{index}"
            turn_map[key] ||= turn
          end

          turn_map.values.last(limit.to_i.clamp(1, MAX_TURNS))
        end

        def useful_turn?(turn)
          turn.query.present? || turn.response.present? || turn.events.any?
        end

        def extract_facts_from_turns(turns)
          turns.each_with_object({}) do |turn, memo|
            normalize_facts(turn[:facts]).each do |key, value|
              memo[key] = value
            end
          end
        end

        def extract_semantic_facts(query, response)
          facts = {}
          q = query.to_s
          r = response.to_s

          if (match = q.match(/\btengo\s+(\d{1,3})\s+anos?\b/i))
            facts['age'] = match[1].to_i
          elsif (match = q.match(/\btengo\s+(\d{1,3})\s+a(?:ñ|n)os?\b/i))
            facts['age'] = match[1].to_i
          elsif (match = r.match(/\btienes\s+(\d{1,3})\s+a(?:ñ|n)os?\b/i))
            facts['age'] = match[1].to_i
          end

          if (match = q.match(/\bme\s+llamo\s+([[:alpha:]\s]{2,60})\b/i))
            facts['name'] = match[1].strip
          end

          facts
        end

        def normalize_facts(facts)
          hash = facts.is_a?(Hash) ? facts : {}
          hash.each_with_object({}) do |(key, value), memo|
            normalized_key = key.to_s
            next unless TURN_FACT_KEYS.include?(normalized_key)
            next if value.blank?

            memo[normalized_key] = value
          end
        end

        def humanize_fact(key)
          case key.to_s
          when 'age' then 'Edad del usuario'
          when 'name' then 'Nombre del usuario'
          else key.to_s.humanize
          end
        end

        def normalize(value)
          value.to_s.downcase.gsub(/\s+/, ' ').strip
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
