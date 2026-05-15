class AddMaxTokensToIaProviderSettings < ActiveRecord::Migration[6.1]
  def change
    add_column :ia_provider_settings, :max_tokens, :integer, null: false, default: 1000
  end
end
