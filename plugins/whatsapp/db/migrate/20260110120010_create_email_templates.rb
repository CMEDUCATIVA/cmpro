class CreateEmailTemplates < ActiveRecord::Migration[6.1]
  def change
    create_table :email_templates do |t|
      t.references :project, null: false
      t.string :name, null: false
      t.string :subject, null: false
      t.text :body, null: false
      t.text :body_html
      t.string :editor_mode, null: false, default: "editor"
      t.boolean :active, null: false, default: true
      t.timestamps
    end

    add_index :email_templates, [:project_id, :name], unique: true
  end
end
