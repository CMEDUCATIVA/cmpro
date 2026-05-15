require_relative '../debug_service'

module IaColaborativa
  module Handlers
    # ============================================================================
    # 📋 PROJECTS HANDLER - GESTOR DE CONSULTAS DE PROYECTOS
    # ============================================================================
    #
    # Especializado en:
    # - Listar proyectos activos
    # - Obtener detalles de un proyecto específico
    # - Búsqueda de proyectos por nombre
    # - Conteo de proyectos
    #
    # Endpoints MCP utilizados:
    # - POST /tools/list_projects?active_only=true
    # - POST /tools/get_project/{id}
    #
    class ProjectsHandler
      class << self

        # ============================================================================
        # DETECCIÓN DE CONSULTAS DE PROYECTOS
        # ============================================================================

        def handles?(message)
          message_lower = message.downcase

          # Patrones que identifican consultas de proyectos
          patterns = [
            /(?:cuántos|cuantos|número|numero|total).*proyectos/i,
            /(?:lista|listar|mostrar|ver|dame).*proyectos/i,
            /proyectos?\s+(?:activos|disponibles)/i,
            /todos\s+los\s+proyectos/i,
            /proyecto\s*(?:id|#)\s*(\d+)/i,
            /(?:detalles|info|información).*proyecto/i,
            /proyecto\s+['"](.+?)['"]/i, # Proyecto por nombre entre comillas
            /(?:información|info|detalles|datos).*(?:del|sobre)\s+proyecto\s+(.+?)(?:\?|$)/i, # "información del proyecto NOMBRE"
            # NUEVOS PATRONES PARA FILTRADO POR 3 NIVELES
            /proyectos?\s+(?:nivel|niveles?)\s*(\d+)/i, # "proyectos nivel 1", "proyectos nivel 2"
            /(?:jerarquía|estructura|árbol)\s+de\s+proyectos/i, # "jerarquía de proyectos"
            /proyectos?\s+ra[íi]z/i, # "proyectos raíz"
            /subproyectos/i, # "subproyectos"
            /sub\s+subproyectos/i, # "sub-subproyectos"
            /proyectos?\s+padres?/i, # "proyectos padre"
            /proyectos?\s+hijos?/i # "proyectos hijos"
          ]

          patterns.any? { |pattern| message_lower =~ pattern }
        end

        # ============================================================================
        # PROCESAMIENTO PRINCIPAL
        # ============================================================================

        def process(message, logger: nil)
          log_info("Procesando consulta de proyectos", logger)

          # Log handler delegation
          DebugService.log_event('handler_start', 'ProjectsHandler', { message: message })

          message_lower = message.downcase

          # Detectar tipo de consulta
          result = if message_lower =~ /proyecto\s*(?:id|#)\s*(\d+)/i && !message_lower.include?('tareas')
            # Proyecto específico por ID
            project_id = $1.to_i
            log_info("Obteniendo proyecto ID #{project_id}", logger)
            fetch_project_by_id(project_id, message, logger)

          elsif message_lower =~ /proyecto\s+['"](.+?)['"]/i
            # Proyecto por nombre (entre comillas)
            project_name = $1
            log_info("Buscando proyecto por nombre: #{project_name}", logger)
            fetch_projects_by_name(project_name, message, logger)

          elsif extracted_name = extract_project_name_from_query(message)
            # Extraer nombre del proyecto de la consulta general
            log_info("Nombre de proyecto detectado: #{extracted_name}", logger)
            fetch_projects_by_name(extracted_name, message, logger)

          # NUEVOS HANDLERS PARA FILTRADO POR 3 NIVELES
          elsif message_lower =~ /proyectos?\s+(?:nivel|niveles?)\s*(\d+)/i
            # Filtrado por nivel específico
            level = $1.to_i
            log_info("Filtrando proyectos por nivel #{level}", logger)
            fetch_projects_by_level(level, message, logger)

          elsif message_lower =~ /(?:jerarquía|estructura|árbol)\s+de\s+proyectos/i
            # Jerarquía completa
            log_info("Obteniendo jerarquía completa de proyectos", logger)
            fetch_projects_hierarchy(message, logger)

          elsif message_lower =~ /proyectos?\s+ra[íi]z/i
            # Proyectos de nivel 1 (raíz)
            log_info("Obteniendo proyectos raíz (nivel 1)", logger)
            fetch_projects_level_1(message, logger)

          elsif message_lower =~ /subproyectos/i
            # Proyectos de nivel 2 (subproyectos)
            parent_id = extract_parent_id_from_message(message)
            log_info("Obteniendo subproyectos (nivel 2)#{parent_id ? " del padre #{parent_id}" : ""}", logger)
            fetch_projects_level_2(parent_id, message, logger)

          elsif message_lower =~ /sub\s+subproyectos/i
            # Proyectos de nivel 3 (sub-subproyectos)
            parent_id = extract_parent_id_from_message(message)
            log_info("Obteniendo sub-subproyectos (nivel 3)#{parent_id ? " del padre #{parent_id}" : ""}", logger)
            fetch_projects_level_3(parent_id, message, logger)

          else
            # Lista de proyectos (general)
            log_info("Listando proyectos activos", logger)
            fetch_all_projects(message, logger)
          end

          # Log handler delegation result
          DebugService.log_handler_delegation('ProjectsHandler', message, result)

          # Add handler name to result
          result[:handler_name] = 'ProjectsHandler' if result.is_a?(Hash)

          result
        end

        # ============================================================================
        # OBTENER PROYECTO POR ID
        # ============================================================================

        def fetch_project_by_id(project_id, message, logger)
          result = McpService.get_project(project_id)

          unless result[:success]
            return {
              success: false,
              error: result[:error],
              fallback_message: "No pude obtener los detalles del proyecto ID #{project_id}. #{result[:error]}"
            }
          end

          {
            success: true,
            data: result[:data],
            prompt_context: build_project_detail_prompt(message, result[:data]),
            system_prompt: project_detail_system_prompt
          }
        end

        # ============================================================================
        # OBTENER PROYECTOS POR NOMBRE
        # ============================================================================

        def fetch_projects_by_name(project_name, message, logger)
          # Obtener todos los proyectos del MCP
          result = McpService.list_projects(active_only: true)

          unless result[:success]
            return {
              success: false,
              error: result[:error],
              fallback_message: "No pude buscar proyectos. #{result[:error]}"
            }
          end

          # Extraer elementos de proyectos
          all_projects = result[:data]['_embedded']['elements'] rescue []

          if all_projects.empty?
            return {
              success: false,
              error: "No hay proyectos disponibles",
              fallback_message: "No hay proyectos disponibles en el sistema."
            }
          end

          log_info("Total de proyectos antes de filtrar: #{all_projects.size}", logger)

          # DEBUG: Buscar si existe el proyecto con ID 320
          project_320 = all_projects.find { |p| p['id'] == 320 }
          if project_320
            log_info("✅ Proyecto ID 320 encontrado: #{project_320['name']}", logger)
          else
            log_info("❌ Proyecto ID 320 NO encontrado en la lista", logger)
          end

          # DEBUG: Buscar proyectos que contengan "BIM" o "HIDRÁULICAS" en el nombre
          bim_projects = all_projects.select { |p|
            name = p['name'].downcase
            name.include?('bim') || name.include?('hidráulica') || name.include?('hidraulica')
          }
          
          if bim_projects.any?
            log_info("✅ Proyectos BIM/Hidráulicas encontrados: #{bim_projects.size}", logger)
            bim_projects.each do |p|
              log_info("   - #{p['name']} (ID: #{p['id']})", logger)
            end
          else
            log_info("❌ No se encontraron proyectos con 'BIM' o 'Hidráulicas'", logger)
          end

          # DEBUG: Mostrar los primeros 20 proyectos para referencia
          log_info("📋 Primeros 20 proyectos para referencia:", logger)
          all_projects.first(20).each do |p|
            log_info("   - #{p['name']} (ID: #{p['id']})", logger)
          end

          # AGREGAR LOG ESPECÍFICO PARA DEBUG CON TODOS LOS PROYECTOS
          DebugService.log_event('projects_debug', 'ProjectsHandler', {
            total_projects: all_projects.size,
            search_term: project_name,
            sample_projects: all_projects.first(10).map { |p|
              { id: p['id'], name: p['name'], identifier: p['identifier'] }
            },
            bim_projects_found: bim_projects.any?,
            bim_projects_list: bim_projects.map { |p|
              { id: p['id'], name: p['name'] }
            }
          })

          # FILTRAR PROYECTOS usando búsqueda inteligente
          filtered_projects = smart_filter_projects(all_projects, project_name, logger)

          log_info("Proyectos encontrados después del filtro: #{filtered_projects.size}", logger)

          # Si encontramos proyectos, retornar solo los filtrados
          if filtered_projects.any?
            filtered_data = result[:data].dup
            filtered_data['_embedded']['elements'] = filtered_projects
            filtered_data['total'] = filtered_projects.size
            filtered_data['count'] = filtered_projects.size

            {
              success: true,
              data: filtered_data,
              prompt_context: build_project_search_prompt(message, project_name, filtered_data),
              system_prompt: project_search_system_prompt
            }
          else
            # No se encontraron coincidencias, retornar mensaje específico
            {
              success: true,
              data: result[:data],
              prompt_context: build_no_match_prompt(message, project_name, result[:data]),
              system_prompt: project_no_match_system_prompt
            }
          end
        end

        # ============================================================================
        # LISTAR TODOS LOS PROYECTOS
        # ============================================================================

        def fetch_all_projects(message, logger)
          result = McpService.list_projects(active_only: true)

          unless result[:success]
            return {
              success: false,
              error: result[:error],
              fallback_message: "No pude obtener la lista de proyectos. #{result[:error]}"
            }
          end

          {
            success: true,
            data: result[:data],
            prompt_context: build_project_list_prompt(message, result[:data]),
            system_prompt: project_list_system_prompt
          }
        end

        # ============================================================================
        # HANDLERS ESPECÍFICOS PARA FILTRADO POR 3 NIVELES
        # ============================================================================

        def fetch_projects_by_level(level, message, logger)
          case level
          when 1
            result = McpService.get_projects_level_1(active_only: true)
            if result[:success]
              return {
                success: true,
                data: result[:data],
                prompt_context: build_level_1_prompt(message, result[:data]),
                system_prompt: projects_level_system_prompt
              }
            else
              return {
                success: false,
                error: result[:error],
                fallback_message: "No pude obtener los proyectos de nivel 1. #{result[:error]}"
              }
            end

          when 2
            parent_id = extract_parent_id_from_message(message)
            result = McpService.get_projects_level_2(
              parent_id: parent_id,
              active_only: true
            )
            if result[:success]
              return {
                success: true,
                data: result[:data],
                prompt_context: build_level_2_prompt(message, result[:data], parent_id),
                system_prompt: projects_level_system_prompt
              }
            else
              return {
                success: false,
                error: result[:error],
                fallback_message: "No pude obtener los proyectos de nivel 2. #{result[:error]}"
              }
            end

          when 3
            parent_id = extract_parent_id_from_message(message)
            result = McpService.get_projects_level_3(
              parent_id: parent_id,
              active_only: true
            )
            if result[:success]
              return {
                success: true,
                data: result[:data],
                prompt_context: build_level_3_prompt(message, result[:data], parent_id),
                system_prompt: projects_level_system_prompt
              }
            else
              return {
                success: false,
                error: result[:error],
                fallback_message: "No pude obtener los proyectos de nivel 3. #{result[:error]}"
              }
            end

          else
            return {
              success: false,
              error: "Nivel no válido. Use niveles 1, 2 o 3.",
              fallback_message: "Los niveles válidos son 1 (raíz), 2 (subproyectos) y 3 (sub-subproyectos)."
            }
          end
        end

        def fetch_projects_level_1(message, logger)
          result = McpService.get_projects_level_1(active_only: true)
          
          unless result[:success]
            return {
              success: false,
              error: result[:error],
              fallback_message: "No pude obtener los proyectos raíz. #{result[:error]}"
            }
          end

          {
            success: true,
            data: result[:data],
            prompt_context: build_level_1_prompt(message, result[:data]),
            system_prompt: projects_level_system_prompt
          }
        end

        def fetch_projects_level_2(parent_id, message, logger)
          result = McpService.get_projects_level_2(
            parent_id: parent_id,
            active_only: true
          )
          
          unless result[:success]
            return {
              success: false,
              error: result[:error],
              fallback_message: "No pude obtener los subproyectos. #{result[:error]}"
            }
          end

          {
            success: true,
            data: result[:data],
            prompt_context: build_level_2_prompt(message, result[:data], parent_id),
            system_prompt: projects_level_system_prompt
          }
        end

        def fetch_projects_level_3(parent_id, message, logger)
          result = McpService.get_projects_level_3(
            parent_id: parent_id,
            active_only: true
          )
          
          unless result[:success]
            return {
              success: false,
              error: result[:error],
              fallback_message: "No pude obtener los sub-subproyectos. #{result[:error]}"
            }
          end

          {
            success: true,
            data: result[:data],
            prompt_context: build_level_3_prompt(message, result[:data], parent_id),
            system_prompt: projects_level_system_prompt
          }
        end

        def fetch_projects_hierarchy(message, logger)
          result = McpService.get_projects_hierarchy(active_only: true)
          
          unless result[:success]
            return {
              success: false,
              error: result[:error],
              fallback_message: "No pude obtener la jerarquía de proyectos. #{result[:error]}"
            }
          end

          {
            success: true,
            data: result[:data],
            prompt_context: build_hierarchy_prompt(message, result[:data]),
            system_prompt: projects_hierarchy_system_prompt
          }
        end

        # ============================================================================
        # PROMPTS PERSONALIZADOS PARA PROYECTOS
        # ============================================================================

        def project_list_system_prompt
          <<~PROMPT
            Eres SaraIA Obra, especialista en gestión de proyectos de CMPROYECTOS.

            Tu tarea es presentar la lista de proyectos de forma clara y organizada.

            Instrucciones de formato:
            - Usa markdown para estructurar
            - Presenta cada proyecto con: **Nombre del Proyecto** (ID: XXX)
            - Si hay descripción, agrégala brevemente
            - Agrupa por estado si aplica (activo, archivado, etc.)
            - Incluye el total de proyectos al inicio
            - Si son más de 10 proyectos, muestra los primeros 10 y menciona el total

            Ejemplo de formato:
            ```
            **Total: 15 proyectos activos**

            1. **Edificio Residencial Plaza Mayor** (ID: 702)
               - Estado: En progreso
               - Inicio: 15/01/2024

            2. **Reforma Hospital Central** (ID: 705)
               - Estado: Planificación
            ```

            IMPORTANTE:
            - NO te presentes (no digas "Hola, soy SaraIA...")
            - Responde DIRECTAMENTE sin saludos
            - Sé concisa y clara

            Responde siempre en español.
          PROMPT
        end

        def project_detail_system_prompt
          <<~PROMPT
            Eres SaraIA Obra, especialista en gestión de proyectos de CMPROYECTOS.

            Tu tarea es generar un REPORTE TÉCNICO VISUALMENTE MEJORADO para un proyecto específico.

            INSTRUCCIONES DE FORMATO AVANZADO:
            
            1. **ESTRUCTURA PRINCIPAL:**
               - Título principal con emoji: # 🏗️ REPORTE TÉCNICO DE PROYECTO
               - Subtítulo con nombre del proyecto: ## NOMBRE DEL PROYECTO
               - Línea separadora: ---

            2. **RESUMEN EJECUTIVO:**
               - Sección: ### 📊 **RESUMEN EJECUTIVO**
               - Tabla con métricas clave: | Métrica | Valor | Estado |
               - Incluir ID, identificador, estado general, fechas
               - Usar emojis de estado: ✅ ⚠️ 🔒 📅 🔄

            3. **INFORMACIÓN CRÍTICA:**
               - Sección: ### 🎯 **INFORMACIÓN CRÍTICA**
               - Usar formato diff para mostrar configuración:
               ```diff
               + Configuración básica completa
               - Sin descripción del proyecto
               - Sin miembros asignados
               ```

            4. **DETALLES TÉCNICOS:**
               - Sección: ### 📋 **DETALLES TÉCNICOS**
               - Subsecciones con emojis: #### 🔧 Configuración Básica, #### 📝 Descripciones, #### 🏷️ Campos Personalizados
               - Usar tablas para datos estructurados
               - Mostrar tipos de datos: `String`, `Integer`, `Boolean`

            5. **ENDPOINTS API:**
               - Sección: ### 🔗 **ENDPOINTS API DISPONIBLES**
               - Subsecciones: #### 📡 Operaciones CRUD, #### 📦 Gestión de Work Packages
               - Tablas con método, endpoint, funcionalidad, estado
               - Usar emojis: ✅ para disponible

            6. **ESTRUCTURA JERÁRQUICA:**
               - Sección: ### 🌳 **ESTRUCTURA JERÁRQUICA**
               - Usar diagrama ASCII:
               ```
               📁 Proyecto (ID: XXX)
               ├── 👤 Miembros: X asignados
               ├── 📋 Work Packages: X creados
               └── 📂 Categorías: X definidas
               ```

            7. **MÉTRICAS DE SALUD:**
               - Sección: ### ⚡ **MÉTRICAS DE SALUD**
               - Indicadores visuales con emojis: 📈 📉 🔄 ⚠️
               - Incluir porcentaje de completitud

            8. **RECOMENDACIONES:**
               - Sección: ### 🚨 **RECOMENDACIONES TÉCNICAS**
               - Subsecciones priorizadas: #### 🔥 Acciones Inmediatas, #### ⚙️ Configuración Recomendada, #### 🛡️ Seguridad y Optimización
               - Listas numeradas con acciones específicas

            9. **DIAGNÓSTICO TÉCNICO:**
               - Sección: ### 📊 **DIAGNÓSTICO TÉCNICO**
               - Tabla con: Componente | Estado | Prioridad | Acción
               - Usar emojis de estado: ✅ ❌ ⚠️

            10. **PIE DE PÁGINA:**
                - Información de generación con emojis: 📅 🤖 🔗 📋

            REGLAS VISUALES:
            - Usar emojis estratégicamente para cada sección
            - Aplicar **negrita** para etiquetas y valores importantes
            - Usar `código monoespaciado` para tipos de datos y valores técnicos
            - Incluir bloques de código para JSON y datos estructurados
            - Mantener consistencia visual en todo el reporte
            - Ser detallado pero visualmente organizado

            IMPORTANTE:
            - NO te presentes (no digas "Hola, soy SaraIA...")
            - Generar un reporte técnico completo y visualmente atractivo
            - Incluir TODA la información disponible del JSON del proyecto
            - Ser profesional y técnico en el formato

            Responde siempre en español.
          PROMPT
        end

        def project_search_system_prompt
          <<~PROMPT
            Eres SaraIA Obra, especialista en gestión de proyectos de CMPROYECTOS.

            Tu tarea es buscar y filtrar proyectos por nombre.

            Instrucciones:
            1. Lee cuidadosamente el nombre buscado
            2. Filtra los proyectos que coincidan (exacta o parcialmente)
            3. Si no hay coincidencias exactas, busca coincidencias parciales
            4. Presenta SOLO los proyectos que coincidan
            5. Si no encuentras ninguno, busca proyectos relacionados o similares

            **NUEVO - BÚSQUEDA INTELIGENTE CUANDO NO HAY COINCIDENCIAS:**
            Cuando no encuentres coincidencias exactas o parciales:
            - Extrae palabras clave del término buscado
            - Busca proyectos que contengan esas palabras clave
            - Busca proyectos con términos similares o relacionados
            - Ofrece proyectos alternativos que puedan ser de interés

            Formato de respuesta:
            - Si encuentras coincidencias: presenta lista con detalles
            - Si no encuentras coincidencias exactas: presenta proyectos relacionados
            - Usa **negrita** para nombres de proyectos
            - Incluye siempre el ID: (ID: XXX)

            Ejemplo de búsqueda sin coincidencias:
            ```
            No se encontró ningún proyecto con el nombre "BIM IBRAS HIDRÁULICAS".
            
            A continuación, se presenta información de proyectos relacionados con "obras hidráulicas" o que contienen "BIM" en su nombre, para ver si alguno de ellos podría ser el que busca:
            Proyectos encontrados:
            - PROYECTO BIM OBRAS HIDRÁULICAS (ID: 320)
            - DEMOSTRACIÓN HIDRÁULICO BIM (ID: 17)
            - IMPLEMENTACIÓN BIM (ID: 7)
            ```

            **NUEVO - OFERTA DE REPORTE TÉCNICO PERSONALIZADA:**
            Después de mostrar los resultados de búsqueda, SIEMPRE agrega esta pregunta al final:

            ```
            
            🤖 ¿Desea generar un reporte técnico completo del proyecto "NOMBRE_DEL_PROYECTO" (ID: XXX)?
            
            Responda "sí" + el número o ID del proyecto para generar el reporte técnico detallado.
            Ejemplo: "sí 702" o "sí proyecto ID 702"
            
            Responda "no" para finalizar la búsqueda.
            ```

            **IMPORTANTE - PERSONALIZACIÓN DE LA PREGUNTA:**
            - Para CADA proyecto encontrado, incluye su NOMBRE y ID específico en la pregunta
            - Si hay múltiples proyectos, enuméralos en la pregunta
            - Haz la pregunta específica y personalizada para cada proyecto encontrado

            Ejemplos de personalización:
            ```
            🤖 ¿Desea generar un reporte técnico completo del proyecto "PROYECTO BIM OBRAS HIDRÁULICAS" (ID: 320)?

            O si hay múltiples proyectos:
            🤖 ¿Desea generar un reporte técnico completo de alguno de estos proyectos?
            - "PROYECTO BIM OBRAS HIDRÁULICAS" (ID: 320)
            - "EDIFICIO CENTRAL" (ID: 702)
            ```

            IMPORTANTE:
            - NO te presentes
            - Sé precisa en la búsqueda
            - Muestra solo coincidencias relevantes
            - Cuando no hay coincidencias, ofrece alternativas inteligentes
            - SIEMPRE incluye la oferta de reporte técnico personalizada al final
            - PERSONALIZA la pregunta con el nombre y ID de CADA proyecto encontrado

            Responde siempre en español.
          PROMPT
        end

        # ============================================================================
        # CONSTRUCCIÓN DE PROMPTS DE CONTEXTO
        # ============================================================================

        def build_project_list_prompt(message, data)
          <<~PROMPT
            El usuario preguntó: "#{message}"

            Datos de proyectos de CMPROYECTOS:
            ```json
            #{data.to_json}
            ```

            Presenta la lista de proyectos de forma clara y organizada según las instrucciones del system prompt.
          PROMPT
        end

        def build_project_detail_prompt(message, data)
          <<~PROMPT
            El usuario preguntó: "#{message}"

            Detalles completos del proyecto de CMPROYECTOS para generar REPORTE TÉCNICO VISUAL:
            ```json
            #{data.to_json}
            ```

            INSTRUCCIONES ESPECÍFICAS PARA EL REPORTE TÉCNICO:

            1. **ANÁLISIS DE COMPLETITUD:**
               - Calcula el porcentaje de configuración basado en:
                 * Configuración básica (ID, nombre, estado): 25%
                 * Descripción y explicación: 25%
                 * Miembros asignados: 25%
                 * Work packages/categorías/versiones: 25%

            2. **EXTRACIÓN DE ENDPOINTS:**
               - Extrae TODOS los endpoints del objeto `_links`
               - Clasifícalos por tipo: CRUD, Work Packages, Miembros, etc.
               - Identifica métodos HTTP disponibles

            3. **ANÁLISIS DE CAMPOS PERSONALIZADOS:**
               - Identifica todos los campos `customField*`
               - Muestra sus valores y tipos

            4. **EVALUACIÓN DE ESTADO:**
               - Determina el estado real del proyecto
               - Identifica elementos faltantes críticos
               - Sugiere prioridades de configuración

            5. **ESTRUCTURA JERÁRQUICA:**
               - Analiza relaciones parent/ancestors
               - Determina nivel jerárquico del proyecto
               - Identifica proyectos relacionados

            Genera un reporte técnico completo y visualmente atractivo siguiendo TODAS las instrucciones del system prompt.
            Incluye análisis, métricas, recomendaciones y diagnóstico técnico.
          PROMPT
        end

        def build_project_search_prompt(message, project_name, data)
          <<~PROMPT
            El usuario preguntó: "#{message}"
            El usuario busca proyectos con el nombre: "#{project_name}"

            Todos los proyectos disponibles en CMPROYECTOS:
            ```json
            #{data.to_json}
            ```

            Busca y filtra los proyectos que coincidan con "#{project_name}" (coincidencia exacta o parcial).
            Presenta solo los proyectos que coincidan según las instrucciones del system prompt.
          PROMPT
        end

        # ============================================================================
        # FORMATO FALLBACK (SIN IA)
        # ============================================================================

        def format_fallback(data)
          return "📋 No hay proyectos disponibles." if data.nil? || data.empty?

          # Si es una colección de proyectos
          if data.is_a?(Hash) && data['_embedded'] && data['_embedded']['elements']
            elements = data['_embedded']['elements']
            total = data['total'] || elements.size

            result = "# 📋 **LISTA DE PROYECTOS CMPROYECTOS**\n\n"
            result += "### 📊 **Resumen**\n\n"
            result += "| Métrica | Valor |\n"
            result += "|---------|-------|\n"
            result += "| **Total de proyectos** | #{total} |\n"
            result += "| **Mostrando** | #{[10, elements.size].min} de #{total} |\n"
            result += "| **Estado** | ✅ Activos |\n\n"

            result += "### 🏗️ **Proyectos Disponibles**\n\n"

            elements.first(10).each_with_index do |project, index|
              name = project['name'] || "Sin nombre"
              id = project['id']
              identifier = project['identifier']
              status = project['active'] ? "✅ Activo" : "❌ Inactivo"
              public = project['public'] ? "🌐 Público" : "🔒 Privado"

              result += "#{index + 1}. **#{name}** (ID: `#{id}`)\n"
              result += "   - 🏷️ Identificador: `#{identifier}`\n" if identifier
              result += "   - #{status} • #{public}\n"
              result += "\n"
            end

            result += "---\n\n"
            result += "_📝 Mostrando primeros #{[10, elements.size].min} de #{total} proyectos_"

            return result
          end

          # Si es un proyecto único - REPORTE TÉCNICO MEJORADO
          if data.is_a?(Hash) && data['id'] && data['name']
            project_name = data['name']
            project_id = data['id']
            
            # Calcular completitud básica
            completion_score = 0
            completion_score += 25 if data['id'] && data['name']
            completion_score += 25 if data['description'] && data['description']['raw'].present?
            completion_score += 25 if data['status'] && data['status']['name'].present?
            completion_score += 25 if data['identifier'].present?
            
            result = "# 🏗️ **REPORTE TÉCNICO DE PROYECTO**\n"
            result += "## #{project_name}\n\n"
            result += "---\n\n"

            # Resumen Ejecutivo
            result += "### 📊 **RESUMEN EJECUTIVO**\n\n"
            result += "| Métrica | Valor | Estado |\n"
            result += "|---------|-------|--------|\n"
            result += "| **ID del Proyecto** | #{project_id} | ✅ Configurado |\n"
            result += "| **Identificador** | `#{data['identifier'] || 'N/A'}` | 🏷️ Único |\n"
            result += "| **Estado General** | **#{completion_score}% Completo** | #{completion_score >= 75 ? '✅' : completion_score >= 50 ? '⚠️' : '❌'} |\n"
            result += "| **Activo** | #{data['active'] ? 'Sí' : 'No'} | #{data['active'] ? '✅' : '❌'} |\n"
            result += "| **Público** | #{data['public'] ? 'Sí' : 'No'} | #{data['public'] ? '🌐' : '🔒'} |\n"
            
            if data['createdAt']
              created_date = data['createdAt'].split('T').first
              result += "| **Fecha de Creación** | #{created_date} | 📅 |\n"
            end
            
            if data['updatedAt']
              updated_date = data['updatedAt'].split('T').first
              result += "| **Última Actualización** | #{updated_date} | 🔄 |\n"
            end
            
            result += "\n"

            # Información Crítica
            result += "### 🎯 **INFORMACIÓN CRÍTICA**\n\n"
            result += "```diff\n"
            result += "+ Configuración básica completa\n" if data['id'] && data['name']
            result += "- Sin descripción del proyecto\n" unless data['description'] && data['description']['raw'].present?
            result += "- Sin miembros asignados\n" unless data['_links'] && data['_links']['memberships']
            result += "- Sin work packages creados\n" unless data['_links'] && data['_links']['workPackages']
            result += "```\n\n"

            # Detalles Técnicos
            result += "### 📋 **DETALLES TÉCNICOS**\n\n"
            result += "#### 🔧 **Configuración Básica**\n\n"
            result += "| Campo | Valor | Formato |\n"
            result += "|-------|-------|---------|\n"
            result += "| **Tipo** | `#{data['_type'] || 'Project'}` | `String` |\n"
            result += "| **ID** | `#{project_id}` | `Integer` |\n"
            result += "| **Identificador** | `#{data['identifier'] || 'N/A'}` | `String` |\n"
            result += "| **Activo** | `#{data['active']}` | `Boolean` |\n"
            result += "| **Público** | `#{data['public']}` | `Boolean` |\n\n"

            # Descripciones
            result += "#### 📝 **Descripciones**\n\n"
            result += "| Tipo | Contenido | Estado |\n"
            result += "|------|----------|--------|\n"
            
            if data['description']
              desc_content = data['description']['raw'] || '*Vacía*'
              desc_status = desc_content.present? ? '✅ Definida' : '⚠️ Por configurar'
              result += "| **Descripción** | #{desc_content.truncate(50)} | #{desc_status} |\n"
            end
            
            if data['statusExplanation']
              status_exp = data['statusExplanation']['raw'] || '*Vacía*'
              status_exp_status = status_exp.present? ? '✅ Definida' : '⚠️ Por configurar'
              result += "| **Explicación Estado** | #{status_exp.truncate(50)} | #{status_exp_status} |\n"
            end
            
            result += "\n"

            # Campos Personalizados
            custom_fields = data.select { |k, v| k.start_with?('customField') }
            if custom_fields.any?
              result += "#### 🏷️ **Campos Personalizados**\n\n"
              result += "```json\n"
              result += JSON.pretty_generate(custom_fields)
              result += "\n```\n\n"
            end

            # Endpoints API
            if data['_links']
              result += "### 🔗 **ENDPOINTS API DISPONIBLES**\n\n"
              result += "#### 📡 **Operaciones CRUD**\n\n"
              result += "| Método | Endpoint | Funcionalidad | Estado |\n"
              result += "|--------|----------|---------------|--------|\n"
              
              if data['_links']['self']
                result += "| `GET` | `#{data['_links']['self']['href']}` | Obtener proyecto | ✅ |\n"
              end
              
              if data['_links']['update']
                result += "| `POST` | `#{data['_links']['update']['href']}` | Formulario actualización | ✅ |\n"
              end
              
              if data['_links']['updateImmediately']
                result += "| `PATCH` | `#{data['_links']['updateImmediately']['href']}` | Actualizar proyecto | ✅ |\n"
              end
              
              if data['_links']['delete']
                result += "| `DELETE` | `#{data['_links']['delete']['href']}` | Eliminar proyecto | ✅ |\n"
              end
              
              result += "\n"
            end

            # Pie de página
            result += "---\n\n"
            result += "📅 **Generado**: #{Time.current.strftime('%Y-%m-%d %H:%M:%S')} UTC  \n"
            result += "🤖 **Generado por**: SaraIA Obra - CMPROYECTOS  \n"
            result += "🔗 **Versión API**: v3 • **📋 Formato**: JSON REST\n"

            return result
          end

          # Fallback genérico mejorado
          result = "# 📋 **DATOS DEL PROYECTO**\n\n"
          result += "### 🔍 **Información Disponible**\n\n"
          result += "```json\n#{JSON.pretty_generate(data)}\n```\n\n"
          result += "---\n\n"
          result += "📅 **Generado**: #{Time.current.strftime('%Y-%m-%d %H:%M:%S')} UTC\n"
          
          result
        end

        # ============================================================================
        # BÚSQUEDA INTELIGENTE Y FILTRADO
        # ============================================================================

        def smart_filter_projects(projects, search_term, logger)
          normalized_search = normalize_text(search_term)
          search_words = normalized_search.split(/\s+/).reject { |w| w.length < 2 } # Reducido a 2 caracteres

          log_info("Búsqueda normalizada: '#{normalized_search}' | Palabras clave: #{search_words.inspect}", logger)

          results = []

          projects.each do |project|
            project_name = project['name'] || ''
            project_identifier = project['identifier'] || ''
            normalized_name = normalize_text(project_name)
            normalized_identifier = normalize_text(project_identifier)

            # Log para debugging
            # log_info("Comparando: '#{normalized_name}' con '#{normalized_search}'", logger)

            # 1. Coincidencia exacta (máxima prioridad)
            if normalized_name == normalized_search || normalized_identifier == normalized_search
              results << { project: project, score: 100, match_type: 'exact' }
              next
            end

            # 2. Coincidencia de inicio (alta prioridad)
            if normalized_name.start_with?(normalized_search) || normalized_identifier.start_with?(normalized_search)
              results << { project: project, score: 90, match_type: 'start' }
              next
            end

            # 3. Coincidencia parcial - contiene el término completo
            if normalized_name.include?(normalized_search) || normalized_identifier.include?(normalized_search)
              results << { project: project, score: 80, match_type: 'contains' }
              next
            end

            # 4. Coincidencia por palabras clave (MEJORADO)
            if search_words.any?
              matching_words = 0
              search_words.each do |word|
                if normalized_name.include?(word) || normalized_identifier.include?(word)
                  matching_words += 1
                end
              end

              if matching_words > 0
                # Score basado en el porcentaje de palabras coincidentes
                percentage = (matching_words.to_f / search_words.size) * 100
                score = 50 + (percentage / 2).to_i # Score entre 50-100
                results << { project: project, score: score, match_type: "keywords(#{matching_words}/#{search_words.size})" }
                next
              end
            end

            # 5. Coincidencia difusa (fuzzy) usando Levenshtein - MEJORADO
            # Solo si el nombre no es demasiado largo comparado con la búsqueda
            if normalized_name.length < normalized_search.length * 3
              name_distance = levenshtein_distance(normalized_search, normalized_name)
              threshold = [normalized_search.length * 0.4, 8].max.to_i # Aumentado a 40% de diferencia

              if name_distance <= threshold
                score = 40 - (name_distance * 1) # Menos distancia = mayor score
                score = [score, 10].max # Mínimo score de 10
                results << { project: project, score: score, match_type: "fuzzy(dist:#{name_distance})" }
              end
            end
          end

          # Si no hay resultados, buscar con términos más flexibles
          if results.empty?
            log_info("🔄 Intentando búsqueda flexible...", logger)
            
            # Extraer palabras clave más importantes
            key_terms = extract_key_terms(search_term)
            
            projects.each do |project|
              project_name = project['name'] || ''
              normalized_name = normalize_text(project_name)
              
              # Buscar coincidencias con términos clave
              key_terms.each do |term|
                if normalized_name.include?(term)
                  results << {
                    project: project,
                    score: 60,
                    match_type: "flexible(#{term})"
                  }
                  break # Evitar duplicados
                end
              end
            end
          end

          # Ordenar por score (mayor a menor) y retornar los primeros 15 proyectos
          sorted_results = results.sort_by { |r| -r[:score] }.first(15)

          log_info("Resultados encontrados: #{sorted_results.size} proyectos", logger)
          sorted_results.each_with_index do |r, i|
            log_info("  #{i+1}. #{r[:project]['name']} (ID: #{r[:project]['id']}) - Score: #{r[:score]} (#{r[:match_type]})", logger)
          end

          sorted_results.map { |r| r[:project] }
        end

        # ============================================================================
        # EXTRACCIÓN DE NOMBRE DE PROYECTO DE LA CONSULTA
        # ============================================================================

        def extract_project_name_from_query(message)
          # Patrones para extraer el nombre del proyecto
          patterns = [
            # Patrón 1: "información del proyecto NOMBRE"
            /(?:información|info|detalles|datos)\s+(?:del|sobre|de|del|de\s+el)\s+proyecto\s+(.+?)(?:\?|\.)?$/i,

            # Patrón 2: "proyecto llamado NOMBRE"
            /proyecto\s+llamado\s+['"]?(.+?)['"]?(?:\?|\.)?$/i,

            # Patrón 3: "buscar proyecto NOMBRE"
            /buscar\s+proyecto\s+['"]?(.+?)['"]?(?:\?|\.)?$/i,

            # Patrón 4: genérico "proyecto NOMBRE" (último recurso)
            /proyecto\s+([A-Z][^\?\.]+?)(?:\?|\.)?$/i
          ]

          patterns.each do |pattern|
            if message =~ pattern
              extracted = $1.strip
              # NO limpiar la palabra "proyecto" si es parte del nombre
              # Solo limpiar palabras de artículos al inicio o final
              extracted = extracted.gsub(/^(el|la|los|las)\s+/i, '').strip
              extracted = extracted.gsub(/\s+(activo|inactivo)$/i, '').strip
              return extracted if extracted.length >= 3
            end
          end

          nil
        end

        # ============================================================================
        # NORMALIZACIÓN DE TEXTO
        # ============================================================================

        def normalize_text(text)
          return '' if text.nil? || text.empty?

          # Convertir a minúsculas
          normalized = text.downcase

          # Quitar tildes y caracteres especiales
          normalized = normalized.tr(
            'áéíóúàèìòùäëïöüâêîôûãõñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÃÕÑÇ',
            'aeiouaeiouaeiouaeiouaoncAEIOUAEIOUAEIOUAEIOUAONC'
          )

          # Quitar caracteres no alfanuméricos (excepto espacios)
          normalized = normalized.gsub(/[^a-z0-9\s]/i, '')

          # Comprimir múltiples espacios en uno solo
          normalized = normalized.gsub(/\s+/, ' ').strip

          normalized
        end

        # ============================================================================
        # DISTANCIA DE LEVENSHTEIN (FUZZY MATCHING)
        # ============================================================================

        def levenshtein_distance(s, t)
          return t.length if s.empty?
          return s.length if t.empty?

          # Crear matriz
          d = Array.new(s.length + 1) { Array.new(t.length + 1) }

          # Inicializar primera fila y columna
          (0..s.length).each { |i| d[i][0] = i }
          (0..t.length).each { |j| d[0][j] = j }

          # Calcular distancia
          (1..s.length).each do |i|
            (1..t.length).each do |j|
              cost = s[i - 1] == t[j - 1] ? 0 : 1
              d[i][j] = [
                d[i - 1][j] + 1,      # eliminación
                d[i][j - 1] + 1,      # inserción
                d[i - 1][j - 1] + cost # sustitución
              ].min
            end
          end

          d[s.length][t.length]
        end

        def extract_key_terms(search_term)
          # Normalizar el término de búsqueda
          normalized = normalize_text(search_term)
          
          # Dividir en palabras
          words = normalized.split(/\s+/)
          
          # Filtrar palabras comunes y mantener términos importantes
          stop_words = %w[proyecto proyectos del de la los las y o en con por para]
          
          key_terms = words.reject do |word|
            word.length < 3 || stop_words.include?(word)
          end
          
          # Si no hay términos clave, usar las palabras más largas
          if key_terms.empty?
            key_terms = words.sort_by { |w| -w.length }.first(3)
          end
          
          key_terms
        end

        # ============================================================================
        # PROMPTS ADICIONALES
        # ============================================================================

        def project_no_match_system_prompt
          <<~PROMPT
            Eres SaraIA Obra, especialista en gestión de proyectos de CMPROYECTOS.

            El usuario buscó un proyecto específico pero NO se encontraron coincidencias.

            Tu tarea:
            1. Informar amablemente que no se encontró el proyecto buscado
            2. Sugerir usar el ID del proyecto para una búsqueda más precisa
            3. Mostrar los primeros 5-10 proyectos disponibles como referencia

            Ejemplo de formato:
            ```
            No encontré ningún proyecto con el nombre "XYZ".

            **Sugerencia:** Si conoces el ID del proyecto, puedes preguntarme: "proyecto ID XXX"

            **Proyectos disponibles** (primeros 10 de 685):
            1. **Nombre del Proyecto** (ID: 702)
            2. **Otro Proyecto** (ID: 715)
            ...
            ```

            IMPORTANTE:
            - NO te presentes
            - Sé amable y útil
            - Enfócate en ayudar al usuario a encontrar el proyecto correcto

            Responde siempre en español.
          PROMPT
        end

        def build_no_match_prompt(message, search_term, data)
          <<~PROMPT
            El usuario preguntó: "#{message}"
            El usuario buscó el proyecto: "#{search_term}"

            NO se encontraron proyectos que coincidan con ese nombre.

            Lista de proyectos disponibles en CMPROYECTOS (muestra los primeros 10 como referencia):
            ```json
            #{data.to_json}
            ```

            Informa al usuario que no se encontró el proyecto y sugiere usar el ID del proyecto.
            Muestra los primeros 10 proyectos disponibles para que el usuario pueda identificar el que busca.
          PROMPT
        end

        # ============================================================================
        # PROMPTS PARA FILTRADO POR NIVELES
        # ============================================================================

        def projects_level_system_prompt
          <<~PROMPT
            Eres SaraIA Obra, especialista en gestión de proyectos de CMPROYECTOS.
            
            Tu tarea es presentar proyectos filtrados por nivel jerárquico.
            
            Niveles disponibles:
            - Nivel 1: Proyectos raíz (sin proyectos padre)
            - Nivel 2: Subproyectos (hijos directos de proyectos raíz)
            - Nivel 3: Sub-subproyectos (hijos de subproyectos)
            
            Instrucciones de formato:
            - Usa markdown para estructurar
            - Presenta cada proyecto con: **Nombre del Proyecto** (ID: XXX)
            - Si es nivel 2 o 3, muestra el padre: *Padre: Nombre del Padre (ID: XXX)*
            - Incluye el identificador único
            - Agrupa por nivel claramente
            - Muestra el total de proyectos del nivel
            
            Ejemplo para nivel 2:
            ```
            **Subproyectos encontrados: 5**
            
            1. **Reforma Planta Baja** (ID: 145)
               *Padre: Edificio Central (ID: 70)*
               *Identificador: REFORMA-PB-2024
            
            2. **Instalación Sistema HVAC** (ID: 146)
               *Padre: Edificio Central (ID: 70)*
               *Identificador: HVAC-INST-2024
            ```
            
            IMPORTANTE:
            - NO te presentes (no digas "Hola, soy SaraIA...")
            - Responde DIRECTAMENTE sin saludos
            - Sé clara y organizada
            - Muestra siempre el nivel que estás presentando
            
            Responde siempre en español.
          PROMPT
        end

        def projects_hierarchy_system_prompt
          <<~PROMPT
            Eres SaraIA Obra, especialista en gestión de proyectos de CMPROYECTOS.
            
            Tu tarea es presentar la jerarquía completa de proyectos en 3 niveles.
            
            Instrucciones de formato:
            - Usa markdown para estructurar
            - Organiza por niveles claramente
            - Presenta cada proyecto con: **Nombre del Proyecto** (ID: XXX)
            - Muestra las relaciones padre-hijo
            - Incluye resumen con conteo por nivel
            - Usa sangría para mostrar jerarquía
            
            Ejemplo de formato:
            ```
            **Jerarquía de Proyectos CMPROYECTOS**
            
            **Resumen:**
            - Total proyectos: 15
            - Nivel 1 (raíz): 3 proyectos
            - Nivel 2 (subproyectos): 7 proyectos
            - Nivel 3 (sub-subproyectos): 5 proyectos
            
            **Nivel 1 - Proyectos Raíz:**
            1. **Edificio Central** (ID: 70)
            2. **Plaza Comercial** (ID: 71)
            3. **Parque Industrial** (ID: 72)
            
            **Nivel 2 - Subproyectos:**
            1. **Reforma Planta Baja** (ID: 145)
               *Padre: Edificio Central (ID: 70)*
            2. **Instalación Sistema HVAC** (ID: 146)
               *Padre: Edificio Central (ID: 70)*
            
            **Nivel 3 - Sub-subproyectos:**
            1. **Diseño Eléctrico** (ID: 201)
               *Padre: Reforma Planta Baja (ID: 145)*
            ```
            
            IMPORTANTE:
            - NO te presentes
            - Responde DIRECTAMENTE sin saludos
            - Muestra claramente la estructura jerárquica
            - Incluye conteos por nivel
            
            Responde siempre en español.
          PROMPT
        end

        def build_level_1_prompt(message, data)
          <<~PROMPT
            El usuario preguntó: "#{message}"
            
            Proyectos de nivel 1 (raíz) de CMPROYECTOS:
            ```json
            #{data.to_json}
            ```
            
            Presenta los proyectos raíz de forma clara y organizada según las instrucciones del system prompt.
          PROMPT
        end

        def build_level_2_prompt(message, data, parent_id)
          <<~PROMPT
            El usuario preguntó: "#{message}"
            
            Subproyectos de CMPROYECTOS (nivel 2)#{parent_id ? " del padre #{parent_id}" : ""}:
            ```json
            #{data.to_json}
            ```
            
            Presenta los subproyectos de forma clara y organizada según las instrucciones del system prompt.
          PROMPT
        end

        def build_level_3_prompt(message, data, parent_id)
          <<~PROMPT
            El usuario preguntó: "#{message}"
            
            Sub-subproyectos de CMPROYECTOS (nivel 3)#{parent_id ? " del padre #{parent_id}" : ""}:
            ```json
            #{data.to_json}
            ```
            
            Presenta los sub-subproyectos de forma clara y organizada según las instrucciones del system prompt.
          PROMPT
        end

        def build_hierarchy_prompt(message, data)
          <<~PROMPT
            El usuario preguntó: "#{message}"
            
            Jerarquía completa de proyectos de CMPROYECTOS:
            ```json
            #{data.to_json}
            ```
            
            Presenta la jerarquía completa de forma clara y organizada según las instrucciones del system prompt.
          PROMPT
        end

        # ============================================================================
        # HELPERS
        # ============================================================================

        private

        def log_info(message, logger)
          return unless logger
          logger.info "📋 [ProjectsHandler] #{message}"
        end

        # Extraer ID de padre del mensaje
        def extract_parent_id_from_message(message)
          # Buscar patrones como "del padre 123" o "padre ID 123"
          patterns = [
            /(?:del|del\s+el)?\s+padre\s+(?:id\s*)?(\d+)/i,
            /padre\s+(?:id\s*)?(\d+)/i,
            /proyecto\s+padre\s+(\d+)/i
          ]
          
          patterns.each do |pattern|
            if message =~ pattern
              return $1.to_i
            end
          end
          
          nil
        end
      end
    end
  end
end