# frozen_string_literal: true

class AddStudyRateToRates < ActiveRecord::Migration[7.0]
  def change
    add_column :rates, :study_rate, :decimal, precision: 15, scale: 4

    reversible do |dir|
      dir.up do
        execute <<~SQL.squish
          UPDATE rates
          SET study_rate = COALESCE(sale_rate, rate)
          WHERE type = 'CostRate' AND study_rate IS NULL
        SQL
      end
    end
  end
end
