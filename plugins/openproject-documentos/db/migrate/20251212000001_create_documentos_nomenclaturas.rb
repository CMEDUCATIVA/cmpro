class CreateDocumentosNomenclaturas < ActiveRecord::Migration[6.1]
  def change
    create_table :documentos_nomenclaturas do |t|
      t.string :work_package_id
      t.string :proyecto
      t.string :creador
      t.string :volumen_sistema
      t.string :nivel_localizacion
      t.string :tipo
      t.string :disciplina
      t.string :numero
      t.string :descripcion
      t.string :estado
      t.string :revision
      t.string :extra

      t.timestamps
    end
  end
end
