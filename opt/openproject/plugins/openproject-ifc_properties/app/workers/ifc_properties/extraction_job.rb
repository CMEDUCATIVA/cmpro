# frozen_string_literal: true

##
# Job asíncrono para extracción de propiedades IFC
# Se ejecuta en background para no bloquear la interfaz
##
module IfcProperties
  class ExtractionJob < ApplicationJob
    queue_as :default
    
    # Configurar reintentos para errores temporales
    retry_on StandardError, attempts: 3, wait: :polynomially_longer
    
    # No reintentar para estos errores específicos
    discard_on ArgumentError

    ##
    # Ejecuta la extracción de propiedades para un modelo IFC
    # @param ifc_model_id [Integer] ID del modelo IFC
    # @param user_id [Integer] ID del usuario que solicitó la extracción
    # @param options [Hash] Opciones adicionales
    ##
    def perform(ifc_model_id, user_id = nil, options = {})
      Rails.logger.info "[IFC Extraction Job] Iniciando para modelo #{ifc_model_id}"
      
      # Encontrar modelo IFC
      ifc_model = find_ifc_model(ifc_model_id)
      return unless ifc_model

      # Marcar como procesando
      update_extraction_status(ifc_model, :processing)

      # Ejecutar extracción
      service = IfcProperties::ExtractionService.new(ifc_model)
      result = service.extract_and_save!

      if result[:success]
        handle_extraction_success(ifc_model, user_id, result[:data])
      else
        handle_extraction_failure(ifc_model, user_id, result[:error])
      end

    rescue StandardError => e
      Rails.logger.error "[IFC Extraction Job] Error inesperado: #{e.message}"
      Rails.logger.error e.backtrace.join("\n")
      
      if defined?(ifc_model) && ifc_model
        handle_extraction_failure(ifc_model, user_id, "Error interno: #{e.message}")
      end
      
      raise # Re-raise para que el sistema de jobs maneje reintentos
    end

    private

    ##
    # Encuentra el modelo IFC por ID
    ##
    def find_ifc_model(ifc_model_id)
      ifc_model = Bim::IfcModels::IfcModel.find_by(id: ifc_model_id)
      
      unless ifc_model
        Rails.logger.error "[IFC Extraction Job] Modelo IFC #{ifc_model_id} no encontrado"
        return nil
      end

      Rails.logger.info "[IFC Extraction Job] Procesando modelo: #{ifc_model.title}"
      ifc_model
    end

    ##
    # Actualiza el estado de extracción en el modelo
    ##
    def update_extraction_status(ifc_model, status, details = nil)
      Rails.logger.info "[IFC Extraction Job] Estado #{status} para modelo #{ifc_model.id}"
      
      case status
      when :processing
        Rails.logger.info "[IFC Extraction Job] Extracción iniciada para #{ifc_model.title}"
      when :completed
        Rails.logger.info "[IFC Extraction Job] Extracción completada para #{ifc_model.title}: #{details}"
      when :failed
        Rails.logger.error "[IFC Extraction Job] Extracción falló para #{ifc_model.title}: #{details}"
      end
    end

    ##
    # Maneja el resultado exitoso de la extracción
    ##
    def handle_extraction_success(ifc_model, user_id, extraction_result)
      update_extraction_status(ifc_model, :completed, extraction_result)
      
      Rails.logger.info "[IFC Extraction Job] ✅ Éxito para modelo #{ifc_model.id}"
      Rails.logger.info "[IFC Extraction Job] Elementos guardados: #{extraction_result[:saved_elements]}"
      
      # Notificar al usuario si está especificado
      if user_id
        notify_user_success(user_id, ifc_model, extraction_result)
      end

      # Notificar al sistema (hooks para otros plugins)
      notify_extraction_completed(ifc_model, extraction_result)
    end

    ##
    # Maneja el resultado fallido de la extracción
    ##
    def handle_extraction_failure(ifc_model, user_id, error_message)
      update_extraction_status(ifc_model, :failed, error_message)
      
      Rails.logger.error "[IFC Extraction Job] ❌ Fallo para modelo #{ifc_model.id}: #{error_message}"
      
      # Notificar al usuario si está especificado
      if user_id
        notify_user_failure(user_id, ifc_model, error_message)
      end

      # Notificar al sistema
      notify_extraction_failed(ifc_model, error_message)
    end

    ##
    # Notifica al usuario del éxito de la extracción
    ##
    def notify_user_success(user_id, ifc_model, extraction_result)
      user = User.find_by(id: user_id)
      return unless user

      Rails.logger.info "[IFC Extraction Job] Notificando éxito a usuario #{user.login}"
      
      message = "Extracción IFC completada para '#{ifc_model.title}': " \
                "#{extraction_result[:saved_elements]} elementos procesados"
      
      Rails.logger.info "[IFC Extraction Job] Mensaje para #{user.login}: #{message}"
    end

    ##
    # Notifica al usuario del fallo de la extracción
    ##
    def notify_user_failure(user_id, ifc_model, error_message)
      user = User.find_by(id: user_id)
      return unless user

      Rails.logger.error "[IFC Extraction Job] Notificando fallo a usuario #{user.login}"
      
      message = "Error en extracción IFC para '#{ifc_model.title}': #{error_message}"
      Rails.logger.error "[IFC Extraction Job] Mensaje de error para #{user.login}: #{message}"
    end

    ##
    # Notifica al sistema que la extracción se completó
    ##
    def notify_extraction_completed(ifc_model, extraction_result)
      # Hook para otros plugins o sistemas
      # En una implementación futura se pueden añadir webhooks o notificaciones
      Rails.logger.info "[IFC Extraction Job] Sistema notificado de extracción exitosa"
    end

    ##
    # Notifica al sistema que la extracción falló
    ##
    def notify_extraction_failed(ifc_model, error_message)
      # Hook para otros plugins o sistemas
      Rails.logger.error "[IFC Extraction Job] Sistema notificado de fallo en extracción"
    end
  end
end
