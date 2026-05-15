class CreateWhatsappContactTableSettings < ActiveRecord::Migration[6.1]
  def change
    create_table :whatsapp_contact_table_settings do |t|
      t.references :project, null: false, index: { unique: true }, foreign_key: true
      t.text :hidden_fields
      t.timestamps
    end
  end
end
