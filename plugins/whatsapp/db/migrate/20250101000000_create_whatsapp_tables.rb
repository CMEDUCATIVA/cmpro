class CreateWhatsappTables < ActiveRecord::Migration[6.1]
  def change
    create_table :whatsapp_contacts do |t|
      t.references :project, null: false, foreign_key: true
      t.references :user, null: true, foreign_key: true
      t.string :name, null: false
      t.string :phone
      t.string :email
      t.string :avatar_url
      t.boolean :external, null: false, default: true
      t.json :metadata
      t.timestamps
    end

    add_index :whatsapp_contacts, :phone, if_not_exists: true
    add_index :whatsapp_contacts, :email, if_not_exists: true

    create_table :whatsapp_chats do |t|
      t.references :project, null: false, foreign_key: true
      t.string :title
      t.string :external_id
      t.string :chat_type, null: false, default: "direct"
      t.datetime :last_message_at
      t.json :metadata
      t.timestamps
    end
    add_index :whatsapp_chats, [:project_id, :external_id], unique: true, if_not_exists: true

    create_table :whatsapp_chat_participants do |t|
      t.references :chat, null: false, foreign_key: { to_table: :whatsapp_chats }
      t.references :contact, null: true, foreign_key: { to_table: :whatsapp_contacts }
      t.references :user, null: true, foreign_key: true
      t.string :role
      t.datetime :joined_at
      t.timestamps
    end

    add_index :whatsapp_chat_participants, [:chat_id, :contact_id], if_not_exists: true
    add_index :whatsapp_chat_participants, [:chat_id, :user_id], if_not_exists: true

    create_table :whatsapp_messages do |t|
      t.references :chat, null: false, foreign_key: { to_table: :whatsapp_chats }
      t.references :sender_contact, null: true, foreign_key: { to_table: :whatsapp_contacts }
      t.references :sender_user, null: true, foreign_key: { to_table: :users }
      t.text :body
      t.string :message_type, null: false, default: "text"
      t.string :status, null: false, default: "sent"
      t.json :metadata
      t.timestamps
    end

    add_index :whatsapp_messages, [:chat_id, :created_at], if_not_exists: true
    add_index :whatsapp_messages, :sender_contact_id, if_not_exists: true
    add_index :whatsapp_messages, :sender_user_id, if_not_exists: true

    create_table :whatsapp_attachments do |t|
      t.references :message, null: false, foreign_key: { to_table: :whatsapp_messages }
      t.string :file_name
      t.string :content_type
      t.integer :file_size
      t.string :storage_path
      t.json :metadata
      t.timestamps
    end
  end
end
