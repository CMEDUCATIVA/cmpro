class FlowDefinition < ApplicationRecord
  belongs_to :project
  has_many :flow_webhook_endpoints, dependent: :destroy

  validates :project_id, presence: true
  validates :status, inclusion: { in: %w[draft published] }, allow_blank: true

  serialize :definition_json, coder: JSON

  before_validation :ensure_webhook_token

  private

  def ensure_webhook_token
    self.webhook_token = SecureRandom.hex(20) if webhook_token.blank?
  end
end
