class UpdateWhatsappContactFieldsUniqueIndex < ActiveRecord::Migration[6.1]
  def change
    remove_index :whatsapp_contact_fields, name: "index_whatsapp_contact_fields_on_project_id_and_name"
    add_index :whatsapp_contact_fields,
              [:project_id, :name],
              unique: true,
              where: "active",
              name: "index_whatsapp_contact_fields_on_project_id_and_name_active"
  end
end
