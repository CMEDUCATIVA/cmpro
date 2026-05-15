module IaColaborativa
  module SaraTools
    class TurnStore
      class << self
        MAX_TURNS = 200
        TURN_TTL = 30.minutes
        INDEX_KEY = 'ia_colaborativa:sara_tools:turn_store:index'.freeze

        def mutex
          @mutex ||= Mutex.new
        end

        def start_turn(turn_id, turn_meta = {})
          return if turn_id.blank?

          mutex.synchronize do
            turn = read_turn(turn_id) || {
              'events' => [],
              'turn_meta' => {},
              'completed' => false
            }

            turn['turn_meta'] = (turn['turn_meta'] || {}).merge(normalize_hash(turn_meta))
            turn['completed'] = false
            touch_turn_payload!(turn)
            write_turn(turn_id, turn)
            update_index(turn_id)
          end
        end

        def append_event(turn_id, event)
          return if turn_id.blank? || !event.is_a?(Hash)

          mutex.synchronize do
            turn = read_turn(turn_id) || {
              'events' => [],
              'turn_meta' => {},
              'completed' => false
            }

            turn['events'] ||= []
            turn['events'] << normalize_hash(event)
            touch_turn_payload!(turn)
            write_turn(turn_id, turn)
            update_index(turn_id)
          end
        end

        def complete_turn(turn_id, meta = {})
          return if turn_id.blank?

          mutex.synchronize do
            turn = read_turn(turn_id) || {
              'events' => [],
              'turn_meta' => {},
              'completed' => false
            }

            turn['completed'] = true
            turn['completion_meta'] = normalize_hash(meta)
            touch_turn_payload!(turn)
            write_turn(turn_id, turn)
            update_index(turn_id)
          end
        end

        def fetch_events(turn_id, since: 0)
          turn = read_turn(turn_id)
          return default_payload(turn_id, since) unless turn

          events = turn['events'] || []
          safe_since = [since.to_i, 0].max
          {
            turn_id: turn_id,
            events: events.drop(safe_since),
            next_index: events.length,
            total_events: events.length,
            completed: !!turn['completed'],
            turn_meta: turn['turn_meta'] || {},
            updated_at: turn['updated_at']
          }
        end

        private

        def cache
          Rails.cache
        end

        def turn_key(turn_id)
          "ia_colaborativa:sara_tools:turn_store:turn:#{turn_id}"
        end

        def read_turn(turn_id)
          cache.read(turn_key(turn_id))
        rescue StandardError => e
          Rails.logger.warn "[SaraTools::TurnStore] read_turn error=#{e.class} #{e.message}"
          nil
        end

        def write_turn(turn_id, payload)
          cache.write(turn_key(turn_id), payload, expires_in: TURN_TTL)
        rescue StandardError => e
          Rails.logger.warn "[SaraTools::TurnStore] write_turn error=#{e.class} #{e.message}"
        end

        def read_index
          cache.read(INDEX_KEY) || []
        rescue StandardError => e
          Rails.logger.warn "[SaraTools::TurnStore] read_index error=#{e.class} #{e.message}"
          []
        end

        def write_index(index)
          cache.write(INDEX_KEY, index, expires_in: TURN_TTL)
        rescue StandardError => e
          Rails.logger.warn "[SaraTools::TurnStore] write_index error=#{e.class} #{e.message}"
        end

        def update_index(turn_id)
          index = read_index
          index = index.reject { |entry| entry['turn_id'] == turn_id }
          index << { 'turn_id' => turn_id, 'updated_at' => Time.current.iso8601 }

          while index.length > MAX_TURNS
            oldest = index.shift
            cache.delete(turn_key(oldest['turn_id'])) if oldest && oldest['turn_id'].present?
          end

          write_index(index)
        end

        def touch_turn_payload!(turn)
          turn['updated_at'] = Time.current.iso8601
        end

        def default_payload(turn_id, since)
          {
            turn_id: turn_id,
            events: [],
            next_index: since.to_i,
            total_events: 0,
            completed: false,
            turn_meta: {}
          }
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
end
