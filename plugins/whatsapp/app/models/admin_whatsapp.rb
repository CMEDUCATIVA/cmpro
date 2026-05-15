# frozen_string_literal: true

class AdminWhatsapp < ApplicationRecord
  self.table_name = "admin_whatsapp"

  belongs_to :project

  validates :project_id, presence: true, uniqueness: true
  validates :limit_gb, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
end
