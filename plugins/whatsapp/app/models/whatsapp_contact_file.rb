class WhatsappContactFile < ApplicationRecord
  belongs_to :contact_profile, class_name: "WhatsappContactProfile"
  belongs_to :project
  belongs_to :created_by, class_name: "User", optional: true

  validates :storage_id, presence: true
  validates :storage_file_id, presence: true
  validates :file_name, presence: true
end
