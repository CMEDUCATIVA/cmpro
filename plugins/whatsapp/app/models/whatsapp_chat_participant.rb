class WhatsappChatParticipant < ApplicationRecord
  belongs_to :chat, class_name: "WhatsappChat"
  belongs_to :contact, class_name: "WhatsappContact", optional: true
  belongs_to :user, optional: true

  validate :contact_or_user_present

  private

  def contact_or_user_present
    return if contact_id.present? || user_id.present?

    errors.add(:base, "contact or user must be present")
  end
end
