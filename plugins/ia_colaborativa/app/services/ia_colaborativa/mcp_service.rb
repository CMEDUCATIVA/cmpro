require 'net/http'
require 'json'
require 'uri'
require 'uri'
require 'base64'
require_relative 'debug_service'

module IaColaborativa
  class McpService
    class << self
      
      # ============================================================================
      # PROYECTOS
      # ============================================================================
      
      # Listar todos los proyectos activos (SIN paginación - recibe todos de una vez)
      def list_projects(active_only: true, base_url: nil)
        Rails.logger.info "🚀 [McpService] Iniciando recuperación COMPLETA de proyectos (active_only=#{active_only})"
        
        # Llamar a la API SIN parámetros de paginación para recibir TODOS los proyectos
        base_url ||= search_mcp_url
        result = call_mcp("/tools/list_projects", { active_only: active_only }, base_url: base_url)

        unless result[:success]
          Rails.logger.error "❌ [McpService] Error al obtener proyectos: #{result[:error]}"
          return result
        end

        data = result[:data]
        elements = data['_embedded']['elements'] rescue []
        total = data['total'] || elements.size

        Rails.logger.info "✅ [McpService] Proyectos obtenidos en una sola petición: #{elements.size}/#{total}"
        
        # DEBUG: Mostrar nombres de proyectos
        Rails.logger.info "   📋 Lista completa de proyectos:"
        elements.each do |project|
          Rails.logger.info "   - #{project['name']} (ID: #{project['id']})"
        end

        # Construir respuesta con todos los proyectos
        { success: true, data: build_collection(elements, total) }
      end
      
      # ========================================================================
      # HANDLERS ESPECÍFICOS PARA FILTRADO POR 3 NIVELES
      # ========================================================================
      
      # Obtener nombres de proyectos filtrados por nivel 1 (proyectos raíz)
      def get_projects_level_1(active_only: true)
        Rails.logger.info "🔍 [McpService] Filtrando proyectos NIVEL 1 (raíz)"
        
        result = list_projects(active_only: active_only)
        return result unless result[:success]
        
        projects = result[:data]['_embedded']['elements'] || []
        
        # Filtrar proyectos raíz (sin padre)
        level_1_projects = projects.select do |project|
          # Proyectos sin parent_id o parent es nil
          project['parent'].nil? || project['parent']['id'].nil?
        end
        
        Rails.logger.info "✅ [McpService] Proyectos NIVEL 1 encontrados: #{level_1_projects.size}"
        
        # Extraer solo los nombres
        project_names = level_1_projects.map { |p| { id: p['id'], name: p['name'], identifier: p['identifier'] } }
        
        { success: true, data: project_names, count: project_names.size }
      end
      
      # Obtener nombres de proyectos filtrados por nivel 2 (subproyectos)
      def get_projects_level_2(parent_id: nil, active_only: true)
        Rails.logger.info "🔍 [McpService] Filtrando proyectos NIVEL 2 (subproyectos)"
        
        result = list_projects(active_only: active_only)
        return result unless result[:success]
        
        projects = result[:data]['_embedded']['elements'] || []
        
        # Filtrar proyectos de nivel 2 (con padre)
        level_2_projects = projects.select do |project|
          has_parent = project['parent'] && project['parent']['id']
          
          # Si se especifica parent_id, filtrar por ese padre específico
          if parent_id
            has_parent && project['parent']['id'] == parent_id
          else
            has_parent
          end
        end
        
        Rails.logger.info "✅ [McpService] Proyectos NIVEL 2 encontrados: #{level_2_projects.size}"
        
        # Extraer nombres con información del padre
        project_names = level_2_projects.map do |p|
          {
            id: p['id'],
            name: p['name'],
            identifier: p['identifier'],
            parent_id: p['parent']&.[]('id'),
            parent_name: p['parent']&.[]('name')
          }
        end
        
        { success: true, data: project_names, count: project_names.size }
      end
      
      # Obtener nombres de proyectos filtrados por nivel 3 (sub-subproyectos)
      def get_projects_level_3(parent_id: nil, active_only: true)
        Rails.logger.info "🔍 [McpService] Filtrando proyectos NIVEL 3 (sub-subproyectos)"
        
        result = list_projects(active_only: active_only)
        return result unless result[:success]
        
        projects = result[:data]['_embedded']['elements'] || []
        
        # Para nivel 3, necesitamos encontrar proyectos cuyo padre es de nivel 2
        # Primero obtenemos todos los proyectos de nivel 2
        level_2_projects = projects.select do |project|
          project['parent'] && project['parent']['id']
        end
        
        level_2_ids = level_2_projects.map { |p| p['id'] }
        
        # Filtrar proyectos de nivel 3 (cuyo padre está en nivel 2)
        level_3_projects = projects.select do |project|
          has_parent = project['parent'] && project['parent']['id']
          
          if parent_id
            has_parent && project['parent']['id'] == parent_id
          else
            has_parent && level_2_ids.include?(project['parent']['id'])
          end
        end
        
        Rails.logger.info "✅ [McpService] Proyectos NIVEL 3 encontrados: #{level_3_projects.size}"
        
        # Extraer nombres con información del padre
        project_names = level_3_projects.map do |p|
          {
            id: p['id'],
            name: p['name'],
            identifier: p['identifier'],
            parent_id: p['parent']&.[]('id'),
            parent_name: p['parent']&.[]('name')
          }
        end
        
        { success: true, data: project_names, count: project_names.size }
      end
      
      # Obtener estructura jerárquica completa de proyectos (3 niveles)
      def get_projects_hierarchy(active_only: true)
        Rails.logger.info "🌳 [McpService] Construyendo jerarquía completa de proyectos"
        
        result = list_projects(active_only: active_only)
        return result unless result[:success]
        
        projects = result[:data]['_embedded']['elements'] || []
        
        # Separar por niveles
        level_1 = projects.select { |p| p['parent'].nil? || p['parent']['id'].nil? }
        level_2 = projects.select { |p| p['parent'] && p['parent']['id'] }
        level_3 = []
        
        # Identificar nivel 3 (proyectos cuyo padre está en nivel 2)
        level_2_ids = level_2.map { |p| p['id'] }
        level_3 = projects.select { |p| p['parent'] && p['parent']['id'] && level_2_ids.include?(p['parent']['id']) }
        
        # Construir jerarquía
        hierarchy = {
          level_1: level_1.map { |p| format_project_hierarchy(p) },
          level_2: level_2.map { |p| format_project_hierarchy(p) },
          level_3: level_3.map { |p| format_project_hierarchy(p) },
          summary: {
            total_projects: projects.size,
            level_1_count: level_1.size,
            level_2_count: level_2.size,
            level_3_count: level_3.size
          }
        }
        
        Rails.logger.info "✅ [McpService] Jerarquía construida: L1=#{level_1.size}, L2=#{level_2.size}, L3=#{level_3.size}"
        
        { success: true, data: hierarchy }
      end
      
      # Buscar proyectos por nombre (búsqueda parcial)
      def search_projects_by_name(name_pattern, active_only: true)
        Rails.logger.info "🔎 [McpService] Buscando proyectos con patrón: '#{name_pattern}'"
        
        result = list_projects(active_only: active_only)
        return result unless result[:success]
        
        projects = result[:data]['_embedded']['elements'] || []
        
        # Búsqueda insensible a mayúsculas/minúsculas
        pattern = name_pattern.downcase
        matching_projects = projects.select do |project|
          project['name'].downcase.include?(pattern) ||
          project['identifier'].downcase.include?(pattern)
        end
        
        Rails.logger.info "✅ [McpService] Proyectos encontrados: #{matching_projects.size}/#{projects.size}"
        
        # Extraer información relevante
        project_info = matching_projects.map do |p|
          {
            id: p['id'],
            name: p['name'],
            identifier: p['identifier'],
            description: p['description']&.[]('raw')&.truncate(100),
            status: p['status'],
            parent: p['parent']
          }
        end
        
        { success: true, data: project_info, count: project_info.size }
      end
      
      # Obtener proyecto específico por ID
      def get_project(project_id)
        call_mcp("/tools/get_project?project_id=#{project_id}")
      end

      # Listar proyectos del usuario (donde es miembro) usando el endpoint directo de MCP
      def list_user_projects(user_id:, active_only: true, base_url: nil)
        Rails.logger.info "🔍 [McpService] Obteniendo proyectos del usuario #{user_id} (active_only: #{active_only})"

        # Usar el endpoint directo de MCP que ya devuelve los proyectos del usuario
        base_url ||= search_mcp_url
        call_mcp("/tools/list_user_projects?user_id=#{user_id}&full_retrieval=true", {}, base_url: base_url)
      end

      private
      
      # Formatear proyecto para jerarquía
      def format_project_hierarchy(project)
        {
          id: project['id'],
          name: project['name'],
          identifier: project['identifier'],
          status: project['status'],
          parent_id: project['parent']&.[]('id'),
          parent_name: project['parent']&.[]('name'),
          created_at: project['createdAt'],
          updated_at: project['updatedAt']
        }
      end

      public

      # ============================================================================
      # WORK PACKAGES (Tareas)
      # ============================================================================
      
      # Listar work packages (SIN paginación - recibe todos de una vez)
      def list_work_packages(project_id: nil, status: 'open')
        Rails.logger.info "🚀 [McpService] Iniciando recuperación COMPLETA de work packages (project_id=#{project_id}, status=#{status})"
        
        # Construir parámetros para query y body
        query_pairs = []
        query_pairs << "project_id=#{project_id}" if project_id
        query_pairs << "status=#{status}" if status
        query_pairs << "full_retrieval=true"
        endpoint = "/tools/list_work_packages"
        endpoint += "?#{query_pairs.join('&')}" if query_pairs.any?

        payload = { active_only: true }
        payload[:status] = status if status
        
        # Llamar a la API colocando project_id en la query para evitar el error 422
        result = call_mcp(endpoint, payload)

        unless result[:success]
          Rails.logger.error "❌ [McpService] Error al obtener work packages: #{result[:error]}"
          return result
        end

        data = result[:data]
        elements = data['_embedded']['elements'] rescue []
        total = data['total'] || elements.size

        Rails.logger.info "✅ [McpService] Work packages obtenidos en una sola petición: #{elements.size}/#{total}"
        
        # DEBUG: Mostrar work packages
        Rails.logger.info "   📋 Lista completa de work packages:"
        elements.each do |wp|
          Rails.logger.info "   - #{wp['subject']} (ID: #{wp['id']})"
        end

        # Construir respuesta con todos los work packages
        { success: true, data: build_collection(elements, total) }
      end
      
      # Obtener work package específico
      def get_work_package(wp_id)
        call_mcp("/tools/get_work_package?work_package_id=#{wp_id}")
      end

      # Listar tipos de work packages
      def list_types
        call_mcp('/tools/list_types')
      end
      
      # Listar estados
      def list_statuses
        call_mcp('/tools/list_statuses')
      end
      
      # Listar prioridades
      def list_priorities
        call_mcp('/tools/list_priorities')
      end

      def create_work_package(project_id:, subject:, type_id:, description: nil, priority_id: nil, assignee_id: nil)
        payload = {
          project_id: project_id,
          subject: subject,
          type_id: type_id
        }
        payload[:description] = description if description.present?
        payload[:priority_id] = priority_id if priority_id
        payload[:assignee_id] = assignee_id if assignee_id

        endpoint = "/tools/create_work_package?#{URI.encode_www_form(payload)}"
        call_mcp(endpoint, {})
      end
      
      # ============================================================================
      # USUARIOS
      # ============================================================================
      
      # Listar usuarios
      def list_users(active_only: false)
        call_mcp('/tools/list_users', { active_only: active_only })
      end
      
      # Obtener usuario específico
      def get_user(user_id)
        call_mcp("/tools/get_user?user_id=#{user_id}")
      end
      
      # ============================================================================
      # MEMBRESÍAS
      # ============================================================================
      
      # Listar membresías
      def list_memberships(project_id: nil, user_id: nil)
        params = []
        params << "project_id=#{project_id}" if project_id
        params << "user_id=#{user_id}" if user_id
        
        endpoint = '/tools/list_memberships'
        endpoint += "?#{params.join('&')}" if params.any?
        
        call_mcp(endpoint)
      end
      
      # Listar miembros de un proyecto
      def list_project_members(project_id)
        call_mcp("/tools/list_project_members?project_id=#{project_id}")
      end
      
      # ============================================================================
      # ROLES
      # ============================================================================
      
      # Listar roles
      def list_roles
        call_mcp('/tools/list_roles')
      end
      
      # ============================================================================
      # VERSIONES
      # ============================================================================
      
      # Listar versiones
      def list_versions(project_id: nil)
        endpoint = '/tools/list_versions'
        endpoint += "?project_id=#{project_id}" if project_id
        
        call_mcp(endpoint)
      end
      
      # ============================================================================
      # HEALTH CHECK
      # ============================================================================
      
      # Verificar estado del MCP Server
      def health_check
        begin
          uri = URI("#{mcp_url}/health")
          response = Net::HTTP.get_response(uri)
          
          if response.code.to_i == 200
            data = JSON.parse(response.body)
            { healthy: true, data: data }
          else
            { healthy: false, error: "Status #{response.code}" }
          end
        rescue StandardError => e
          Rails.logger.error "MCP Health Check Error: #{e.message}"
          { healthy: false, error: e.message }
        end
      end
      
      # ============================================================================
      # MÉTODO PRINCIPAL DE CONSULTA
      # ============================================================================
      
      private
      
      def call_mcp(endpoint, params = {}, form: false, base_url: nil)
        base_url ||= mcp_url
        unless base_url.present?
          Rails.logger.warn "MCP Server no configurado"
          result = { success: false, error: 'MCP_SERVER_URL no configurado' }
          DebugService.log_mcp_call(endpoint, params, result)
          return result
        end

        begin
          clean_base = base_url.to_s.chomp('/')
          clean_endpoint = endpoint.to_s.start_with?('/') ? endpoint.to_s : "/#{endpoint}"
          uri = URI("#{clean_base}#{clean_endpoint}")

          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = (uri.scheme == 'https')
          http.open_timeout = 5
          http.read_timeout = 30

          request = Net::HTTP::Post.new(uri, headers(form: form))
          if params.any?
            request.body = form ? URI.encode_www_form(params) : params.to_json
          end

          Rails.logger.info "MCP Request: POST #{uri}"

          response = http.request(request)

          if response.code.to_i == 200
            data = JSON.parse(response.body)
            result = { success: true, data: data }
            
            # DEBUG: Mostrar información detallada de la respuesta
            Rails.logger.info "📊 [MCP Response] Endpoint: #{endpoint}"
            Rails.logger.info "   Status: #{response.code}"
            Rails.logger.info "   Data keys: #{data.keys}"
            
            # Si es una colección, mostrar detalles
            if data['_embedded'] && data['_embedded']['elements']
              elements = data['_embedded']['elements']
              total = data['total'] || elements.size
              Rails.logger.info "   Collection: #{elements.size}/#{total} elements"
              
              # DEBUG EXTENDIDO: Analizar estructura de cada elemento
              if elements.any?
                Rails.logger.info "   🔍 [DEBUG] Analizando estructura de elementos:"
                elements.first(5).each_with_index do |elem, i|
                  Rails.logger.info "     #{i+1}. Elemento completo:"
                  elem.each do |key, value|
                    Rails.logger.info "        #{key}: #{value.inspect}"
                  end
                  Rails.logger.info "     ---"
                end
              end
            end
            
            DebugService.log_mcp_call(endpoint, params, result)
            result
          else
            Rails.logger.error "MCP Error: #{response.code} - #{response.body}"
            result = { success: false, error: "Error #{response.code}: #{response.body}" }
            DebugService.log_mcp_call(endpoint, params, result)
            result
          end

        rescue JSON::ParserError => e
          Rails.logger.error "MCP JSON Parse Error: #{e.message}"
          result = { success: false, error: "Error parsing response: #{e.message}" }
          DebugService.log_mcp_call(endpoint, params, result)
          result

        rescue StandardError => e
          Rails.logger.error "MCP Connection Error: #{e.message}"
          result = { success: false, error: "Connection error: #{e.message}" }
          DebugService.log_mcp_call(endpoint, params, result)
          result
        end
      end
      
      # Verificar si MCP está configurado
      # URL del MCP Server
      def mcp_url
        setting = IaColaborativa::McpSetting.first rescue nil
        (setting&.url.presence || ENV['MCP_SERVER_URL']).to_s.chomp('/')
      end

      # URL del MCP Server para busqueda de proyectos
      def search_mcp_url
        setting = IaColaborativa::McpSetting.first rescue nil
        (setting&.search_url.presence || mcp_url).to_s.chomp('/')
      end
      
      # Headers para las peticiones
      def headers(form: false)
        headers = {
          'Accept' => 'application/json'
        }
        headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json'

        credentials = mcp_basic_auth
        headers['Authorization'] = "Basic #{credentials}" if credentials.present?

        headers
      end

      def mcp_basic_auth
        setting = IaColaborativa::McpSetting.first rescue nil
        username = setting&.username.presence || ENV['MCP_SERVER_USERNAME']
        password = setting&.password.presence || ENV['MCP_SERVER_PASSWORD']
        return nil unless username.present? && password.present?

        Base64.strict_encode64("#{username}:#{password}")
      end

      # Construir estructura de colección compatible con OpenProject API
      def build_collection(elements, total)
        {
          '_type' => 'Collection',
          'total' => total,
          'count' => elements.size,
          'pageSize' => elements.size,
          'offset' => 1,
          '_embedded' => {
            'elements' => elements
          },
          '_links' => {
            'self' => { 'href' => '/api/v3/projects' }
          }
        }
      end

    end
  end
end



