class AddColumnWidthsToWhatsappContactTableSettings < ActiveRecord::Migration[7.1]
  def change
    add_column :whatsapp_contact_table_settings, :column_widths, :text
  end
end
