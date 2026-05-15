class AddGlobalRateLimitToEmailSettingsAndDeliveries < ActiveRecord::Migration[8.0]
  def change
    change_table :email_project_settings, bulk: true do |t|
      t.boolean :global_rate_limit_enabled, null: false, default: false
      t.integer :global_rate_limit_count, null: false, default: 10
      t.integer :global_rate_limit_period_value, null: false, default: 1
      t.string :global_rate_limit_period_unit, null: false, default: "minute"
    end

    add_column :email_deliveries, :bypass_rate_limit, :boolean, null: false, default: false
    add_index :email_deliveries, :bypass_rate_limit
  end
end
