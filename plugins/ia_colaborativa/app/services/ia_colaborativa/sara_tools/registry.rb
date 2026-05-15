require 'json'

module IaColaborativa
  module SaraTools
    class Registry
      class << self
        TOOL_DISPLAY_NAMES = {
          'list_projects' => 'CMPROYECTOSBIM · Consultar proyectos',
          'get_project' => 'CMPROYECTOSBIM · Consultar proyecto',
          'list_work_packages' => 'CMPROYECTOSBIM · Consultar paquetes de trabajo',
          'get_work_package' => 'CMPROYECTOSBIM · Consultar paquete de trabajo',
          'list_project_members' => 'CMPROYECTOSBIM · Consultar miembros del proyecto',
          'get_user' => 'CMPROYECTOSBIM · Consultar usuario',
          'create_work_package' => 'CMPROYECTOSBIM · Crear paquete de trabajo'
        }.freeze

        def definitions
          [
            function_definition(
              name: 'list_projects',
              description: 'Lista proyectos visibles para el usuario actual dentro del CDE CMPROYECTOSBIM.',
              properties: {
                active_only: {
                  type: 'boolean',
                  description: 'Si es true, devuelve solo proyectos activos.'
                }
              }
            ),
            function_definition(
              name: 'get_project',
              description: 'Obtiene el detalle de un proyecto por ID.',
              properties: {
                project_id: {
                  type: 'integer',
                  description: 'ID del proyecto en CMPROYECTOSBIM.'
                }
              },
              required: ['project_id']
            ),
            function_definition(
              name: 'list_work_packages',
              description: 'Lista paquetes de trabajo de un proyecto.',
              properties: {
                project_id: {
                  type: 'integer',
                  description: 'ID del proyecto. Si no se envía, se usa el proyecto seleccionado.'
                },
                status: {
                  type: 'string',
                  description: "Filtro de estado. Usa 'open' o 'all'."
                }
              }
            ),
            function_definition(
              name: 'get_work_package',
              description: 'Obtiene el detalle de un paquete de trabajo por ID.',
              properties: {
                work_package_id: {
                  type: 'integer',
                  description: 'ID del paquete de trabajo.'
                }
              },
              required: ['work_package_id']
            ),
            function_definition(
              name: 'list_project_members',
              description: 'Lista miembros de un proyecto.',
              properties: {
                project_id: {
                  type: 'integer',
                  description: 'ID del proyecto. Si no se envía, se usa el proyecto seleccionado.'
                }
              }
            ),
            function_definition(
              name: 'get_user',
              description: 'Obtiene el detalle de un usuario por ID.',
              properties: {
                user_id: {
                  type: 'integer',
                  description: 'ID del usuario.'
                }
              },
              required: ['user_id']
            ),
            function_definition(
              name: 'create_work_package',
              description: 'Crea un paquete de trabajo nuevo en un proyecto.',
              properties: {
                project_id: {
                  type: 'integer',
                  description: 'ID del proyecto. Si no se envía, se usa el proyecto seleccionado.'
                },
                subject: {
                  type: 'string',
                  description: 'Nombre del paquete de trabajo.'
                },
                type_id: {
                  type: 'integer',
                  description: 'ID del tipo de paquete de trabajo.'
                },
                description: {
                  type: 'string',
                  description: 'Descripción del paquete de trabajo.'
                },
                priority_id: {
                  type: 'integer',
                  description: 'ID de prioridad.'
                },
                assignee_id: {
                  type: 'integer',
                  description: 'ID del usuario asignado.'
                }
              },
              required: %w[subject type_id]
            )
          ]
        end

        def display_name(name)
          TOOL_DISPLAY_NAMES[name.to_s] || name.to_s
        end

        def execute(name, arguments = {}, context = {})
          args = normalize_hash(arguments)
          Rails.logger.info "[SaraTools::Registry] tool=#{name} display_name=#{display_name(name)} args=#{args.inspect} context_project_id=#{context[:project_id].inspect} context_user_id=#{context[:user_id].inspect}"
          case name.to_s
          when 'list_projects'
            execute_list_projects(args, context)
          when 'get_project'
            execute_get_project(args, context)
          when 'list_work_packages'
            execute_list_work_packages(args, context)
          when 'get_work_package'
            execute_get_work_package(args, context)
          when 'list_project_members'
            execute_list_project_members(args, context)
          when 'get_user'
            execute_get_user(args, context)
          when 'create_work_package'
            execute_create_work_package(args, context)
          else
            { success: false, error: "Tool no soportada: #{name}" }
          end
        rescue StandardError => e
          Rails.logger.error "[SaraTools::Registry] tool=#{name} error=#{e.class} #{e.message}"
          {
            success: false,
            error: "#{e.class}: #{e.message}"
          }
        end

        private

        def function_definition(name:, description:, properties:, required: [])
          {
            type: 'function',
            function: {
              name: name,
              description: description,
              parameters: {
                type: 'object',
                properties: properties,
                required: required,
                additionalProperties: false
              }
            }
          }
        end

        def execute_list_projects(args, context)
          user_id = integer_or_nil(context[:user_id])
          return { success: false, error: 'user_id no disponible en el contexto' } unless user_id

          result = ::IaColaborativa::McpService.list_user_projects(
            user_id: user_id,
            active_only: args.fetch('active_only', true)
          )

          return result unless result[:success]

          elements = extract_elements(result)
          Rails.logger.info "[SaraTools::Registry] list_projects total=#{elements.length} user_id=#{user_id}"
          {
            success: true,
            total: elements.length,
            projects: elements.first(20).map do |project|
              project_link = project.dig('_links', 'project') || {}
              {
                id: extract_project_id(project),
                name: project_link['title'] || project['name'],
                identifier: project['identifier'],
                active: project['active']
              }
            end
          }
        end

        def execute_get_project(args, context)
          project_id = integer_or_nil(args['project_id']) || integer_or_nil(context[:project_id])
          return { success: false, error: 'project_id es requerido' } unless project_id

          result = ::IaColaborativa::McpService.get_project(project_id)
          return result unless result[:success]

          project = result[:data] || {}
          Rails.logger.info "[SaraTools::Registry] get_project project_id=#{project_id} found=#{project.present?}"
          {
            success: true,
            project: {
              id: project['id'],
              name: project['name'],
              identifier: project['identifier'],
              status: project['status'],
              active: project['active'],
              public: project['public'],
              description: project.dig('description', 'raw')
            }
          }
        end

        def execute_list_work_packages(args, context)
          project_id = integer_or_nil(args['project_id']) || integer_or_nil(context[:project_id])
          return { success: false, error: 'Debes indicar un proyecto o seleccionar uno antes de consultar paquetes.' } unless project_id

          result = ::IaColaborativa::McpService.list_work_packages(
            project_id: project_id,
            status: args['status'].presence || 'open'
          )
          return result unless result[:success]

          elements = extract_elements(result)
          Rails.logger.info "[SaraTools::Registry] list_work_packages project_id=#{project_id} total=#{elements.length} status=#{args['status'].presence || 'open'}"
          {
            success: true,
            project_id: project_id,
            total: elements.length,
            work_packages: elements.first(25).map do |wp|
              links = wp['_links'] || {}
              {
                id: wp['id'],
                subject: wp['subject'],
                type: links.dig('type', 'title'),
                status: links.dig('status', 'title'),
                assignee: links.dig('assignee', 'title'),
                responsible: links.dig('responsible', 'title'),
                percentage_done: wp['percentageDone'] || wp['derivedPercentageDone']
              }
            end
          }
        end

        def execute_get_work_package(args, _context)
          work_package_id = integer_or_nil(args['work_package_id'])
          return { success: false, error: 'work_package_id es requerido' } unless work_package_id

          result = ::IaColaborativa::McpService.get_work_package(work_package_id)
          return result unless result[:success]

          wp = result[:data] || {}
          Rails.logger.info "[SaraTools::Registry] get_work_package work_package_id=#{work_package_id} found=#{wp.present?}"
          links = wp['_links'] || {}
          {
            success: true,
            work_package: {
              id: wp['id'],
              subject: wp['subject'],
              description: wp.dig('description', 'raw'),
              status: links.dig('status', 'title'),
              type: links.dig('type', 'title'),
              assignee: links.dig('assignee', 'title'),
              responsible: links.dig('responsible', 'title'),
              percentage_done: wp['percentageDone'] || wp['derivedPercentageDone']
            }
          }
        end

        def execute_list_project_members(args, context)
          project_id = integer_or_nil(args['project_id']) || integer_or_nil(context[:project_id])
          return { success: false, error: 'project_id es requerido' } unless project_id

          result = ::IaColaborativa::McpService.list_project_members(project_id)
          return result unless result[:success]

          elements = extract_elements(result)
          Rails.logger.info "[SaraTools::Registry] list_project_members project_id=#{project_id} total=#{elements.length}"
          {
            success: true,
            project_id: project_id,
            total: elements.length,
            members: elements.first(30).map do |membership|
              principal = membership.dig('_links', 'principal') || {}
              {
                membership_id: membership['id'],
                user_id: extract_id_from_href(principal['href']),
                name: principal['title']
              }
            end
          }
        end

        def execute_get_user(args, _context)
          user_id = integer_or_nil(args['user_id'])
          return { success: false, error: 'user_id es requerido' } unless user_id

          result = ::IaColaborativa::McpService.get_user(user_id)
          return result unless result[:success]

          user = result[:data] || {}
          Rails.logger.info "[SaraTools::Registry] get_user user_id=#{user_id} found=#{user.present?}"
          {
            success: true,
            user: {
              id: user['id'],
              name: [user['firstName'], user['lastName']].compact.join(' ').strip,
              email: user['email'],
              login: user['login'],
              status: user['status']
            }
          }
        end

        def execute_create_work_package(args, context)
          project_id = integer_or_nil(args['project_id']) || integer_or_nil(context[:project_id])
          return { success: false, error: 'project_id es requerido para crear un paquete.' } unless project_id

          result = ::IaColaborativa::McpService.create_work_package(
            project_id: project_id,
            subject: args['subject'].to_s,
            type_id: integer_or_nil(args['type_id']),
            description: args['description'],
            priority_id: integer_or_nil(args['priority_id']),
            assignee_id: integer_or_nil(args['assignee_id'])
          )
          return result unless result[:success]

          wp = result[:data] || {}
          Rails.logger.info "[SaraTools::Registry] create_work_package project_id=#{project_id} created_id=#{wp['id'].inspect}"
          {
            success: true,
            created: {
              id: wp['id'],
              subject: wp['subject']
            }
          }
        end

        def normalize_hash(value)
          hash = value.respond_to?(:to_h) ? value.to_h : value
          return {} unless hash.is_a?(Hash)

          hash.each_with_object({}) do |(key, entry), memo|
            memo[key.to_s] = entry
          end
        end

        def extract_elements(result)
          result.dig(:data, '_embedded', 'elements') || result.dig(:data, '_embedded', :elements) || []
        end

        def extract_project_id(project)
          project_link = project.dig('_links', 'project')
          href = project_link && project_link['href']
          return extract_id_from_href(href) if href.present?

          integer_or_nil(project['id']) || project['id']
        end

        def extract_id_from_href(href)
          return nil if href.blank?

          integer_or_nil(href.to_s.split('/').last)
        end

        def integer_or_nil(value)
          return nil if value.nil? || value == ''

          Integer(value)
        rescue ArgumentError, TypeError
          nil
        end
      end
    end
  end
end
