class CreateIaLightragSettings < ActiveRecord::Migration[6.1]
  def change
    create_table :ia_lightrag_settings do |t|
      t.string :url
      t.text :api_key

      t.timestamps
    end
  end
end
