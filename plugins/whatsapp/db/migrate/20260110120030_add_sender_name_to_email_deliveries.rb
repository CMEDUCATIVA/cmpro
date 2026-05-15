class AddSenderNameToEmailDeliveries < ActiveRecord::Migration[6.1]
  def change
    add_column :email_deliveries, :sender_name, :string
  end
end
