class WhatsappContactTableSetting < ApplicationRecord
  belongs_to :project
  belongs_to :user, optional: true
  serialize :hidden_fields, coder: JSON
  serialize :column_order, coder: JSON
  serialize :column_widths, coder: JSON
  serialize :form_field_order, coder: JSON
end
