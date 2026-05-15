class AddConversionProgressAndStepToIfcModels < ActiveRecord::Migration[6.1]
  def up
    add_column :ifc_models, :conversion_progress, :integer, default: 0, null: false
    add_column :ifc_models, :conversion_step, :string

    execute <<~SQL.squish
      UPDATE ifc_models
      SET conversion_progress = CASE conversion_status
        WHEN 2 THEN 100
        WHEN 1 THEN 5
        ELSE 0
      END,
      conversion_step = CASE conversion_status
        WHEN 2 THEN 'Completado'
        WHEN 1 THEN 'Preparacion'
        WHEN 3 THEN 'Error'
        ELSE 'Pendiente'
      END
    SQL
  end

  def down
    remove_column :ifc_models, :conversion_progress
    remove_column :ifc_models, :conversion_step
  end
end
