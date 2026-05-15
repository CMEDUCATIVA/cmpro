require_relative 'debug_service'

module IaColaborativa
  class AutomationFlowService
    def initialize(plan:, project_id:)
      @plan = plan
      @project_id = project_id.to_i
      @created = []
    end

    def run
      return failure('project_id inválido') if @project_id <= 0
      return failure('Plan sin payload') unless @plan && @plan.payload

      payload = @plan.payload || {}
      containers = normalize_containers(payload)

      if containers.empty?
        return failure('El plan no contiene tarjetas envolventes')
      end

      DebugService.log_event('automation_flow', 'SaraIA Obra', {
        stage: 'execute_plan',
        project_id: @project_id,
        plan_id: @plan.id,
        plan_title: @plan.plan_title
      })

      containers.each do |container|
        create_work_package_from_entry(container)
        Array(container['children']).each do |child|
          create_work_package_from_entry(child, parent: container)
        end
      end

      { success: true, created: @created, message: "Se crearon #{@created.size} paquetes de trabajo." }
    rescue StandardError => e
      Rails.logger.error "AutomationFlowService error: #{e.class} - #{e.message}"
      failure(e.message)
    end

    private

    def normalize_containers(payload)
      (payload['containers'] || payload[:containers] || []).map { |container| container || {} }
    end

    def create_work_package_from_entry(entry, parent: nil)
      subject = entry['name'] || entry['label'] || 'Elemento sin nombre'
      type_id = (entry['type_id'] || entry['typeId']).to_i
      return unless type_id.positive?

      result = ::IaColaborativa::McpService.create_work_package(
        project_id: @project_id,
        subject: subject,
        type_id: type_id
      )

      @created << { subject: subject, type_id: type_id, response: result }
    end

    def failure(message)
      { success: false, error: message }
    end
  end
end
