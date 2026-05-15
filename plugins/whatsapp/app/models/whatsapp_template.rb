class WhatsappTemplate < ApplicationRecord
  TEMPLATE_TYPES = %w[
    text
    image
    video
    audio
    file
    text_image
    text_video
    text_file
  ].freeze

  belongs_to :project
  belongs_to :created_by, class_name: "User", optional: true
  belongs_to :updated_by, class_name: "User", optional: true

  validates :name, presence: true
  validates :template_type, presence: true, inclusion: { in: TEMPLATE_TYPES }
end
