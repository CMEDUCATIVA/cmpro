module IaColaborativa
  class ProviderSetting < ApplicationRecord
    self.table_name = 'ia_provider_settings'

    def self.singleton
      order(updated_at: :desc, id: :desc).first || create!
    end
  end
end
