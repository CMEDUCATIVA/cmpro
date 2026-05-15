# frozen_string_literal: true

module IfcProperties
  module JobsHelper
    
    ##
    # Programa extracción asíncrona para un modelo IFC
    ##
    def self.schedule_extraction(ifc_model, user = nil, options = {})
      Rails.logger.info "[IFC Jobs Helper] Programando extracción para modelo #{ifc_model.id}"
      
      job = ExtractionJob.perform_later(
        ifc_model.id,
        user&.id,
        options
      )
      
      Rails.logger.info "[IFC Jobs Helper] Job programado con ID: #{job.job_id}"
      job
    end
    
    ##
    # Programa extracción inmediata (síncrona) para pruebas
    ##
    def self.extract_now(ifc_model, user = nil, options = {})
      Rails.logger.info "[IFC Jobs Helper] Extracción inmediata para modelo #{ifc_model.id}"
      
      service = ExtractionService.new(ifc_model)
      result = service.extract_and_save!
      
      if result[:success]
        Rails.logger.info "[IFC Jobs Helper] ✅ Extracción inmediata exitosa"
        notify_extraction_success(ifc_model, user, result[:data])
      else
        Rails.logger.error "[IFC Jobs Helper] ❌ Extracción inmediata falló: #{result[:error]}"
        notify_extraction_failure(ifc_model, user, result[:error])
      end
      
      result
    end
    
    ##
    # Programa limpieza automática
    ##
    def self.schedule_cleanup
      Rails.logger.info "[IFC Jobs Helper] Programando limpieza automática"
      CleanupJob.perform_later
    end
    
    ##
    # Verifica el estado de un job de extracción
    ##
    def self.job_status(job_id)
      # En una implementación completa, aquí verificaríamos el estado del job
      # Por ahora retornamos un estado genérico
      {
        id: job_id,
        status: :unknown,
        message: "Estado de job no disponible en esta versión"
      }
    end
    
    private
    
    def self.notify_extraction_success(ifc_model, user, result)
      Rails.logger.info "[IFC Jobs Helper] Notificando éxito de extracción"
    end
    
    def self.notify_extraction_failure(ifc_model, user, error)
      Rails.logger.error "[IFC Jobs Helper] Notificando fallo de extracción: #{error}"
    end
  end
end
