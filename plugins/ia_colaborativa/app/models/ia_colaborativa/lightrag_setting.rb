module IaColaborativa
  class LightragSetting < ApplicationRecord
    self.table_name = 'ia_lightrag_settings'

    def self.singleton
      order(updated_at: :desc, id: :desc).first || create!
    end
  end
end
