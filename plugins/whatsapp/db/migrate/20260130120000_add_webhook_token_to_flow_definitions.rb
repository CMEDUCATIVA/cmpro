require "securerandom"

class AddWebhookTokenToFlowDefinitions < ActiveRecord::Migration[7.1]
  def up
    add_column :flow_definitions, :webhook_token, :string
    add_index :flow_definitions, :webhook_token, unique: true

    say_with_time "Backfilling webhook tokens" do
      flow_definition = Class.new(ActiveRecord::Base) do
        self.table_name = "flow_definitions"
      end

      flow_definition.reset_column_information
      flow_definition.where(webhook_token: [nil, ""]).find_each do |flow|
        flow.update_columns(webhook_token: SecureRandom.hex(20))
      end
    end

    change_column_null :flow_definitions, :webhook_token, false
  end

  def down
    remove_index :flow_definitions, :webhook_token if index_exists?(:flow_definitions, :webhook_token)
    remove_column :flow_definitions, :webhook_token if column_exists?(:flow_definitions, :webhook_token)
  end
end
