class CreateWhatsappContactTags < ActiveRecord::Migration[7.0]
  def change
    create_table :whatsapp_contact_tags do |t|
      t.references :project, null: false, foreign_key: true
      t.string :name, null: false
      t.string :color, null: false
      t.timestamps
    end

    add_index :whatsapp_contact_tags, [:project_id, :name], unique: true
  end
end
