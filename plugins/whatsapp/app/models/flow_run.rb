class FlowRun < ApplicationRecord
  belongs_to :flow_definition
  belongs_to :project
  belongs_to :started_by, class_name: "User", optional: true

  has_many :flow_run_items, dependent: :destroy

  validates :status, inclusion: { in: %w[queued running finished failed] }
end
