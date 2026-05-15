class WhatsappChat < ApplicationRecord
  belongs_to :project

  has_many :chat_participants,
           class_name: "WhatsappChatParticipant",
           foreign_key: :chat_id,
           dependent: :destroy
  has_many :contacts, through: :chat_participants

  has_many :messages,
           class_name: "WhatsappMessage",
           foreign_key: :chat_id,
           dependent: :destroy

  has_one :contact_profile,
          class_name: "WhatsappContactProfile",
          foreign_key: :chat_id,
          dependent: :nullify

  validates :chat_type, presence: true
end
