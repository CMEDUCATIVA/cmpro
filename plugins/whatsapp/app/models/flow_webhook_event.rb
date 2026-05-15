class FlowWebhookEvent < ApplicationRecord
  belongs_to :flow_definition
  belongs_to :project
  belongs_to :flow_webhook_endpoint, optional: true

  serialize :payload_json, coder: JSON
  serialize :headers_json, coder: JSON

  validates :status, inclusion: { in: %w[received queued processed failed no_contact] }, allow_blank: true
end
