class CreateIaAgentSessions < ActiveRecord::Migration[7.0]
  def change
    create_table :ia_agent_sessions do |t|
      t.string :thread_id, null: false
      t.string :agent, null: false
      t.bigint :user_id, null: false
      t.bigint :project_id
      t.bigint :active_project_id
      t.string :active_project_name
      t.string :last_tool_name
      t.text :last_tool_summary
      t.text :memory_json

      t.timestamps
    end

    add_index :ia_agent_sessions, [:agent, :user_id, :thread_id], unique: true, name: 'idx_ia_agent_sessions_agent_user_thread'
    add_index :ia_agent_sessions, :user_id
    add_index :ia_agent_sessions, :thread_id
  end
end
