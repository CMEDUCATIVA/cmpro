class AddTimeZoneToWhatsappProjectSettings < ActiveRecord::Migration[6.1]
  def change
    add_column :whatsapp_project_settings, :time_zone, :string
  end
end
