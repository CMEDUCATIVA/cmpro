# frozen_string_literal: true

##
# Servicio para extracción de propiedades IFC
# Wrapper Ruby que ejecuta el parser Python y procesa los resultados
##
module IfcProperties
  class ExtractionService
    include Dry::Monads[:result]

    attr_reader :ifc_model, :python_script_path

    def initialize(ifc_model)
      @ifc_model = ifc_model
      @python_script_path = Rails.root.join('plugins', 'openproject-ifc_properties', 'lib_external', 'ifc_property_extractor.py')
    end

    ##
    # Ejecuta la extracción de propiedades IFC
    # @return [Success, Failure] Resultado de la operación
    ##
    def call
      Rails.logger.info "[IFC Properties] Iniciando extracción para modelo #{@ifc_model.id}"

      # Validaciones previas
      validation_result = validate_preconditions
      return validation_result if validation_result.failure?

      # Obtener ruta del archivo IFC
      ifc_file_path = get_ifc_file_path
      return Failure("No se pudo obtener la ruta del archivo IFC") unless ifc_file_path

      # Ejecutar parser Python
      extraction_result = execute_python_parser(ifc_file_path)
      return extraction_result if extraction_result.failure?

      # Procesar y validar resultados
      parsed_data = extraction_result.value!
      
      # Loggear estadísticas
      log_extraction_statistics(parsed_data)

      Success(parsed_data)
    rescue StandardError => e
      Rails.logger.error "[IFC Properties] Error durante extracción: #{e.message}"
      Rails.logger.error e.backtrace.join("\n")
      Failure("Error interno durante extracción: #{e.message}")
    end

    ##
    # Ejecuta extracción y guarda automáticamente en base de datos
    # @return [Success, Failure] Resultado con conteo de elementos guardados
    ##
    def extract_and_save!
      result = call
      return result if result.failure?

      save_result = save_extraction_data(result.value!)
      save_result
    end

    private

    ##
    # Valida precondiciones para la extracción
    ##
    def validate_preconditions
      return Failure("Modelo IFC no válido") unless @ifc_model&.persisted?
      return Failure("Archivo IFC no encontrado") unless @ifc_model.ifc_attachment.present?
      return Failure("Script Python no encontrado en #{@python_script_path}") unless File.exist?(@python_script_path)
      
      # Verificar que Python e IfcOpenShell estén disponibles
      python_check = system("python3 -c 'import ifcopenshell' 2>/dev/null")
      return Failure("IfcOpenShell no está disponible") unless python_check

      Success("Validaciones pasadas")
    end

    ##
    # Obtiene la ruta física del archivo IFC
    ##
    def get_ifc_file_path
      attachment = @ifc_model.ifc_attachment
      return nil unless attachment&.diskfile&.path

      file_path = attachment.diskfile.path
      return nil unless File.exist?(file_path)

      file_path
    end

    ##
    # Ejecuta el parser Python con el archivo IFC
    ##
    def execute_python_parser(ifc_file_path)
      Rails.logger.info "[IFC Properties] Ejecutando parser para #{File.basename(ifc_file_path)}"
      
      # Construir comando con seguridad
      cmd = [
        "python3",
        @python_script_path.to_s,
        ifc_file_path
      ]

      # Ejecutar con timeout
      result = nil
      status = nil
      
      begin
        # Timeout de 5 minutos para archivos grandes
        Timeout.timeout(300) do
          result = Open3.capture3(*cmd)
        end
        
        stdout, stderr, status = result
        
        if status.success?
          begin
            parsed_data = JSON.parse(stdout)
            
            if parsed_data['success']
              Rails.logger.info "[IFC Properties] Extracción exitosa: #{parsed_data['total_elements']} elementos"
              Success(parsed_data)
            else
              error_msg = parsed_data['error'] || 'Error desconocido en parser Python'
              Rails.logger.error "[IFC Properties] Error en parser: #{error_msg}"
              Failure("Error en parser Python: #{error_msg}")
            end
          rescue JSON::ParserError => e
            Rails.logger.error "[IFC Properties] Error parseando JSON: #{e.message}"
            Rails.logger.error "[IFC Properties] Stdout: #{stdout}"
            Failure("Respuesta inválida del parser Python")
          end
        else
          Rails.logger.error "[IFC Properties] Parser falló con código #{status.exitstatus}"
          Rails.logger.error "[IFC Properties] Stderr: #{stderr}" if stderr.present?
          Failure("Parser Python falló: #{stderr}")
        end
      rescue Timeout::Error
        Rails.logger.error "[IFC Properties] Parser excedió timeout de 5 minutos"
        Failure("Extracción cancelada por timeout (archivo muy grande)")
      rescue StandardError => e
        Rails.logger.error "[IFC Properties] Error ejecutando parser: #{e.message}"
        Failure("Error ejecutando parser: #{e.message}")
      end
    end

##
# Guarda los datos extraídos en la base de datos
##
def save_extraction_data(extraction_data)
  elements_data = extraction_data['elements'] || {}
  saved_count = 0
  error_count = 0

  puts "[IFC Properties] Guardando #{elements_data.length} elementos en BD"

  # Crear log de extracción
  extraction_log = IfcProperties::ExtractionLog.create!(
    ifc_model: @ifc_model,
    status: 'processing',
    extractor_version: '1.0.0'
  )

  begin
    ActiveRecord::Base.transaction do
      # Limpiar datos existentes para este modelo
      IfcProperties::ElementProperty.where(ifc_model_id: @ifc_model.id).delete_all

      elements_data.each do |element_guid, element_data|
        begin
          create_element_property(element_guid, element_data)
          saved_count += 1
        rescue StandardError => e
          puts "[IFC Properties] Error guardando elemento #{element_guid}: #{e.message}"
          error_count += 1
        end
      end

      # Actualizar log con estadísticas
      extraction_log.mark_completed!({
        total_elements: elements_data.length,
        elements_with_properties: extraction_data.dig('statistics', 'total_with_properties') || 0,
        elements_with_quantities: extraction_data.dig('statistics', 'total_with_quantities') || 0,
        elements_with_materials: extraction_data.dig('statistics', 'total_with_materials') || 0,
        elements_by_type: extraction_data.dig('statistics', 'elements_by_type') || {},
        extraction_statistics: extraction_data['statistics'] || {}
      })
    end

    puts "[IFC Properties] Guardado completado: #{saved_count} éxitos, #{error_count} errores"

    if saved_count > 0
      success_result({
        saved_elements: saved_count,
        error_elements: error_count,
        total_processed: elements_data.length,
        statistics: extraction_data['statistics']
      })
    else
      failure_result("No se pudieron guardar elementos en la base de datos")
    end
  rescue StandardError => e
    extraction_log.mark_failed!(e.message)
    puts "[IFC Properties] Error en transacción BD: #{e.message}"
    failure_result("Error guardando en base de datos: #{e.message}")
  end
end

##
# Crea un registro ElementProperty desde los datos extraídos
##
def create_element_property(element_guid, element_data)
  IfcProperties::ElementProperty.create!(
    ifc_model_id: @ifc_model.id,
    element_guid: element_guid,
    element_type: element_data['type'],
    element_name: element_data['name'],
    element_description: element_data['description'],
    object_type: element_data['object_type'],
    properties: element_data['properties'] || {},
    quantities: element_data['quantities'] || {},
    materials: element_data['materials'] || [],
    location_info: element_data['location'] || {},
    geometry_info: element_data['geometry'] || {},
    extracted_at: Time.current,
    extraction_version: '1.0.0'
  )
end
    ##
    # Registra estadísticas de la extracción en logs
    ##
    def log_extraction_statistics(extraction_data)
      stats = extraction_data['statistics'] || {}
      total = extraction_data['total_elements'] || 0

      Rails.logger.info "[IFC Properties] === ESTADÍSTICAS DE EXTRACCIÓN ==="
      Rails.logger.info "[IFC Properties] Total elementos: #{total}"
      Rails.logger.info "[IFC Properties] Con propiedades: #{stats['total_with_properties']}"
      Rails.logger.info "[IFC Properties] Con cuantificaciones: #{stats['total_with_quantities']}"
      Rails.logger.info "[IFC Properties] Con materiales: #{stats['total_with_materials']}"
      Rails.logger.info "[IFC Properties] Esquema IFC: #{extraction_data['ifc_schema']}"

      if stats['elements_by_type']
        Rails.logger.info "[IFC Properties] Distribución por tipo:"
        stats['elements_by_type'].each do |type, count|
          Rails.logger.info "[IFC Properties]   - #{type}: #{count}"
        end
      end
    end
# ... otros métodos de la clase ExtractionService ...

    ##
    # Resultado exitoso
    ##
    def success_result(data)
      { success: true, data: data }
    end

    ##
    # Resultado fallido
    ##
    def failure_result(message)
      { success: false, error: message }
    end
    ##
    # Clase de utilidades para validación de archivos IFC
    ##
    class FileValidator
      def self.valid_ifc_file?(file_path)
        return false unless File.exist?(file_path)
        return false unless File.readable?(file_path)
        
        # Verificar que sea un archivo IFC válido (header)
        File.open(file_path, 'r') do |file|
          first_line = file.readline.strip
          return first_line.start_with?('ISO-10303-21')
        end
      rescue StandardError
        false
      end

      def self.file_size_mb(file_path)
        File.size(file_path) / 1024.0 / 1024.0
      end
    end
  end
end
