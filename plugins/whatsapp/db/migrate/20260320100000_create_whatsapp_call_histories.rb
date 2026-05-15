class CreateWhatsappCallHistories < ActiveRecord::Migration[7.0]
  def change
    create_table :whatsapp_call_histories do |t|
      t.references :contact_profile, null: false, foreign_key: { to_table: :whatsapp_contact_profiles }
      t.references :project, null: false, foreign_key: true
      t.references :created_by, foreign_key: { to_table: :users }
      t.string :outcome
      t.text :note
      t.string :call_duration, null: false, default: "00:00:00"
      t.datetime :logged_at, null: false
      t.binary :audio_data
      t.string :audio_content_type
      t.string :audio_file_name
      t.integer :audio_file_size
      t.timestamps
    end

    add_index :whatsapp_call_histories, [:contact_profile_id, :logged_at], name: "index_call_histories_on_contact_and_logged_at"
  end
end
