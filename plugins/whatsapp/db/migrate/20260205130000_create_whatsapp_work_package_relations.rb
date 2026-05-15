class CreateWhatsappWorkPackageRelations < ActiveRecord::Migration[7.0]
  def change
    create_table :whatsapp_work_package_relations do |t|
      t.references :project, null: false, index: true, foreign_key: true
      t.references :chat, index: true, foreign_key: { to_table: :whatsapp_chats }
      t.references :contact_profile, index: true, foreign_key: { to_table: :whatsapp_contact_profiles }
      t.references :work_package, null: false, index: true, foreign_key: true
      t.references :created_by, index: true, foreign_key: { to_table: :users }

      t.timestamps
    end
  end
end
