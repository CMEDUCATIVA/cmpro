# Heredar directamente de ActionController::Base para evitar el sistema de autorización de OpenProject
class IaColaborativa::ChatController < ActionController::API
  # No heredamos de ApplicationController para evitar todos los filtros de OpenProject
  def create
    message = params[:message].to_s.strip
    agent_type = params[:agent_type].to_s.strip
    image_data = params[:image_data]
    current_user_data = params[:current_user]
    project_selection = params[:project]
    project_selection = project_selection.to_unsafe_h if project_selection.respond_to?(:to_unsafe_h)
    fallback_project_id = params[:project_id].presence || project_selection&.[]('id') || project_selection&.[](:id)

    # Log de entrada
    Rails.logger.info "=" * 80
    Rails.logger.info "🎯 ChatController - Nueva consulta"
    Rails.logger.info "   📝 Mensaje: #{message}"
    Rails.logger.info "   🤖 Agent Type recibido: '#{agent_type}'"
    Rails.logger.info "   🖼️ Imagen: #{image_data.present? ? 'Sí' : 'No'}"
    Rails.logger.info "   👤 Usuario: #{current_user_data.present? ? current_user_data['name'] : 'No detectado'}"
    Rails.logger.info "=" * 80
    project_label = if project_selection.present?
                      name = project_selection['name'] || project_selection[:name] || 'sin nombre'
                      id_value = project_selection['id'] || project_selection[:id] || 'desconocido'
                      "#{name} (ID: #{id_value})"
                    else
                      'No seleccionado'
                    end
    Rails.logger.info "   Proyecto: #{project_label}"
    Rails.logger.info "=" * 80

    if message.blank? && image_data.blank?
      render json: { response: "Por favor escribe un mensaje o adjunta una imagen" }, status: :ok
      return
    end

    project_payload = nil
    project_id = fallback_project_id
    if project_selection.present?
      project_payload = { 'selection' => project_selection }
      project_id = project_selection['id'] || project_selection[:id]
    elsif project_id.present?
      project_payload = { 'selection' => { 'id' => project_id } }
    end

    intent_param = params[:intent].presence&.to_s
    intent = intent_param.present? ? intent_param.to_sym : :general
    if agent_type == 'cde' && intent == :automation
      render json: automation_intent_payload(project_id, project_label), status: :ok
      return
    end
    Rails.logger.info "🔎 Intención detectada: #{intent}"
    Rails.logger.info "🧾 Project selección: #{project_selection.inspect}"
    Rails.logger.info "🧾 Project ID (fallback): #{project_id}"

    if agent_type == 'cde' && [:work_packages, :kpis, :planning, :costos, :involucrados].include?(intent)
      ::IaColaborativa::DebugService.log_event('work_packages_flow', 'SaraIA Obra', {
        stage: 'intent_detected',
        intent: intent,
        project_id: project_id,
        user_id: current_user_data&.dig('id') || current_user_data&.dig(:id),
        note: 'MCP deshabilitado para SaraIA Obra'
      })
      Rails.logger.info "MCP deshabilitado: no se consultan work_packages para el proyecto #{project_id}"
    end

    begin
      # Rutear según el agente seleccionado
      ai_result = case agent_type
                    when 'cde'
                      # 🏗️ SaraIA Obra - Datos en tiempo real del CDE (MCP)
                      Rails.logger.info "🏗️ Ruteando a: SaraObraAgent"
                      ::IaColaborativa::SaraObraAgent.chat(message, current_user_data, project_payload, intent, params[:thread_id])
                    when 'sara_tools'
                      Rails.logger.info "🛠️ Ruteando a: SaraTools::Agent"
                      ::IaColaborativa::SaraTools::Agent.chat(message, current_user_data, project_payload, intent, params[:thread_id], params[:turn_id])
                    when 'sara'
                      Rails.logger.info "IA Ruteando a: SaraAgent"
                      ::IaColaborativa::SaraAgent.chat(message, current_user_data, image_data)
                    when 'docs', '', nil
                      # 📚 SaraIA - Documentación BIM (LightRAG)
                      Rails.logger.info "📚 Ruteando a: SaraDocsAgent"
                      ::IaColaborativa::SaraDocsAgent.chat(message, image_data)
                    else
                      # Por defecto, usar documentación
                      Rails.logger.warn "⚠️ Agent type desconocido: '#{agent_type}', usando SaraDocsAgent por defecto"
                      ::IaColaborativa::SaraDocsAgent.chat(message, image_data)
                    end

      tool_calls = []
      events = []
      turn_meta = {}
      if ai_result.is_a?(Hash)
        ai_response = ai_result[:response] || ai_result['response']
        tool_calls = ai_result[:tool_calls] || ai_result['tool_calls'] || []
        events = ai_result[:events] || ai_result['events'] || []
        turn_meta = ai_result[:turn_meta] || ai_result['turn_meta'] || {}
        ai_metadata = ai_result[:metadata] || ai_result['metadata']
      else
        ai_response = ai_result
      end

      Rails.logger.info "✅ Respuesta generada (#{ai_response.to_s.length} caracteres)"
      Rails.logger.info "🧭 Eventos del turno: #{events.length} | Tool calls: #{tool_calls.length} | Turn meta: #{turn_meta.inspect}" if events.present? || tool_calls.present?

      agent_name = case agent_type
                   when 'cde' then 'SaraIA Obra'
                   when 'sara_tools' then 'Sara'
                   when 'sara' then 'SaraIA'
                   else 'SaraIA Docs'
                   end
      provider_cfg = ::IaColaborativa::BaseAgent.provider_config
      log_metadata = {
        intent: intent,
        project_id: project_id
      }
      if ai_metadata.is_a?(Hash)
        log_metadata.merge!(ai_metadata)
      else
        log_metadata.merge!(
          provider: provider_cfg[:provider],
          model: ::IaColaborativa::BaseAgent.ai_model(provider_cfg)
        )
      end
      if ai_response.present?
        ::IaColaborativa::DebugService.log_conversation_entry(
          agent_name,
          message,
          ai_response,
          log_metadata
        )
      else
        fallback_resp = ai_response.presence || "ERROR: sin respuesta de la IA"
        ::IaColaborativa::DebugService.log_conversation_entry(
          agent_name,
          message,
          fallback_resp,
          log_metadata.merge(error: 'no_content')
        )
        ai_response = fallback_resp
      end

      extras = {}
      if intent == :kpis
        Rails.logger.info 'KPIs deshabilitado: MCP no disponible para SaraIA Obra'
      end

      report_payload = extract_report_payload(tool_calls)
      if report_payload.present?
        begin
          tpl_path = report_template_path
          raise "No se encontro el template reporte en #{tpl_path}" unless tpl_path && File.exist?(tpl_path)
          template_html = File.read(tpl_path)
          data_hash = normalize_report_payload(report_payload)

          if data_hash[:items].present?
            html_filled = template_html.gsub('__DATA_JSON__', data_hash.to_json)
            extras[:report_html] = html_filled
            extras[:report_filename] = build_report_filename(data_hash[:project_id])
            extras[:report_ready_message] = 'Ya puedes descargar tu reporte tecnico.'
          else
            Rails.logger.warn 'Reporte: payload sin items validos'
          end
        rescue StandardError => e
          Rails.logger.error "Error preparando report_html: #{e.class} - #{e.message}"
        end
      end

      render json: {
        response: ai_response,
        intent: intent,
        tool_calls: tool_calls,
        events: events,
        turn_meta: turn_meta
      }.merge(extras), status: :ok
    rescue StandardError => e
      # Log del error
      agent_name = case agent_type
                   when 'cde' then 'SaraIA Obra'
                   when 'sara_tools' then 'Sara'
                   when 'sara' then 'SaraIA'
                   else 'SaraIA Docs'
                   end
      Rails.logger.error "#{agent_name} Error: #{e.class} - #{e.message}"
      Rails.logger.error e.backtrace.first(10).join("\n")

      # Registrar la conversaciÇün fallida en el debug
      begin
        provider_cfg = ::IaColaborativa::BaseAgent.provider_config
        ::IaColaborativa::DebugService.log_conversation_entry(
          agent_name,
          message,
          "ERROR: #{e.message}",
          {
            intent: intent,
            project_id: project_id,
            error_class: e.class.name,
            error_message: e.message,
            provider: provider_cfg[:provider],
            model: ::IaColaborativa::BaseAgent.ai_model(provider_cfg)
          }
        )
      rescue StandardError => log_err
        Rails.logger.error "Fallo al registrar conversaciÇün en DebugService: #{log_err.message}"
      end

      # Respuesta de fallback
    render json: {
      response: "Hola, soy #{agent_name} de CMPROYECTOS. Hubo un error: #{e.message}"
    }, status: :ok
  end
  end

  def turn_events
    turn_id = params[:turn_id].to_s
    since = params[:since].to_i

    if turn_id.blank?
      render json: { success: false, error: 'turn_id requerido' }, status: :unprocessable_entity
      return
    end

    payload = ::IaColaborativa::SaraTools::TurnStore.fetch_events(turn_id, since: since)
    Rails.logger.info "🛰️ Turn events poll turn_id=#{turn_id} since=#{since} returned=#{payload[:events].length} completed=#{payload[:completed]}"
    render json: payload.merge(success: true), status: :ok
  rescue StandardError => e
    Rails.logger.error "Sara turn_events error: #{e.class} - #{e.message}"
    render json: { success: false, error: e.message, turn_id: turn_id }, status: :ok
  end

  def greeting_response(current_user_data)
    name = current_user_data&.dig('name') || current_user_data&.dig(:name)
    greeting = name.present? ? "Hola #{name}," : 'Hola,'
    "#{greeting} ¿en qué proyecto o tarea BIM puedo ayudarte hoy?"
  end

  def automation_intent_payload(project_id, project_label)
    titles = automation_plan_titles
    ::IaColaborativa::DebugService.log_event('automation_flow', 'SaraIA Obra', {
      stage: 'intent_detected',
      project_id: project_id,
      project_label: project_label,
      options_count: titles.size
    })

    {
      response: build_automation_prompt(project_label, titles),
      automation_options: titles
    }
  end

  def automation_plan_titles(_project_id = nil)
    IaColaborativa::PebAutomation.order(:created_at).map do |plan|
      { id: plan.id, name: plan.plan_title.presence || "Tarjeta #{plan.id}" }
    end
  end

  def build_automation_prompt(project_label, titles)
    base = "Detecto que quieres crear algo en Automatización para #{project_label}."
    if titles.any?
      list = titles.each_with_index.map { |entry, index| "#{index + 1}. #{entry[:name]}" }.join("\n")
      "#{base} Estos son los tipos de proyectos disponibles:\n#{list}\nIndica el nombre exacto que quieres usar o responde si prefieres crear una nueva."
    else
      "#{base} Aún no hay proyectos registrados. ¿Quieres crear el primero?"
    end
  end

  # ============================================================================
  # 🐛 DEBUG ENDPOINT - Estado completo del sistema
  # ============================================================================

  def debug
    begin
      debug_data = ::IaColaborativa::DebugService.get_system_state
      debug_data[:recent_agent_turns] = ::IaColaborativa::AgentTurnHistoryService.recent_turns(limit: 10, agent: 'sara_tools')

      render json: {
        success: true,
        data: debug_data
      }, status: :ok

    rescue StandardError => e
      Rails.logger.error "Debug Error: #{e.class} - #{e.message}"
      Rails.logger.error e.backtrace.first(5).join("\n")

      render json: {
        success: false,
        error: e.message
      }, status: :ok
    end
  end

  # Obtener logs por tipo
  def debug_logs
    event_type = params[:event_type]
    limit = params[:limit]&.to_i || 50

    logs = if event_type.present?
             ::IaColaborativa::DebugService.get_logs_by_type(event_type, limit)
           else
             ::IaColaborativa::DebugService.get_system_state[:recent_logs]
           end

    render json: { success: true, logs: logs }, status: :ok
  end

  # Obtener historial de conversaciones
  def debug_conversations
    agent_name = params[:agent_name]
    limit = params[:limit]&.to_i || 20

    conversations = if agent_name.present?
                      ::IaColaborativa::DebugService.get_conversation_by_agent(agent_name, limit)
                    else
                      ::IaColaborativa::DebugService.get_system_state[:conversation_history]
                    end

    render json: { success: true, conversations: conversations }, status: :ok
  end

  def agent_turns
    limit = params[:limit]&.to_i || 10
    agent = params[:agent].presence
    user_id = params[:user_id].presence

    turns = ::IaColaborativa::AgentTurnHistoryService.recent_turns(
      limit: limit,
      agent: agent,
      user_id: user_id
    )

    Rails.logger.info "🗂️ Agent turns history limit=#{limit} agent=#{agent.inspect} user_id=#{user_id.inspect} returned=#{turns.length}"
    render json: { success: true, turns: turns }, status: :ok
  rescue StandardError => e
    Rails.logger.error "Agent turns error: #{e.class} - #{e.message}"
    render json: { success: false, error: e.message }, status: :ok
  end

  def agent_turn
    turn_id = params[:turn_id].to_s
    turn = ::IaColaborativa::AgentTurnHistoryService.find_turn(turn_id)

    if turn
      Rails.logger.info "🗂️ Agent turn detail turn_id=#{turn_id} found=true events=#{turn[:events]&.length || 0}"
      render json: { success: true, turn: turn }, status: :ok
    else
      Rails.logger.info "🗂️ Agent turn detail turn_id=#{turn_id} found=false"
      render json: { success: false, error: 'Turno no encontrado', turn_id: turn_id }, status: :ok
    end
  rescue StandardError => e
    Rails.logger.error "Agent turn detail error: #{e.class} - #{e.message}"
    render json: { success: false, error: e.message, turn_id: turn_id }, status: :ok
  end

  def lightrag
    message = params[:message].to_s.strip
    mode = params[:mode].presence || 'hybrid'

    if message.blank?
      render json: { response: 'Por favor escribe una consulta.' }, status: :ok
      return
    end

    Rails.logger.info "[IA CKEditor] Consulta directa a LightRAG (modo: #{mode})"

    result = ::IaColaborativa::LightragService.query(message, mode: mode)

    if result[:success] && result[:response].present?
      render json: { response: result[:response], context: result[:context] }, status: :ok
    else
      error_message = result[:error] || 'LightRAG no devolvió respuesta.'
      Rails.logger.error "[IA CKEditor] Error LightRAG: #{error_message}"
      render json: { response: "Lo siento, no pude obtener información de la base de conocimiento. Detalle: #{error_message}" }, status: :ok
    end
  rescue StandardError => e
    Rails.logger.error "[IA CKEditor] Excepción LightRAG: #{e.class} - #{e.message}"
    render json: { response: "Hubo un error al consultar LightRAG: #{e.message}" }, status: :ok
  end

  # ============================================================================
  # 🔍 SEARCH PROJECTS ENDPOINT
  # ============================================================================

  public

  def search_projects
    search_term = params[:search].to_s.strip
    active_only = params[:active_only] != 'false'
    user_id = params[:user_id]&.to_i
    Rails.logger.info "Busqueda de proyectos: '#{search_term}' (user_id: #{user_id}, active_only: #{active_only})"

    begin
      if user_id.blank? || user_id.to_i <= 0
        render json: { success: false, error: 'user_id requerido' }, status: :unprocessable_entity
        return
      end
      result = ::IaColaborativa::McpService.list_user_projects(user_id: user_id, active_only: active_only)

      if result[:success]
        projects = result.dig(:data, '_embedded', 'elements') || []

        if search_term.present?
          projects = projects.select do |project|
            title = project.dig('_links', 'project', 'title') || project['name']
            title.to_s.downcase.include?(search_term.downcase)
          end
        end

        Rails.logger.info "Proyectos encontrados: #{projects.size}"

        render json: {
          success: true,
          projects: projects.map do |p|
            project_link = p.dig('_links', 'project')
            {
              id: project_link && project_link['href'] ? project_link['href'].split('/').last : p['id'],
              name: project_link ? project_link['title'] : p['name'],
              identifier: p['identifier'],
              description: p.dig('description', 'raw'),
              active: p['active'],
              created_at: p['createdAt'],
              updated_at: p['updatedAt'],
              project_href: project_link && project_link['href'],
              project_title: project_link && project_link['title']
            }
          end,
          total: projects.size
        }, status: :ok
      else
        Rails.logger.error "Error al obtener proyectos: #{result[:error]}"
        render json: { success: false, error: result[:error] || 'Error al consultar proyectos' }, status: :ok
      end
    rescue StandardError => e
      Rails.logger.error "Excepcion al buscar proyectos: #{e.class} - #{e.message}"
      render json: { success: false, error: "Error al buscar proyectos: #{e.message}" }, status: :ok
    end
  end

  # Limpiar logs y conversaciones del DebugService
  def clear_debug
    ::IaColaborativa::DebugService.clear_logs
    render json: { success: true, message: 'Logs de debug limpiados' }, status: :ok
  rescue StandardError => e
    Rails.logger.error "Error al limpiar debug: #{e.class} - #{e.message}"
    render json: { success: false, error: e.message }, status: :internal_server_error
  end

  # Reporte de KPIs (HTML) a partir de MCP
  def kpi_report
    Rails.logger.warn 'KPIs deshabilitado: MCP no disponible'
    render json: { success: false, error: 'KPIs no disponible' }, status: :ok
  end

  # Reporte de mapa mental basado en la respuesta de Sara Docs
  def mindmap_report
    content = params[:content].to_s.strip
    title = params[:title].presence || 'Mapa mental'

    if content.blank?
      render json: { success: false, error: 'content requerido' }, status: :unprocessable_entity
      return
    end

    tpl_path = mindmap_template_path
    unless tpl_path && File.exist?(tpl_path)
      render json: { success: false, error: 'No se encontró el template mapa_mental.html' }, status: :ok
      return
    end

    map_data = build_mindmap_data(content, title)
    begin
      template_html = File.read(tpl_path)
      html_filled = template_html.gsub('__DATA_JSON__', map_data.to_json)
      render json: { success: true, html: html_filled }, status: :ok
    rescue StandardError => e
      Rails.logger.error "Error al generar mapa mental: #{e.class} - #{e.message}"
      render json: { success: false, error: e.message }, status: :ok
    end
  end

  def kpi_template_path
    plugin_path = if defined?(OpenProject::IaColaborativa::Engine)
                    OpenProject::IaColaborativa::Engine.root.join('app', 'assets', 'templates', 'cronograma_real_vs_planificado.html')
                  end
    return plugin_path if File.exist?(plugin_path)

    alt_path = Rails.root.join('app', 'assets', 'templates', 'cronograma_real_vs_planificado.html')
    return alt_path if File.exist?(alt_path)

    nil
  end

  def mindmap_template_path
    plugin_path = if defined?(OpenProject::IaColaborativa::Engine)
                    OpenProject::IaColaborativa::Engine.root.join('app', 'assets', 'templates', 'mapa_mental.html')
                  end
    return plugin_path if plugin_path && File.exist?(plugin_path)

    alt_path = Rails.root.join('app', 'assets', 'templates', 'mapa_mental.html')
    return alt_path if File.exist?(alt_path)

    nil
  end

  def report_template_path
    plugin_path = if defined?(OpenProject::IaColaborativa::Engine)
                    OpenProject::IaColaborativa::Engine.root.join('app', 'assets', 'templates', 'reporte.html')
                  end
    return plugin_path if plugin_path && File.exist?(plugin_path)

    alt_path = Rails.root.join('app', 'assets', 'templates', 'reporte.html')
    return alt_path if File.exist?(alt_path)

    nil
  end

  def extract_report_payload(tool_calls)
    return nil unless tool_calls.is_a?(Array)

    tool_calls.each do |call|
      next unless call.is_a?(Hash)
      payload = call[:parsed] || call['parsed']
      raw = call[:raw] || call['raw']
      if payload.nil? && raw.present?
        payload = JSON.parse(raw) rescue nil
      end
      next unless payload.is_a?(Hash)

      payload = payload['output'] if payload.key?('output')
      payload = payload['result'] if payload.key?('result')
      payload = payload['data'] if payload.key?('data')

      next unless payload.is_a?(Hash)
      if payload.key?('work_packages') || payload.key?('_embedded') || payload.key?('items')
        return payload
      end
    end

    nil
  end

  def normalize_report_payload(payload)
    items = payload['items'] if payload['items'].is_a?(Array)
    items ||= payload.dig('_embedded', 'elements') if payload.dig('_embedded', 'elements').is_a?(Array)

    work_packages = payload['work_packages']
    if work_packages.is_a?(String)
      work_packages = JSON.parse(work_packages) rescue nil
    end
    if work_packages.is_a?(Hash)
      items ||= work_packages['items'] if work_packages['items'].is_a?(Array)
      items ||= work_packages.dig('_embedded', 'elements') if work_packages.dig('_embedded', 'elements').is_a?(Array)
    elsif work_packages.is_a?(Array)
      items ||= work_packages
    end

    project = payload['project'] || {}
    {
      project_name: payload['project_name'] || project['name'],
      project_id: payload['project_id'] || project['id'],
      generated_at: Time.now.iso8601,
      items: items || []
    }
  end


def build_projects_prompt(search_term)
  base = 'Devuelve SOLO JSON con el formato: {"projects":[{"id":"","name":"","identifier":"","description":""}]}. '

  if search_term.present?
    base + "Lista proyectos que coincidan con: #{search_term}."
  else
    base + 'Lista los proyectos disponibles del usuario.'
  end
end

def extract_projects_payload(tool_calls, response_text)
  payload = extract_payload_from_tool_calls(tool_calls)
  return payload if payload

  parse_json_payload(response_text)
end

def extract_payload_from_tool_calls(tool_calls)
  return nil unless tool_calls.is_a?(Array)

  tool_calls.each do |call|
    next unless call.is_a?(Hash)
    payload = call[:parsed] || call['parsed']
    raw = call[:raw] || call['raw']
    if payload.nil? && raw.present?
      payload = JSON.parse(raw) rescue nil
    end
    next unless payload.is_a?(Hash) || payload.is_a?(Array)

    return payload if payload.is_a?(Array)
    return payload if payload.key?('projects') || payload.key?('items') || payload.key?('_embedded')
  end

  nil
end

  def parse_json_payload(text)
    return nil if text.blank?

    candidates = []
    fenced = text.scan(/```json\s*(.*?)\s*```/m).flatten
    candidates.concat(fenced) if fenced.any?
    obj_start = text.index('{')
    obj_end = text.rindex('}')
    if obj_start && obj_end && obj_end > obj_start
      candidates << text[obj_start..obj_end]
    end
  arr_start = text.index('[')
  arr_end = text.rindex(']')
  if arr_start && arr_end && arr_end > arr_start
    candidates << text[arr_start..arr_end]
  end

  candidates.each do |candidate|
    parsed = JSON.parse(candidate) rescue nil
    return parsed if parsed
  end

  nil
end

def normalize_projects_payload(payload)
  return [] if payload.nil?

  items = if payload.is_a?(Array)
            payload
          elsif payload.is_a?(Hash)
            payload['projects'] || payload['items'] || payload.dig('_embedded', 'elements') || []
          else
            []
          end

  items.map do |item|
    next unless item.is_a?(Hash)
    project_link = item.dig('_links', 'project')
    project = item['project'] || {}
    {
      id: item['id'] || project['id'] || (project_link && project_link['href'] ? project_link['href'].split('/').last : nil),
      name: item['name'] || project['name'] || (project_link && project_link['title']),
      identifier: item['identifier'] || project['identifier'],
      description: item.dig('description', 'raw') || item['description'] || project.dig('description', 'raw'),
      _links: item['_links']
    }.compact
  end.compact
end

  def build_report_filename(project_id)
    suffix = project_id.present? ? project_id.to_s : 'general'
    "reporte_tecnico_#{suffix}.html"
  end


  def build_mindmap_data(content, title)
    system_prompt = <<~PROMPT
      Eres un asistente que convierte texto en un mapa mental JSON.
      Devuelve SOLO JSON con este formato:
      {
        "title": "<titulo>",
        "nodes": [
          { "label": "Nodo principal", "children": [ { "label": "Subnodo", "children": [] } ] }
        ]
      }
      Reglas:
      - No incluyas texto fuera del JSON.
      - Máximo 5 nodos principales y cada uno con máximo 4 hijos.
      - Usa frases cortas (<= 80 caracteres por label).
      - Si no hay suficiente información, usa un único nodo que resuma el texto.
    PROMPT

    ai_response = IaColaborativa::BaseAgent.call_openrouter_api(content, system_prompt, nil)
    parsed = JSON.parse(ai_response) rescue nil

    if parsed.is_a?(Hash) && parsed['nodes'].is_a?(Array)
      {
        title: parsed['title'].presence || title,
        nodes: parsed['nodes']
      }
    else
      fallback_nodes = content.split(/\.\s+/).first(5).map do |line|
        { label: line.strip[0..120], children: [] }
      end
      {
        title: title,
        nodes: fallback_nodes.presence || [{ label: content[0..120], children: [] }]
      }
    end
  end
  private
end
