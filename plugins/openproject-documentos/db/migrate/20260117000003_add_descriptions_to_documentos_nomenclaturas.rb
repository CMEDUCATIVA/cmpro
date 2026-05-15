class AddDescriptionsToDocumentosNomenclaturas < ActiveRecord::Migration[6.1]
  def change
    change_table :documentos_nomenclaturas, bulk: true do |t|
      t.string :proyecto_desc
      t.string :creador_desc
      t.string :volumen_sistema_desc
      t.string :nivel_localizacion_desc
      t.string :tipo_desc
      t.string :disciplina_desc
      t.string :numero_desc
      t.string :descripcion_desc
      t.string :estado_desc
      t.string :revision_desc
    end
  end
end
