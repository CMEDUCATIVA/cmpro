class CreateEmailDeliveries < ActiveRecord::Migration[6.1]
  def change
    create_table :email_deliveries do |t|
      t.references :project, null: false
      t.references :email_template
      t.integer :sender_id
      t.integer :recipient_user_id
      t.string :recipient_email
      t.string :subject, null: false
      t.text :body
      t.text :body_html
      t.string :status, null: false, default: "queued"
      t.string :smtp_source, null: false, default: "openproject"
      t.datetime :scheduled_at
      t.datetime :sent_at
      t.text :error_message
      t.timestamps
    end

    add_index :email_deliveries, :status
    add_index :email_deliveries, :scheduled_at
    add_index :email_deliveries, :recipient_user_id
  end
end
