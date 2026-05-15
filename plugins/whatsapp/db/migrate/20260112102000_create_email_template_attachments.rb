class CreateEmailTemplateAttachments < ActiveRecord::Migration[6.1]
  def change
    create_table :email_template_attachments do |t|
      t.references :email_template, null: false, foreign_key: true
      t.string :file_name, null: false
      t.string :content_type
      t.integer :file_size
      t.string :storage_path, null: false
      t.timestamps
    end
  end
end
