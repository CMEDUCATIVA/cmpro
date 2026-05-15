class CreateDocumentosLightragDocuments < ActiveRecord::Migration[6.1]
  def change
    create_table :documentos_lightrag_documents do |t|
      t.integer :file_link_id, null: false
      t.string :filename
      t.string :doc_id, null: false

      t.timestamps
    end

    add_index :documentos_lightrag_documents, :file_link_id, unique: true
    add_index :documentos_lightrag_documents, :doc_id
  end
end
