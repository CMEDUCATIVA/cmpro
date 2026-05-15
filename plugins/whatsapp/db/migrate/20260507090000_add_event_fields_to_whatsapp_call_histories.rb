class AddEventFieldsToWhatsappCallHistories < ActiveRecord::Migration[7.0]
  def up
    add_column :whatsapp_call_histories, :event_type, :string, null: false, default: "call"
    add_column :whatsapp_call_histories, :event_meta, :jsonb, null: false, default: {}
    add_index :whatsapp_call_histories, :event_type
  end

  def down
    remove_index :whatsapp_call_histories, :event_type
    remove_column :whatsapp_call_histories, :event_meta
    remove_column :whatsapp_call_histories, :event_type
  end
end
