module IaColaborativa
  module SaraTools
    class EventPresenter
      SENSITIVE_META_KEYS = %w[
        chain_of_thought
        thought
        thoughts
        reasoning
        internal_reasoning
        prompt
        system_prompt
        raw_prompt
        messages
        conversation
        history
        content
        response
      ].freeze

      class << self
        def present_event(event)
          return {} unless event.is_a?(Hash)

          type = event[:type] || event['type']
          presented = {
            type: type,
            label: sanitize_label(type, event[:label] || event['label']),
            agent: event[:agent] || event['agent'],
            timestamp: event[:timestamp] || event['timestamp'],
            turn_id: event[:turn_id] || event['turn_id'],
            meta: sanitize_meta(type, event[:meta] || event['meta'])
          }.compact
          Rails.logger.info(
            "[SaraTools::EventPresenter] present_event type=#{type.inspect} " \
            "label=#{presented[:label].inspect} meta_keys=#{presented.fetch(:meta, {}).keys.inspect}"
          )
          presented
        end

        def present_turn(turn_hash)
          return {} unless turn_hash.is_a?(Hash)

          status = (turn_hash[:status] || turn_hash['status']).to_s
          agent = (turn_hash[:agent] || turn_hash['agent']).to_s

          presented = turn_hash.merge(
            agent_label: agent == 'sara_tools' ? 'Sara' : agent,
            status_label: status == 'completed' ? 'completado' : status
          )
          Rails.logger.info(
            "[SaraTools::EventPresenter] present_turn turn_id=#{turn_hash[:turn_id].inspect} " \
            "agent=#{agent.inspect} status=#{status.inspect} events_count=#{turn_hash[:events_count].inspect}"
          )
          presented
        end

        def sanitize_label(type, label)
          text = label.to_s.gsub(/\s+/, ' ').strip
          return fallback_label(type) if text.blank?

          text.length > 180 ? "#{text[0...180]}..." : text
        end

        def sanitize_meta(type, meta)
          hash = normalize_hash(meta)
          return {} if hash.empty?
          original_keys = hash.keys

          sanitized = case type.to_s
                      when 'agent_status'
                        hash.slice('query', 'mode', 'round', 'tool_calls')
                      when 'reasoning_step'
                        hash.slice('messages_count', 'round', 'summary')
                      when 'rag_step_started'
                        {}
                      when 'rag_step_finished'
                        hash.slice('chars')
                      when 'rag_step_failed'
                        hash.slice('error')
                      when 'tool_call_started'
                        sanitize_tool_meta(hash.slice('tool_name', 'display_name', 'input'))
                      when 'tool_call_finished'
                        sanitize_tool_meta(hash.slice('tool_name', 'display_name', 'input', 'output', 'duration_ms'))
                      when 'tool_call_failed'
                        sanitize_tool_meta(hash.slice('tool_name', 'display_name', 'input', 'error', 'duration_ms'))
                      when 'assistant_message'
                        hash.slice('response_chars')
                      when 'turn_summary'
                        hash.slice('tool_calls_count', 'rag_used', 'response_mode', 'total_duration_ms')
                      else
                        hash.except(*SENSITIVE_META_KEYS)
                      end

          clean = deep_sanitize(sanitized)
          Rails.logger.info(
            "[SaraTools::EventPresenter] sanitize_meta type=#{type.inspect} " \
            "kept=#{clean.keys.inspect} removed=#{(original_keys - clean.keys).inspect}"
          )
          clean
        end

        private

        def fallback_label(type)
          case type.to_s
          when 'reasoning_step' then 'Evaluando siguiente paso'
          when 'agent_status' then 'Actualizando estado del agente'
          else type.to_s.tr('_', ' ').strip
          end
        end

        def sanitize_tool_meta(hash)
          clean = normalize_hash(hash)
          clean['input'] = deep_sanitize(clean['input']) if clean.key?('input')
          clean['output'] = deep_sanitize(clean['output']) if clean.key?('output')
          clean
        end

        def normalize_hash(value)
          raw = value.respond_to?(:to_h) ? value.to_h : value
          return {} unless raw.is_a?(Hash)

          raw.each_with_object({}) do |(key, entry), memo|
            memo[key.to_s] = entry
          end
        end

        def deep_sanitize(value)
          case value
          when Hash
            value.each_with_object({}) do |(key, entry), memo|
              next if SENSITIVE_META_KEYS.include?(key.to_s)

              memo[key.to_s] = deep_sanitize(entry)
            end
          when Array
            value.first(20).map { |entry| deep_sanitize(entry) }
          when String
            text = value.gsub(/\s+/, ' ').strip
            text.length > 500 ? "#{text[0...500]}..." : text
          else
            value
          end
        end
      end
    end
  end
end
