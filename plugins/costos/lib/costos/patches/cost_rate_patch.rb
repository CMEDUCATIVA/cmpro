# frozen_string_literal: true

module Costos
  module Patches
    module CostRatePatch
      extend ActiveSupport::Concern

      included do
        validates :sale_rate, presence: true, numericality: true
        validates :study_rate, presence: true, numericality: true
      end
    end
  end
end
