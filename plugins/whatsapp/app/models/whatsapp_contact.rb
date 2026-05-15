class WhatsappContact < ApplicationRecord
  belongs_to :project
  belongs_to :user, optional: true

  has_many :chat_participants,
           class_name: "WhatsappChatParticipant",
           dependent: :destroy
  has_many :chats, through: :chat_participants

  has_many :sent_messages,
           class_name: "WhatsappMessage",
           foreign_key: :sender_contact_id,
           dependent: :nullify

  validates :name, presence: true
end
