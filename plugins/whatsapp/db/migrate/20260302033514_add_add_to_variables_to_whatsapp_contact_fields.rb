class AddAddToVariablesToWhatsappContactFields < ActiveRecord::Migration[7.0]
  def change
    add_column :whatsapp_contact_fields, :add_to_variables, :boolean, default: false, null: false
  end
end
