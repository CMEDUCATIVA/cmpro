class AddContactProfileToEmailDeliveries < ActiveRecord::Migration[6.1]
  def change
    add_column :email_deliveries, :contact_profile_id, :integer
    add_index :email_deliveries, :contact_profile_id
  end
end
