class WhatsappProjectSetting < ApplicationRecord
  belongs_to :project

  validates :project_id, presence: true
  validates :session_name, :admin_name, :admin_email, :time_zone, presence: true
end
