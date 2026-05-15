class AddDeliveryFieldsToEmailTemplates < ActiveRecord::Migration[7.0]
  def change
    add_column :email_templates, :smtp_source, :string
    add_column :email_templates, :sender_name, :string
  end
end
