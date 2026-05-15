class WhatsappAttachment < ApplicationRecord
  belongs_to :message, class_name: "WhatsappMessage", foreign_key: :message_id

  validates :file_name, presence: true, allow_blank: false
end
