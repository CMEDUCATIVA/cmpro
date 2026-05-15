class AddOpenTrackingToEmailTemplatesAndDeliveries < ActiveRecord::Migration[8.0]
  def change
    change_table :email_templates, bulk: true do |t|
      t.boolean :open_tracking_enabled, null: false, default: false
    end

    change_table :email_deliveries, bulk: true do |t|
      t.string :open_tracking_token
      t.datetime :opened_at
      t.integer :open_count, null: false, default: 0
      t.datetime :last_opened_at
    end

    add_index :email_deliveries, :open_tracking_token, unique: true
  end
end
