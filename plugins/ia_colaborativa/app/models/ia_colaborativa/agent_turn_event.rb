module IaColaborativa
  class AgentTurnEvent < ApplicationRecord
    self.table_name = 'ia_agent_turn_events'

    belongs_to :agent_turn,
               class_name: 'IaColaborativa::AgentTurn',
               inverse_of: :events

    validates :turn_id, :position, :event_type, presence: true

    def meta
      parse_json_field(meta_json)
    end

    def meta=(value)
      self.meta_json = value.present? ? JSON.generate(value) : nil
    end

    private

    def parse_json_field(value)
      return {} if value.blank?

      JSON.parse(value)
    rescue JSON::ParserError
      {}
    end
  end
end
