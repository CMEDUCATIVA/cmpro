class CreateDocumentosConfigs < ActiveRecord::Migration[6.1]
  def change
    create_table :documentos_configs do |t|
      t.text :url
      t.text :token
      t.text :api_key
      t.timestamps
    end
  end
end
