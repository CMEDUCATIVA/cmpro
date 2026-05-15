# frozen_string_literal: true

class CreateAdminWhatsapp < ActiveRecord::Migration[6.1]
  def change
    create_table :admin_whatsapp do |t|
      t.references :project, null: false, foreign_key: true, index: { unique: true }
      t.decimal :limit_gb, precision: 10, scale: 2

      t.timestamps
    end
  end
end
