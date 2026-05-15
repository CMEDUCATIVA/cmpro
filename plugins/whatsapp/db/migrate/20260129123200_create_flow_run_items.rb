class CreateFlowRunItems < ActiveRecord::Migration[7.1]
  def change
    create_table :flow_run_items do |t|
      t.references :flow_run, null: false, foreign_key: true
      t.references :contact, null: false, foreign_key: { to_table: :whatsapp_contact_profiles }
      t.string :node_id
      t.string :status, null: false, default: "queued"
      t.text :error_message
      t.datetime :started_at
      t.datetime :finished_at
      t.timestamps
    end

    add_index :flow_run_items, :node_id
  end
end
