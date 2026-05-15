class WhatsappBoardCardRelation < ApplicationRecord
  belongs_to :project
  belongs_to :chat, class_name: "WhatsappChat", optional: true
  belongs_to :contact_profile, class_name: "WhatsappContactProfile", optional: true
  belongs_to :board, class_name: "Boards::Grid"
  belongs_to :query
  belongs_to :work_package
  belongs_to :created_by, class_name: "User", optional: true

  validates :board_id, :query_id, :work_package_id, presence: true
end
