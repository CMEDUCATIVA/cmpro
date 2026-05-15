require 'json'

module IaColaborativa
  module SaraTools
    class TurnPersistence
      class << self
        def start_turn(turn_meta, extra = {})
          attrs = normalize_hash(turn_meta).merge(normalize_hash(extra))
          turn = ::IaColaborativa::AgentTurn.find_or_initialize_by(turn_id: attrs['turn_id'])

          turn.thread_id = attrs['thread_id']
          turn.agent = attrs['agent'].presence || turn.agent || 'sara_tools'
          turn.user_id = normalize_integer(attrs['user_id'])
          turn.project_id = normalize_integer(attrs['project_id'])
          turn.query = attrs['query'] if attrs.key?('query')
          turn.provider = attrs['provider'] if attrs.key?('provider')
          turn.model = attrs['model'] if attrs.key?('model')
          turn.status = attrs['status'] if attrs.key?('status')
          turn.response_mode = attrs['response_mode'] if attrs.key?('response_mode')
          turn.started_at ||= Time.current
          turn.metadata = merged_metadata(turn.metadata, attrs['metadata'])
          is_new_record = turn.new_record?
          turn.save!
          Rails.logger.info(
            "[SaraTools::TurnPersistence] start_turn turn_id=#{turn.turn_id} " \
            "status=#{turn.status.inspect} agent=#{turn.agent.inspect} " \
            "user_id=#{turn.user_id.inspect} project_id=#{turn.project_id.inspect} " \
            "new_record=#{is_new_record}"
          )
          turn
        rescue StandardError => e
          Rails.logger.warn "[SaraTools::TurnPersistence] start_turn error=#{e.class} #{e.message}"
          nil
        end

        def update_turn(turn_id, attrs = {})
          return if turn_id.blank?

          turn = ::IaColaborativa::AgentTurn.find_by(turn_id: turn_id)
          return unless turn

          data = normalize_hash(attrs)
          turn.query = data['query'] if data.key?('query')
          turn.response = data['response'] if data.key?('response')
          turn.status = data['status'] if data.key?('status')
          turn.provider = data['provider'] if data.key?('provider')
          turn.model = data['model'] if data.key?('model')
          turn.response_mode = data['response_mode'] if data.key?('response_mode')
          turn.rag_used = !!data['rag_used'] if data.key?('rag_used')
          turn.tool_calls_count = data['tool_calls_count'].to_i if data.key?('tool_calls_count')
          turn.total_duration_ms = data['total_duration_ms'].to_i if data.key?('total_duration_ms')
          turn.completed_at = data['completed_at'] if data.key?('completed_at')
          turn.metadata = merged_metadata(turn.metadata, data['metadata'])
          turn.save!
          Rails.logger.info(
            "[SaraTools::TurnPersistence] update_turn turn_id=#{turn.turn_id} " \
            "status=#{turn.status.inspect} rag_used=#{turn.rag_used.inspect} " \
            "tool_calls_count=#{turn.tool_calls_count.inspect} " \
            "response_mode=#{turn.response_mode.inspect} total_duration_ms=#{turn.total_duration_ms.inspect}"
          )
          turn
        rescue StandardError => e
          Rails.logger.warn "[SaraTools::TurnPersistence] update_turn error=#{e.class} #{e.message}"
          nil
        end

        def append_event(turn_id, event, position:)
          turn = ::IaColaborativa::AgentTurn.find_by(turn_id: turn_id)
          return unless turn

          payload = normalize_hash(event)
          record = turn.events.find_or_initialize_by(turn_id: turn_id, position: position)
          record.event_type = payload['type']
          record.label = payload['label']
          record.agent = payload['agent']
          record.occurred_at = parse_time(payload['timestamp']) || Time.current
          record.meta = payload['meta']
          record.save!
          Rails.logger.info(
            "[SaraTools::TurnPersistence] append_event turn_id=#{turn_id} " \
            "position=#{position} type=#{record.event_type.inspect} label=#{record.label.inspect}"
          )
          record
        rescue StandardError => e
          Rails.logger.warn "[SaraTools::TurnPersistence] append_event error=#{e.class} #{e.message}"
          nil
        end

        def complete_turn(turn_id, summary = {})
          return if turn_id.blank?

          data = normalize_hash(summary)
          turn = update_turn(
            turn_id,
            status: 'completed',
            rag_used: data['rag_used'],
            tool_calls_count: data['tool_calls_count'],
            response_mode: data['response_mode'],
            total_duration_ms: data['total_duration_ms'],
            response: data['response'],
            completed_at: Time.current,
            metadata: data['metadata']
          )
          if turn
            Rails.logger.info(
              "[SaraTools::TurnPersistence] complete_turn turn_id=#{turn.turn_id} " \
              "completed_at=#{turn.completed_at&.iso8601} tool_calls_count=#{turn.tool_calls_count.inspect} " \
              "rag_used=#{turn.rag_used.inspect}"
            )
          end
        end

        private

        def normalize_hash(value)
          hash = value.respond_to?(:to_h) ? value.to_h : value
          return {} unless hash.is_a?(Hash)

          hash.each_with_object({}) do |(key, entry), memo|
            memo[key.to_s] = entry
          end
        end

        def merged_metadata(existing, incoming)
          normalize_hash(existing).merge(normalize_hash(incoming))
        end

        def normalize_integer(value)
          return nil if value.blank?
          Integer(value)
        rescue ArgumentError, TypeError
          nil
        end

        def parse_time(value)
          return value if value.is_a?(Time) || value.is_a?(ActiveSupport::TimeWithZone)
          return nil if value.blank?

          Time.zone.parse(value.to_s)
        rescue StandardError
          nil
        end
      end
    end
  end
end
