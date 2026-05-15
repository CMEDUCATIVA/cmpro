# frozen_string_literal: true

module IfcProperties
  class ElementProperty < ApplicationRecord
    self.table_name = 'ifc_element_properties'
    
    # Relaciones
    belongs_to :ifc_model, class_name: 'Bim::IfcModels::IfcModel'
    
    # Validaciones
    validates :element_guid, presence: true, uniqueness: { scope: :ifc_model_id }
    validates :element_type, presence: true
    validates :ifc_model_id, presence: true
    
    # Scopes para consultas comunes
    scope :by_type, ->(type) { where(element_type: type) }
    scope :with_properties, -> { where.not(properties: {}) }
    scope :with_quantities, -> { where.not(quantities: {}) }
    scope :with_materials, -> { where("jsonb_array_length(materials) > 0") }
    scope :recent, -> { order(extracted_at: :desc) }
    
    # Métodos de conveniencia para acceder a datos específicos
    def area
      quantities.dig('GrossArea', 'value') || 
      quantities.dig('NetArea', 'value') || 
      quantities.dig('Area', 'value')
    end
    
    def volume
      quantities.dig('GrossVolume', 'value') || 
      quantities.dig('NetVolume', 'value') || 
      quantities.dig('Volume', 'value')
    end
    
    def length
      quantities.dig('Length', 'value') || 
      quantities.dig('Perimeter', 'value')
    end
    
    def weight
      quantities.dig('Weight', 'value') || 
      properties.dig('Peso exacto', 'value')
    end
    
    def structural_material
      properties.dig('Material estructural', 'value') || 
      materials.first&.dig('name')
    end
    
    # Métodos para búsquedas en JSON
    def self.with_property(property_name, value = nil)
      if value
        where("properties ->> ? = ?", property_name, value.to_s)
      else
        where("properties ? ?", property_name)
      end
    end
    
    def self.with_quantity(quantity_name, min_value = nil, max_value = nil)
      query = where("quantities ? ?", quantity_name)
      
      if min_value
        query = query.where("CAST(quantities -> ? ->> 'value' AS NUMERIC) >= ?", quantity_name, min_value)
      end
      
      if max_value
        query = query.where("CAST(quantities -> ? ->> 'value' AS NUMERIC) <= ?", quantity_name, max_value)
      end
      
      query
    end
    
    def self.by_material(material_name)
      where("materials @> ?", [{ name: material_name }].to_json)
    end
    
    # Métodos de estadísticas
    def self.statistics_by_type
      group(:element_type).count
    end
    
    def self.total_area
      sum("CAST(quantities -> 'GrossArea' ->> 'value' AS NUMERIC)") || 0
    end
    
    def self.total_volume
      sum("CAST(quantities -> 'GrossVolume' ->> 'value' AS NUMERIC)") || 0
    end
    
    # Método para exportar datos
    def to_summary
      {
        guid: element_guid,
        type: element_type,
        name: element_name,
        area: area,
        volume: volume,
        length: length,
        weight: weight,
        material: structural_material,
        extracted_at: extracted_at
      }
    end
  end
end
