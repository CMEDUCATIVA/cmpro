class AllowNullContactInFlowRunItems < ActiveRecord::Migration[7.1]
  def change
    change_column_null :flow_run_items, :contact_id, true
  end
end
