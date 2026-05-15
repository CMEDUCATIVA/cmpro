class WhatsappContactProfile < ApplicationRecord
  belongs_to :project
  belongs_to :chat, class_name: "WhatsappChat", optional: true
  belongs_to :assigned_to, class_name: "User", optional: true
  has_many :work_package_relations,
           class_name: "WhatsappWorkPackageRelation",
           foreign_key: :contact_profile_id,
           dependent: :destroy
  has_many :contact_files,
           class_name: "WhatsappContactFile",
           foreign_key: :contact_profile_id,
           dependent: :destroy
  has_many :call_histories,
           class_name: "WhatsappCallHistory",
           foreign_key: :contact_profile_id,
           dependent: :destroy

  validates :external_id, uniqueness: { scope: :project_id }, allow_blank: true

  scope :active, -> { where(deleted_at: nil) }
end
