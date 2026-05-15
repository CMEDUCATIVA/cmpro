class AddEndpointToFlowWebhookEvents < ActiveRecord::Migration[7.1]
  def change
    add_reference :flow_webhook_events, :flow_webhook_endpoint, foreign_key: true, null: true
  end
end
