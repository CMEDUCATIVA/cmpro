# frozen_string_literal: true
class AddStateToMeetings < ActiveRecord::Migration[5.1]
  def change
    add_column :meetings, :state, :integer, default: 0, null: false
  end
end
