# frozen_string_literal: true

class CreateWhatsappBoardCardRelations < ActiveRecord::Migration[6.1]
  def change
    create_table :whatsapp_board_card_relations do |t|
      t.references :project, null: false, foreign_key: true
      t.references :chat, foreign_key: { to_table: :whatsapp_chats }
      t.references :contact_profile, foreign_key: { to_table: :whatsapp_contact_profiles }
      t.references :board, null: false, foreign_key: { to_table: :grids }
      t.references :query, null: false, foreign_key: true
      t.references :work_package, null: false, foreign_key: true
      t.references :created_by, foreign_key: { to_table: :users }
      t.timestamps
    end
  end
end
