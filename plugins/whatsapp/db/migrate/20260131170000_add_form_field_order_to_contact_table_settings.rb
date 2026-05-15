class AddFormFieldOrderToContactTableSettings < ActiveRecord::Migration[7.1]
  def change
    add_column :whatsapp_contact_table_settings, :form_field_order, :text
  end
end
