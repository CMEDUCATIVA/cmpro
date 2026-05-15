class WhatsappMessage < ApplicationRecord
  MESSAGE_TYPES = %w[text image audio file video activity].freeze
  STATUSES = %w[sent delivered read failed].freeze

  belongs_to :chat, class_name: "WhatsappChat"
  belongs_to :sender_contact, class_name: "WhatsappContact", optional: true
  belongs_to :sender_user, class_name: "User", optional: true

  has_many :attachments,
           class_name: "WhatsappAttachment",
           foreign_key: :message_id,
           dependent: :destroy

  validates :message_type, inclusion: { in: MESSAGE_TYPES }
  validates :status, inclusion: { in: STATUSES }
  validate :sender_present

  private

  def sender_present
    return if sender_contact_id.present? || sender_user_id.present?

    errors.add(:base, "sender_contact or sender_user must be present")
  end
end
