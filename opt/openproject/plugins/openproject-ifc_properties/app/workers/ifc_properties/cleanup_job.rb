# frozen_string_literal: true

##
# Job para limpieza automática de datos antiguos de propiedades IFC
##
module IfcProperties
  class CleanupJob < ApplicationJob
    queue_as :low_priority
    
    ##
    # Limpia datos de propiedades IFC para modelos eliminados
    ##
    def perform
      Rails.logger.info "[IFC Cleanup Job] Iniciando limpieza automática"
      
      # En Fase 4 implementaremos la limpieza real de BD
      # Por ahora solo loggeamos
      
      Rails.logger.info "[IFC Cleanup Job] Limpieza completada"
    end
  end
end
