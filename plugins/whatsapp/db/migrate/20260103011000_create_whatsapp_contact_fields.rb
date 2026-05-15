class CreateWhatsappContactFields < ActiveRecord::Migration[6.1]
  def change
    create_table :whatsapp_contact_fields do |t|
      t.references :project, null: false, foreign_key: true
      t.string :name, null: false
      t.string :field_type, null: false
      t.json :options
      t.boolean :required, null: false, default: false
      t.integer :position, null: false, default: 0
      t.boolean :active, null: false, default: true
      t.timestamps
    end

    add_index :whatsapp_contact_fields, [:project_id, :name], unique: true
  end
end
