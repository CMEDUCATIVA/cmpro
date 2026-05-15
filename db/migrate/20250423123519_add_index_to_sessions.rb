# frozen_string_literal: true

class AddIndexToSessions < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    add_index :sessions, :user_id, algorithm: :concurrently
  end
end
