class CreateFlowWebhookEndpoints < ActiveRecord::Migration[7.1]
  def change
    create_table :flow_webhook_endpoints do |t|
      t.references :flow_definition, null: false, foreign_key: true
      t.string :node_id
      t.string :token, null: false
      t.text :mapping_json
      t.timestamps
    end

    add_index :flow_webhook_endpoints, :token, unique: true
    add_index :flow_webhook_endpoints, [:flow_definition_id, :node_id], unique: true
  end
end
