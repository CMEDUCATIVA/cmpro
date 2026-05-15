#!/usr/bin/env ruby

# Script de prueba para verificar integración Python-Ruby
require 'json'
require 'open3'
require 'timeout'

puts "=== PRUEBA DE INTEGRACIÓN PYTHON-RUBY ==="
puts

# Configuración
ifc_file = '/var/db/openproject/files/attachment/file/1200/IFC-ESCTRUCTURA.ifc'
python_script = '/opt/openproject/plugins/openproject-ifc_properties/lib_external/ifc_property_extractor.py'

puts "Archivo IFC: #{ifc_file}"
puts "Script Python: #{python_script}"
puts "Tamaño archivo: #{File.size(ifc_file) / 1024.0 / 1024.0} MB"
puts

# Verificaciones previas
unless File.exist?(ifc_file)
  puts "❌ Error: Archivo IFC no encontrado"
  exit 1
end

unless File.exist?(python_script)
  puts "❌ Error: Script Python no encontrado"
  exit 1
end

# Verificar IfcOpenShell
puts "Verificando IfcOpenShell..."
ifcopenshell_check = system("python3 -c 'import ifcopenshell; print(\"IfcOpenShell disponible:\", ifcopenshell.version)' 2>/dev/null")
unless ifcopenshell_check
  puts "❌ Error: IfcOpenShell no está disponible"
  exit 1
end
puts "✅ IfcOpenShell verificado"
puts

# Ejecutar parser
puts "Ejecutando parser Python..."
start_time = Time.now

cmd = ["python3", python_script, ifc_file]

begin
  Timeout.timeout(60) do  # Timeout de 1 minuto para prueba
    stdout, stderr, status = Open3.capture3(*cmd)
    
    end_time = Time.now
    duration = end_time - start_time
    
    puts "Tiempo de ejecución: #{duration.round(2)} segundos"
    puts
    
    if status.success?
      begin
        result = JSON.parse(stdout)
        
        if result['success']
          puts "✅ ÉXITO: Parser ejecutado correctamente"
          puts
          puts "=== RESULTADOS ==="
          puts "Total elementos procesados: #{result['total_elements']}"
          puts "Esquema IFC: #{result['ifc_schema']}"
          
          if result['statistics']
            stats = result['statistics']
            puts
            puts "=== ESTADÍSTICAS ==="
            puts "Elementos con propiedades: #{stats['total_with_properties']}"
            puts "Elementos con cuantificaciones: #{stats['total_with_quantities']}"
            puts "Elementos con materiales: #{stats['total_with_materials']}"
            
            if stats['elements_by_type']
              puts
              puts "=== DISTRIBUCIÓN POR TIPO ==="
              stats['elements_by_type'].each do |type, count|
                puts "  #{type}: #{count}"
              end
            end
          end
          
          # Mostrar ejemplo de elemento
          if result['elements'] && !result['elements'].empty?
            puts
            puts "=== EJEMPLO DE ELEMENTO ==="
            first_element = result['elements'].first
            element_data = first_element[1]
            puts "GUID: #{first_element[0]}"
            puts "Tipo: #{element_data['type']}"
            puts "Nombre: #{element_data['name']}"
            puts "Propiedades: #{element_data['properties']&.keys&.count || 0}"
            puts "Cuantificaciones: #{element_data['quantities']&.keys&.count || 0}"
            
            # Mostrar algunas propiedades si existen
            if element_data['properties'] && !element_data['properties'].empty?
              puts
              puts "=== PROPIEDADES DEL EJEMPLO ==="
              element_data['properties'].first(3).each do |prop_name, prop_data|
                puts "  #{prop_name}: #{prop_data['value']} (#{prop_data['type']})"
              end
            end
            
            # Mostrar algunas cuantificaciones si existen
            if element_data['quantities'] && !element_data['quantities'].empty?
              puts
              puts "=== CUANTIFICACIONES DEL EJEMPLO ==="
              element_data['quantities'].first(3).each do |qty_name, qty_data|
                puts "  #{qty_name}: #{qty_data['value']} #{qty_data['unit']} (#{qty_data['type']})"
              end
            end
            
            # Mostrar materiales si existen
            if element_data['materials'] && !element_data['materials'].empty?
              puts
              puts "=== MATERIALES DEL EJEMPLO ==="
              element_data['materials'].first(2).each do |material|
                puts "  Material: #{material['name']}"
                puts "    Descripción: #{material['description']}" if material['description']
                puts "    Espesor: #{material['thickness']}" if material['thickness']
              end
            end
          end
          
          puts
          puts "✅ INTEGRACIÓN PYTHON-RUBY FUNCIONANDO CORRECTAMENTE"
          
        else
          puts "❌ Error en parser: #{result['error']}"
          puts "Tipo de error: #{result['error_type']}" if result['error_type']
        end
        
      rescue JSON::ParserError => e
        puts "❌ Error parseando respuesta JSON: #{e.message}"
        puts "Stdout: #{stdout[0..500]}..." if stdout.length > 500
      end
      
    else
      puts "❌ Error ejecutando parser:"
      puts "Código de salida: #{status.exitstatus}"
      puts "Stderr: #{stderr}" if stderr && !stderr.empty?
    end
    
  end
  
rescue Timeout::Error
  puts "❌ Timeout: El parser tardó más de 60 segundos"
rescue StandardError => e
  puts "❌ Error inesperado: #{e.message}"
end

puts
puts "=== FIN DE PRUEBA ==="
