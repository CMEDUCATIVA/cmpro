class CreateIaProviderSettings < ActiveRecord::Migration[6.1]
  def change
    create_table :ia_provider_settings do |t|
      t.string :provider
      t.string :base_url
      t.string :model
      t.text :api_key

      t.timestamps
    end
  end
end
