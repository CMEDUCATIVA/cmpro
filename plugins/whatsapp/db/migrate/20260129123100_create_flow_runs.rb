class CreateFlowRuns < ActiveRecord::Migration[7.1]
  def change
    create_table :flow_runs do |t|
      t.references :flow_definition, null: false, foreign_key: true
      t.references :project, null: false, foreign_key: true
      t.integer :started_by_id
      t.string :status, null: false, default: "queued"
      t.datetime :started_at
      t.datetime :finished_at
      t.json :metadata
      t.timestamps
    end

    add_index :flow_runs, :started_by_id
  end
end
