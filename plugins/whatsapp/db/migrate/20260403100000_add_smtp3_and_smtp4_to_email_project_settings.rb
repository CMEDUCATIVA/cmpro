class AddSmtp3AndSmtp4ToEmailProjectSettings < ActiveRecord::Migration[8.0]
  def change
    change_table :email_project_settings, bulk: true do |t|
      t.string :smtp3_address
      t.integer :smtp3_port
      t.string :smtp3_domain
      t.string :smtp3_user_name
      t.string :smtp3_password
      t.string :smtp3_authentication
      t.boolean :smtp3_enable_starttls_auto, null: false, default: true
      t.boolean :smtp3_ssl, null: false, default: false
      t.string :smtp3_openssl_verify_mode
      t.integer :smtp3_timeout
      t.string :smtp3_mail_from
      t.string :smtp3_reply_to

      t.string :smtp4_address
      t.integer :smtp4_port
      t.string :smtp4_domain
      t.string :smtp4_user_name
      t.string :smtp4_password
      t.string :smtp4_authentication
      t.boolean :smtp4_enable_starttls_auto, null: false, default: true
      t.boolean :smtp4_ssl, null: false, default: false
      t.string :smtp4_openssl_verify_mode
      t.integer :smtp4_timeout
      t.string :smtp4_mail_from
      t.string :smtp4_reply_to
    end
  end
end
