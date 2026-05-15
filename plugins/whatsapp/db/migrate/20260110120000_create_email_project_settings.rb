class CreateEmailProjectSettings < ActiveRecord::Migration[6.1]
  def change
    create_table :email_project_settings do |t|
      t.references :project, null: false, index: { unique: true }
      t.boolean :enabled, null: false, default: true
      t.boolean :use_plugin_smtp, null: false, default: false
      t.string :smtp_address
      t.integer :smtp_port
      t.string :smtp_domain
      t.string :smtp_user_name
      t.string :smtp_password
      t.string :smtp_authentication
      t.boolean :smtp_enable_starttls_auto, null: false, default: true
      t.boolean :smtp_ssl, null: false, default: false
      t.string :smtp_openssl_verify_mode
      t.integer :smtp_timeout
      t.string :mail_from
      t.string :reply_to
      t.text :signature
      t.text :sender_names
      t.boolean :use_layout_default, null: false, default: true
      t.boolean :use_layout_plugin, null: false, default: false
      t.integer :throttle_per_minute, null: false, default: 60
      t.timestamps
    end
  end
end
