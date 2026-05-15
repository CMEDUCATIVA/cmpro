module IaColaborativa
  class McpSetting < ApplicationRecord
    self.table_name = 'ia_mcp_settings'

    def self.singleton
      order(updated_at: :desc, id: :desc).first || create!
    end
  end
end
