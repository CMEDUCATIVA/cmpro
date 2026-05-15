class AddHtmlToEmailTemplates < ActiveRecord::Migration[6.1]
  def change
    unless column_exists?(:email_templates, :body_html)
      add_column :email_templates, :body_html, :text
    end

    unless column_exists?(:email_templates, :editor_mode)
      add_column :email_templates, :editor_mode, :string, null: false, default: "editor"
    end
  end
end
