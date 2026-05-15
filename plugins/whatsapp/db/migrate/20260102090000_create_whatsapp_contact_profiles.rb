class CreateWhatsappContactProfiles < ActiveRecord::Migration[6.1]
  def change
    create_table :whatsapp_contact_profiles do |t|
      t.references :project, null: false, foreign_key: true
      t.references :chat, null: false, foreign_key: { to_table: :whatsapp_chats }
      t.string :first_name
      t.string :last_name
      t.string :email
      t.string :phone
      t.string :address
      t.string :city
      t.string :state
      t.string :country
      t.string :postal_code
      t.string :company
      t.string :job_title
      t.text :notes
      t.json :tags
      t.string :source
      t.string :status
      t.date :birthday
      t.timestamps
    end

    add_index :whatsapp_contact_profiles, [:project_id, :chat_id], unique: true, if_not_exists: true
  end
end
