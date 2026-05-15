class AddCrmFieldsToWhatsappContactProfiles < ActiveRecord::Migration[6.1]
  def change
    add_column :whatsapp_contact_profiles, :assigned_to_id, :integer
    add_column :whatsapp_contact_profiles, :points, :integer, default: 0, null: false
    add_column :whatsapp_contact_profiles, :last_interaction_at, :datetime
    add_column :whatsapp_contact_profiles, :deleted_at, :datetime
    add_column :whatsapp_contact_profiles, :custom_fields, :json

    add_index :whatsapp_contact_profiles, :assigned_to_id
    add_index :whatsapp_contact_profiles, :points
    add_index :whatsapp_contact_profiles, :last_interaction_at
    add_index :whatsapp_contact_profiles, :deleted_at
    add_index :whatsapp_contact_profiles, [:project_id, :phone]
    add_index :whatsapp_contact_profiles, [:project_id, :email]
  end
end
