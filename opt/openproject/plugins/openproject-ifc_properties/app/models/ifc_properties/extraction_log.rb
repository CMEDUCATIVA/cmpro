# frozen_string_literal: true

module IfcProperties
  class ExtractionLog < ApplicationRecord
    self.table_name = 'ifc_extraction_logs'
    
    # Relaciones
    belongs_to :ifc_model, class_name: 'Bim::IfcModels::IfcModel'
    
    # Validaciones
    validates :ifc_model_id, presence: true
    validates :status, inclusion: { in: %w[pending processing completed failed] }
    validates :total_elements, numericality: { greater_than_or_equal_to: 0 }
    
    # Scopes
    scope :completed, -> { where(status: 'completed') }
    scope :failed, -> { where(status: 'failed') }
    scope :recent, -> { order(created_at: :desc) }
    
    # Métodos de estado
    def pending?
      status == 'pending'
    end
    
    def processing?
      status == 'processing'
    end
    
    def completed?
      status == 'completed'
    end
    
    def failed?
      status == 'failed'
    end
    
    # Método para marcar como completado
    def mark_completed!(stats = {})
      update!(
        status: 'completed',
        total_elements: stats[:total_elements] || 0,
        elements_with_properties: stats[:elements_with_properties] || 0,
        elements_with_quantities: stats[:elements_with_quantities] || 0,
        elements_with_materials: stats[:elements_with_materials] || 0,
        elements_by_type: stats[:elements_by_type] || {},
        extraction_statistics: stats[:extraction_statistics] || {},
        execution_time: stats[:execution_time]
      )
    end
    
    # Método para marcar como fallido
    def mark_failed!(error_message)
      update!(
        status: 'failed',
        error_message: error_message
      )
    end
  end
end
