class EmailTemplateAttachment < ApplicationRecord
  belongs_to :email_template

  validates :file_name, presence: true
  validates :storage_path, presence: true
end
