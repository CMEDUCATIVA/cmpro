class CreateWhatsappContactFiles < ActiveRecord::Migration[6.1]
  def change
    create_table :whatsapp_contact_files do |t|
      t.references :contact_profile, null: false, foreign_key: { to_table: :whatsapp_contact_profiles }
      t.references :project, null: false, foreign_key: true
      t.integer :created_by_id
      t.integer :storage_id, null: false
      t.string :storage_file_id, null: false
      t.string :file_name, null: false
      t.integer :file_size
      t.string :mime_type
      t.string :folder_id
      t.timestamps
    end

    add_index :whatsapp_contact_files, [:contact_profile_id, :storage_id, :storage_file_id], unique: true, name: "index_contact_files_on_contact_and_storage"
    add_index :whatsapp_contact_files, :created_by_id
  end
end
