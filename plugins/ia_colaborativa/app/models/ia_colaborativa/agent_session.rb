module IaColaborativa
  class AgentSession < ApplicationRecord
    self.table_name = 'ia_agent_sessions'

    validates :thread_id, :agent, :user_id, presence: true

    def memory
      parse_json_field(memory_json)
    end

    def memory=(value)
      self.memory_json = value.present? ? JSON.generate(value) : nil
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
