class RemoveUniqueIndexFromFlowDefinitions < ActiveRecord::Migration[7.1]
  def change
    remove_index :flow_definitions, :project_id if index_exists?(:flow_definitions, :project_id, unique: true)
    add_index :flow_definitions, :project_id unless index_exists?(:flow_definitions, :project_id)
  end
end
