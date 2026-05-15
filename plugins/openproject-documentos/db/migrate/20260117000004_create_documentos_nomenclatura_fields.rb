class CreateDocumentosNomenclaturaFields < ActiveRecord::Migration[6.1]
  def change
    create_table :documentos_nomenclatura_fields do |t|
      t.string :key, null: false
      t.boolean :is_for_all, default: true, null: false
      t.boolean :is_filter, default: true, null: false
      t.boolean :is_searchable, default: true, null: false

      t.timestamps
    end

    add_index :documentos_nomenclatura_fields, :key, unique: true
  end
end
