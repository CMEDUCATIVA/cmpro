class AddAdvancedFiltersToWhatsappContactTableSettings < ActiveRecord::Migration[6.1]
  def change
    add_column :whatsapp_contact_table_settings, :advanced_filters, :jsonb, default: {}, null: false
  end
end
