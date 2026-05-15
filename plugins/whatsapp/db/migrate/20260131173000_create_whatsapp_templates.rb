class CreateWhatsappTemplates < ActiveRecord::Migration[7.1]
  def change
    create_table :whatsapp_templates do |t|
      t.references :project, null: false, foreign_key: true
      t.string :name, null: false
      t.string :template_type, null: false
      t.text :body_text
      t.text :media_url
      t.string :file_name
      t.string :content_type
      t.integer :file_size
      t.text :storage_path
      t.boolean :active, default: true
      t.integer :created_by_id
      t.integer :updated_by_id
      t.timestamps
    end

    add_index :whatsapp_templates, [:project_id, :name]
  end
end
