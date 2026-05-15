class AllowNullChatInContactProfiles < ActiveRecord::Migration[6.1]
  def change
    remove_foreign_key :whatsapp_contact_profiles, :whatsapp_chats
    change_column_null :whatsapp_contact_profiles, :chat_id, true
    add_foreign_key :whatsapp_contact_profiles, :whatsapp_chats, column: :chat_id, on_delete: :nullify
  end
end
