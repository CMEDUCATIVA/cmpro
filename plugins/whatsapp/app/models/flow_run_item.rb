class FlowRunItem < ApplicationRecord
  belongs_to :flow_run
  belongs_to :contact, class_name: "WhatsappContactProfile", optional: true

  validates :status, inclusion: { in: %w[queued running finished failed skipped] }
end
