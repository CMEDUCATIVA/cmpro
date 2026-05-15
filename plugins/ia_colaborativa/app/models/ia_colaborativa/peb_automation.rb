module IaColaborativa
  class PebAutomation < ApplicationRecord
    self.table_name = 'peb_automations'

    validates :project_id, presence: true
    validates :plan_title, presence: true

    def payload
      super || {}
    end
  end
end
