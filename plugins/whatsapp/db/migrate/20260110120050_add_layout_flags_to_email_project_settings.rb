class AddLayoutFlagsToEmailProjectSettings < ActiveRecord::Migration[6.1]
  def change
    unless column_exists?(:email_project_settings, :use_layout_default)
      add_column :email_project_settings, :use_layout_default, :boolean, null: false, default: true
    end

    unless column_exists?(:email_project_settings, :use_layout_plugin)
      add_column :email_project_settings, :use_layout_plugin, :boolean, null: false, default: false
    end
  end
end
