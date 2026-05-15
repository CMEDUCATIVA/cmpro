class AddFavoriteToWhatsappChats < ActiveRecord::Migration[6.1]
  def change
    add_column :whatsapp_chats, :favorite, :boolean, null: false, default: false
    add_index :whatsapp_chats, [:project_id, :favorite], if_not_exists: true
  end
end
