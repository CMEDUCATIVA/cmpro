class CreateWhatsappProjectSettings < ActiveRecord::Migration[7.0]
  def change
    create_table :whatsapp_project_settings do |t|
      t.references :project, null: false, index: { unique: true }
      t.string :session_name
      t.string :admin_name
      t.string :admin_email
      t.timestamps
    end
  end
end
