class WhatsappCallHistory < ApplicationRecord
  belongs_to :contact_profile, class_name: "WhatsappContactProfile", optional: true
  belongs_to :project
  belongs_to :created_by, class_name: "User", optional: true

  validates :call_duration, presence: true
  validates :event_type, presence: true, if: :has_event_type_column?

  private

  def has_event_type_column?
    self.class.column_names.include?("event_type")
  end
end
