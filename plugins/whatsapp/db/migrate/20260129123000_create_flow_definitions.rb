class CreateFlowDefinitions < ActiveRecord::Migration[7.1]
  def change
    create_table :flow_definitions do |t|
      t.references :project, null: false, foreign_key: true, index: { unique: true }
      t.string :name, null: false, default: "Flujo principal"
      t.string :status, null: false, default: "draft"
      t.text :definition_json
      t.timestamps
    end
  end
end
