class CreateFlowWebhookEvents < ActiveRecord::Migration[7.1]
  def change
    create_table :flow_webhook_events do |t|
      t.references :flow_definition, null: false, foreign_key: true
      t.references :project, null: false, foreign_key: true
      t.text :payload_json
      t.text :headers_json
      t.string :status, null: false, default: "received"
      t.string :error_message
      t.datetime :received_at
      t.timestamps
    end
  end
end
