class CreateIaAgentTurnsAndEvents < ActiveRecord::Migration[6.1]
  def change
    create_table :ia_agent_turns do |t|
      t.string  :turn_id, null: false
      t.string  :thread_id
      t.string  :agent, null: false
      t.bigint  :user_id
      t.bigint  :project_id
      t.text    :query
      t.text    :response
      t.string  :status
      t.boolean :rag_used, default: false, null: false
      t.integer :tool_calls_count, default: 0, null: false
      t.string  :response_mode
      t.string  :provider
      t.string  :model
      t.integer :total_duration_ms
      t.datetime :started_at
      t.datetime :completed_at
      t.text    :metadata_json

      t.timestamps
    end

    add_index :ia_agent_turns, :turn_id, unique: true
    add_index :ia_agent_turns, :thread_id
    add_index :ia_agent_turns, :agent
    add_index :ia_agent_turns, :user_id

    create_table :ia_agent_turn_events do |t|
      t.references :agent_turn, null: false, foreign_key: { to_table: :ia_agent_turns }
      t.string  :turn_id, null: false
      t.integer :position, null: false
      t.string  :event_type, null: false
      t.string  :label
      t.string  :agent
      t.datetime :occurred_at
      t.text    :meta_json

      t.timestamps
    end

    add_index :ia_agent_turn_events, [:turn_id, :position], unique: true
    add_index :ia_agent_turn_events, :event_type
  end
end
