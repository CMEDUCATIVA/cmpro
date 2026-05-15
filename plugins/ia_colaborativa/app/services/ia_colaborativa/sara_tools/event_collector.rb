require 'securerandom'
require_relative 'turn_store'
require_relative 'turn_persistence'
require_relative 'event_presenter'

module IaColaborativa
  module SaraTools
    class EventCollector
      attr_reader :events, :turn_id

      def initialize(agent:, thread_id:, user_id:, project_id:, turn_id: nil)
        @agent = agent
        @thread_id = thread_id
        @user_id = user_id
        @project_id = project_id
        @turn_id = turn_id.presence || "turn_#{SecureRandom.hex(6)}"
        @events = []
        @started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        ::IaColaborativa::SaraTools::TurnStore.start_turn(@turn_id, turn_meta)
        ::IaColaborativa::SaraTools::TurnPersistence.start_turn(turn_meta, status: 'running')
      end

      def start_turn(label: 'Sara inicio el turno')
        add_event('agent_turn_started', label: label)
      end

      def status(label, meta = {})
        add_event('agent_status', label: label, meta: meta)
      end

      def reasoning(label, meta = {})
        add_event('reasoning_step', label: label, meta: meta)
      end

      def rag_started(label: 'Consultando contexto remoto', meta: {})
        add_event('rag_step_started', label: label, meta: meta)
      end

      def rag_finished(label: 'Contexto remoto recuperado', meta: {})
        add_event('rag_step_finished', label: label, meta: meta)
      end

      def rag_failed(label: 'RAG no disponible', meta: {})
        add_event('rag_step_failed', label: label, meta: meta)
      end

      def tool_started(tool_name, display_name:, arguments: {})
        add_event(
          'tool_call_started',
          label: display_name,
          meta: {
            tool_name: tool_name,
            display_name: display_name,
            input: arguments
          }
        )
      end

      def tool_finished(tool_name, display_name:, arguments: {}, result: {}, duration_ms: nil)
        add_event(
          'tool_call_finished',
          label: display_name,
          meta: {
            tool_name: tool_name,
            display_name: display_name,
            input: arguments,
            output: result,
            duration_ms: duration_ms
          }
        )
      end

      def tool_failed(tool_name, display_name:, arguments: {}, error:, duration_ms: nil)
        add_event(
          'tool_call_failed',
          label: display_name,
          meta: {
            tool_name: tool_name,
            display_name: display_name,
            input: arguments,
            error: error,
            duration_ms: duration_ms
          }
        )
      end

      def assistant_message(label = 'Respuesta final generada', meta = {})
        add_event('assistant_message', label: label, meta: meta)
      end

      def finish_turn(label = 'Turno completado', meta = {})
        total_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - @started_at) * 1000).round
        event = add_event('turn_summary', label: label, meta: meta.merge(total_duration_ms: total_ms))
        ::IaColaborativa::SaraTools::TurnStore.complete_turn(@turn_id, event: event)
        ::IaColaborativa::SaraTools::TurnPersistence.complete_turn(
          @turn_id,
          normalize_hash(meta).merge('total_duration_ms' => total_ms)
        )
      end

      def update_turn(attrs = {})
        ::IaColaborativa::SaraTools::TurnPersistence.update_turn(@turn_id, attrs)
      end

      def turn_meta
        {
          thread_id: @thread_id,
          turn_id: @turn_id,
          agent: @agent,
          user_id: @user_id,
          project_id: @project_id
        }
      end

      private

      def add_event(type, label:, meta: {})
        safe_label = ::IaColaborativa::SaraTools::EventPresenter.sanitize_label(type, label)
        safe_meta = ::IaColaborativa::SaraTools::EventPresenter.sanitize_meta(type, meta)
        event = {
          type: type,
          label: safe_label,
          agent: @agent,
          timestamp: Time.current.iso8601,
          turn_id: @turn_id
        }
        event[:meta] = safe_meta if safe_meta.present?
        @events << event
        ::IaColaborativa::SaraTools::TurnStore.append_event(@turn_id, event)
        ::IaColaborativa::SaraTools::TurnPersistence.append_event(@turn_id, event, position: @events.length - 1)
        Rails.logger.info "[SaraTools::Events] type=#{type} label=#{safe_label} meta=#{safe_meta.inspect}"
        event
      end

      def normalize_hash(value)
        hash = value.respond_to?(:to_h) ? value.to_h : value
        return {} unless hash.is_a?(Hash)

        hash.each_with_object({}) do |(key, entry), memo|
          memo[key.to_s] = entry
        end
      end
    end
  end
end
