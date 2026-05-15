class AddCallActivityFieldsToWhatsappContactProfiles < ActiveRecord::Migration[7.0]
  def change
    add_column :whatsapp_contact_profiles, :last_call_activity_at, :datetime
    add_column :whatsapp_contact_profiles, :last_call_activity_result, :string
    add_index :whatsapp_contact_profiles, :last_call_activity_at
  end
end
