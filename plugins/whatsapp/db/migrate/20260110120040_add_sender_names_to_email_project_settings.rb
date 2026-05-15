class AddSenderNamesToEmailProjectSettings < ActiveRecord::Migration[6.1]
  def change
    return if column_exists?(:email_project_settings, :sender_names)

    add_column :email_project_settings, :sender_names, :text
  end
end
