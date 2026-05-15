class EmailAttachment < ApplicationRecord
  belongs_to :email_delivery

  validates :file_name, presence: true
  validates :storage_path, presence: true
end
