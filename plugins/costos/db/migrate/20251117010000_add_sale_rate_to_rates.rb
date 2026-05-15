# frozen_string_literal: true

class AddSaleRateToRates < ActiveRecord::Migration[7.0]
  def change
    add_column :rates, :sale_rate, :decimal, precision: 15, scale: 4

    reversible do |dir|
      dir.up do
        execute <<~SQL.squish
          UPDATE rates
          SET sale_rate = rate
          WHERE type = 'CostRate' AND sale_rate IS NULL
        SQL
      end
    end
  end
end
