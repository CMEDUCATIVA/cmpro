# frozen_string_literal: true

class CreateIfcPropertiesTables < ActiveRecord::Migration[7.0]
  def change
    # Tabla principal para propiedades de elementos IFC
    create_table :ifc_element_properties do |t|
      # Relación con modelo IFC existente
      t.references :ifc_model, null: false, foreign_key: true, index: true
      
      # Identificación del elemento IFC
      t.string :element_guid, null: false, limit: 22, comment: 'GUID único del elemento IFC'
      t.string :element_type, null: false, limit: 100, comment: 'Tipo IFC (IfcWall, IfcSlab, etc.)'
      t.string :element_name, limit: 255, comment: 'Nombre del elemento'
      t.text :element_description, comment: 'Descripción del elemento'
      t.string :object_type, limit: 100, comment: 'Tipo de objeto específico'
      
      # Datos extraídos en formato JSON
      t.jsonb :properties, default: {}, null: false, comment: 'Propiedades personalizadas del elemento'
      t.jsonb :quantities, default: {}, null: false, comment: 'Cuantificaciones (área, volumen, etc.)'
      t.jsonb :materials, default: [], null: false, comment: 'Información de materiales'
      t.jsonb :location_info, default: {}, null: false, comment: 'Ubicación y nivel'
      t.jsonb :geometry_info, default: {}, null: false, comment: 'Información geométrica básica'
      
      # Metadatos de extracción
      t.datetime :extracted_at, null: false, default: -> { 'CURRENT_TIMESTAMP' }, comment: 'Fecha de extracción'
      t.string :extraction_version, limit: 10, comment: 'Versión del extractor utilizado'
      
      # Timestamps estándar de Rails
      t.timestamps
    end
    
    # Índices para optimización de consultas
    add_index :ifc_element_properties, [:ifc_model_id, :element_guid], 
              name: 'idx_ifc_props_model_guid', unique: true
    add_index :ifc_element_properties, :element_type, 
              name: 'idx_ifc_props_type'
    add_index :ifc_element_properties, :extracted_at, 
              name: 'idx_ifc_props_extracted_at'
    
    # Índices GIN para búsquedas en campos JSON
    add_index :ifc_element_properties, :properties, using: :gin, 
              name: 'idx_ifc_props_properties_gin'
    add_index :ifc_element_properties, :quantities, using: :gin, 
              name: 'idx_ifc_props_quantities_gin'
    
    # Tabla para estadísticas de extracción por modelo
    create_table :ifc_extraction_logs do |t|
      t.references :ifc_model, null: false, foreign_key: true, index: true
      t.integer :total_elements, default: 0, comment: 'Total de elementos procesados'
      t.integer :elements_with_properties, default: 0, comment: 'Elementos con propiedades'
      t.integer :elements_with_quantities, default: 0, comment: 'Elementos con cuantificaciones'
      t.integer :elements_with_materials, default: 0, comment: 'Elementos con materiales'
      t.jsonb :elements_by_type, default: {}, comment: 'Distribución de elementos por tipo'
      t.jsonb :extraction_statistics, default: {}, comment: 'Estadísticas detalladas'
      t.decimal :execution_time, precision: 8, scale: 3, comment: 'Tiempo de ejecución en segundos'
      t.string :extractor_version, limit: 10, comment: 'Versión del extractor'
      t.text :error_message, comment: 'Mensaje de error si falló'
      t.string :status, limit: 20, default: 'pending', comment: 'Estado: pending, processing, completed, failed'
      
      t.timestamps
    end
    
    add_index :ifc_extraction_logs, :status, name: 'idx_ifc_extraction_logs_status'
    add_index :ifc_extraction_logs, :created_at, name: 'idx_ifc_extraction_logs_created_at'
  end
end
