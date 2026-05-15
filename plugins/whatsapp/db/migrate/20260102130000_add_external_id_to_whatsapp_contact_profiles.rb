class AddExternalIdToWhatsappContactProfiles < ActiveRecord::Migration[6.1]
  def change
    add_column :whatsapp_contact_profiles, :external_id, :string
    add_index :whatsapp_contact_profiles, [:project_id, :external_id],
              unique: true,
              name: "index_whatsapp_contact_profiles_on_project_and_external_id"
  end
end
