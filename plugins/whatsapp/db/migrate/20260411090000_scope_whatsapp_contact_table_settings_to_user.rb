class ScopeWhatsappContactTableSettingsToUser < ActiveRecord::Migration[6.1]
  def change
    add_reference :whatsapp_contact_table_settings, :user, foreign_key: { to_table: :users }, null: true

    if index_exists?(:whatsapp_contact_table_settings, :project_id, unique: true)
      remove_index :whatsapp_contact_table_settings, :project_id
    end

    add_index :whatsapp_contact_table_settings,
              [:project_id, :user_id],
              unique: true,
              name: "idx_whatsapp_contact_table_settings_on_project_and_user"
  end
end
