class FlowWebhookEndpoint < ApplicationRecord
  belongs_to :flow_definition
  has_many :flow_webhook_events, dependent: :destroy

  validates :token, presence: true, uniqueness: true

  serialize :mapping_json, coder: JSON

  before_validation :ensure_token

  def mapping
    mapping_json.is_a?(Hash) ? mapping_json : {}
  end

  private

  def ensure_token
    self.token = SecureRandom.hex(20) if token.blank?
  end
end
