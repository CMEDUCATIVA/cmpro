class CreateDocumentosNomenclaturaItems < ActiveRecord::Migration[6.1]
  def change
    create_table :documentos_nomenclatura_items do |t|
      t.string :key, null: false
      t.string :value, null: false
      t.string :description
      t.boolean :is_for_all, default: false, null: false
      t.boolean :is_filter, default: false, null: false
      t.boolean :is_searchable, default: false, null: false

      t.timestamps
    end
  end
end
