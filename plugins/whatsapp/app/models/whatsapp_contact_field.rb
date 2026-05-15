class WhatsappContactField < ApplicationRecord
  FIELD_TYPES = %w[text number date select multiselect boolean].freeze

  belongs_to :project

  validates :name, presence: true, uniqueness: { scope: :project_id, conditions: -> { where(active: true) } }
  validates :field_type, presence: true, inclusion: { in: FIELD_TYPES }
end
