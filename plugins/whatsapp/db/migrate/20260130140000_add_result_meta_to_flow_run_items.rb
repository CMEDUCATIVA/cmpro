class AddResultMetaToFlowRunItems < ActiveRecord::Migration[7.1]
  def change
    add_column :flow_run_items, :result_meta, :json
  end
end
