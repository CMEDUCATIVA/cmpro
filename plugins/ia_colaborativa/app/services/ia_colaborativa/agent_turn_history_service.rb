module IaColaborativa
  class AgentTurnHistoryService
    class << self
      def recent_turns(limit: 10, agent: nil, user_id: nil)
        scope = base_scope
        scope = scope.where(agent: agent) if agent.present?
        scope = scope.where(user_id: user_id) if user_id.present?

        turns = scope.limit(limit.to_i.clamp(1, 50)).map do |turn|
          serialize_turn(turn, include_events: true)
        end
        Rails.logger.info(
          "[SaraTools::History] recent_turns limit=#{limit.to_i.clamp(1, 50)} " \
          "agent=#{agent.inspect} user_id=#{user_id.inspect} returned=#{turns.length}"
        )
        turns
      end

      def find_turn(turn_id)
        turn = base_scope.find_by(turn_id: turn_id)
        Rails.logger.info("[SaraTools::History] find_turn turn_id=#{turn_id.inspect} found=#{turn.present?}")
        return nil unless turn

        serialize_turn(turn, include_events: true)
      end

      private

      def base_scope
        ::IaColaborativa::AgentTurn
          .includes(:events)
          .order(created_at: :desc, id: :desc)
      end

      def serialize_turn(turn, include_events:)
        turn_hash = {
          turn_id: turn.turn_id,
          thread_id: turn.thread_id,
          agent: turn.agent,
          user_id: turn.user_id,
          project_id: turn.project_id,
          query: turn.query,
          response: turn.response,
          status: turn.status,
          rag_used: !!turn.rag_used,
          tool_calls_count: turn.tool_calls_count.to_i,
          response_mode: turn.response_mode,
          provider: turn.provider,
          model: turn.model,
          total_duration_ms: turn.total_duration_ms,
          started_at: turn.started_at&.iso8601,
          completed_at: turn.completed_at&.iso8601,
          created_at: turn.created_at&.iso8601,
          updated_at: turn.updated_at&.iso8601,
          metadata: turn.metadata,
          events_count: turn.events.size,
          events: include_events ? serialize_events(turn.events) : []
        }
        presented = ::IaColaborativa::SaraTools::EventPresenter.present_turn(turn_hash)
        Rails.logger.info(
          "[SaraTools::History] serialize_turn turn_id=#{turn.turn_id.inspect} " \
          "include_events=#{include_events} events_count=#{turn.events.size}"
        )
        presented
      end

      def serialize_events(events)
        events.sort_by(&:position).map do |event|
          presented = ::IaColaborativa::SaraTools::EventPresenter.present_event(
            {
              type: event.event_type,
              label: event.label,
              agent: event.agent,
              timestamp: event.occurred_at&.iso8601,
              meta: event.meta
            }
          )
          Rails.logger.info(
            "[SaraTools::History] serialize_event turn_event_id=#{event.id.inspect} " \
            "position=#{event.position.inspect} type=#{presented[:type].inspect}"
          )
          {
            position: event.position,
            type: presented[:type],
            label: presented[:label],
            agent: presented[:agent],
            occurred_at: event.occurred_at&.iso8601,
            meta: presented[:meta]
          }
        end
      end
    end
  end
end
