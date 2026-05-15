class AddVisibleInChatCardToWhatsappContactFields < ActiveRecord::Migration[6.1]
  def change
    add_column :whatsapp_contact_fields, :visible_in_chat_card, :boolean, null: false, default: true
  end
end
