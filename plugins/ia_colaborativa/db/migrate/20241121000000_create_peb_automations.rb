class CreatePebAutomations < ActiveRecord::Migration[6.1]
  def change
    create_table :peb_automations do |t|
      t.integer :project_id, null: false
      t.string  :plan_title, null: false
      t.jsonb   :payload,    null: false, default: {}
      t.timestamps
    end

    add_index :peb_automations, :project_id
  end
end
