# frozen_string_literal: true

class AddDismissedEnterpriseBannersToUserPreference < ActiveRecord::Migration[8.0]
  def change
    add_column :user_preferences, :dismissed_enterprise_banners, :jsonb, default: {}, null: false
  end
end
