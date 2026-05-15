module IaColaborativa
  class AgentTurn < ApplicationRecord
    self.table_name = 'ia_agent_turns'

    has_many :events,
             class_name: 'IaColaborativa::AgentTurnEvent',
             foreign_key: :agent_turn_id,
             inverse_of: :agent_turn,
             dependent: :delete_all

    validates :turn_id, presence: true, uniqueness: true
    validates :agent, presence: true

    def metadata
      parse_json_field(metadata_json)
    end

    def metadata=(value)
      self.metadata_json = value.present? ? JSON.generate(value) : nil
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
