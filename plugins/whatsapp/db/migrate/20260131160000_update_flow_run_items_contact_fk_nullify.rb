class UpdateFlowRunItemsContactFkNullify < ActiveRecord::Migration[7.1]
  def change
    remove_foreign_key :flow_run_items, column: :contact_id
    add_foreign_key :flow_run_items, :whatsapp_contact_profiles, column: :contact_id, on_delete: :nullify
  end
end
