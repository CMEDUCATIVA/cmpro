require "ostruct"
require "digest"
require "base64"
require "securerandom"

class EmailEmailController < ApplicationController
  before_action :find_project_by_project_id
  before_action :authorize
  helper_method :history_delivery_status, :history_datetime_label, :smtp_source_options, :default_smtp_source_for_forms
  skip_before_action :authorize, only: [:flow_list]
  before_action :authorize_macro_list!, only: [:flow_list]
  before_action :set_active_tab
  before_action :load_settings, only: [:index, :settings, :update_settings, :send_form, :send_email, :preview, :flows, :flows_history, :templates, :new_template, :create_template, :edit_template, :update_template, :destroy_template]
  before_action :load_templates, only: [:index, :templates, :new_template, :create_template, :edit_template, :update_template, :send_form, :send_email, :flows, :flows_history]
  before_action :load_whatsapp_templates, only: [:flows]
  before_action :load_send_context, only: [:index, :send_form, :send_email, :flows, :flows_history]
  before_action :load_contact_fields, only: [:flows]
  before_action :load_template, only: [:edit_template, :update_template, :destroy_template]
  before_action :load_template_attachment, only: [:destroy_template_attachment]

  skip_before_action :find_project_by_project_id, only: [:webhook_flow]
  skip_before_action :authorize, only: [:webhook_flow, :open_track]
  skip_before_action :set_active_tab, only: [:webhook_flow, :open_track]
  skip_before_action :load_settings, only: [:webhook_flow, :open_track]
  skip_before_action :load_templates, only: [:webhook_flow, :open_track]
  skip_before_action :load_send_context, only: [:webhook_flow, :open_track]
  skip_before_action :load_contact_fields, only: [:webhook_flow, :open_track]
  skip_before_action :verify_authenticity_token, only: [:webhook_flow, :open_track]
  skip_before_action :require_login, only: [:webhook_flow, :open_track], raise: false
  skip_before_action :check_if_login_required, only: [:webhook_flow, :open_track], raise: false

  def index
    render :index_email
  end

  def settings
    render :index_email
  end

  def update_settings
    if @settings.update(settings_params)
      redirect_to whatsapp_plugin_project_email_settings_path(@project), notice: "Configuracion guardada."
    else
      render :index_email
    end
  end

  def templates
    @template = EmailTemplate.new
    render :index_email
  end

  def new_template
    @template = EmailTemplate.new
    render :index_email
  end

  def create_template
    @template = EmailTemplate.new(template_params)
    @template.project = @project
    if @template.save
      store_template_attachments(@template)
      redirect_to whatsapp_plugin_project_email_templates_path(@project), notice: "Plantilla creada."
    else
      render :index_email
    end
  end

  def edit_template
    render :index_email
  end

  def update_template
    if @template.update(template_params)
      store_template_attachments(@template)
      redirect_to whatsapp_plugin_project_email_templates_path(@project), notice: "Plantilla actualizada."
    else
      render :index_email
    end
  end

  def destroy_template
    @template.update(active: false)
    redirect_to whatsapp_plugin_project_email_templates_path(@project), notice: "Plantilla desactivada."
  end

  def destroy_template_attachment
    template = @template_attachment.email_template
    path = @template_attachment.storage_path.to_s
    @template_attachment.destroy
    if path.present? && File.exist?(path)
      File.delete(path)
    end
    redirect_to whatsapp_plugin_project_email_template_edit_path(@project, template.id), notice: "Adjunto eliminado."
  end

  def send_form
    unless @settings&.enabled?
      flash.now[:alert] = "El modulo Email esta desactivado."
    end
    render :index_email
  end

  def send_email
    unless @settings&.enabled?
      flash.now[:alert] = "El modulo Email esta desactivado."
      render :index_email
      return
    end
    template = find_template_for_preview
    subject = if template
                template.subject.to_s.presence || email_params[:subject].to_s
              else
                email_params[:subject].to_s
              end
    if subject.blank?
      Rails.logger.info("[EmailSend] blocked: subject blank template_id=#{email_params[:template_id].to_s}")
      flash.now[:alert] = "El asunto es obligatorio."
      render :index_email
      return
    end
    body = template ? template.body.to_s : email_params[:body].to_s
    body_html = template&.html_mode? ? template.body_html.to_s : ""
    if body.blank? && body_html.present?
      body = body_html
    end
    if body.blank? && body_html.blank?
      Rails.logger.info("[EmailSend] blocked: body blank template_id=#{email_params[:template_id].to_s}")
      flash.now[:alert] = "El contenido es obligatorio."
      render :index_email
      return
    end
    recipients = build_recipients
    if recipients.empty?
      Rails.logger.info("[EmailSend] blocked: recipients empty emails=#{email_params[:emails].to_s.inspect} user_ids=#{Array(email_params[:user_ids]).inspect}")
      flash.now[:alert] = "Selecciona al menos un destinatario."
      render :index_email
      return
    end

    scheduled_at = parse_scheduled_at
    if scheduled_at && scheduled_at <= Time.current
      flash.now[:alert] = "La fecha de programacion debe ser futura."
      render :index_email
      return
    end
    smtp_source = if template&.smtp_source.present?
                    normalize_smtp_source(template.smtp_source)
                  else
                    normalize_smtp_source(email_params[:smtp_source])
                  end
    throttle = (@settings&.throttle_per_minute.to_i > 0 ? @settings.throttle_per_minute : 60)
    interval = (60.0 / throttle).ceil
    bypass_rate_limit = email_params[:bypass_rate_limit].to_s == "1"

    deliveries = []
    sender_name = if template
                    template.sender_name.to_s
                  else
                    email_params[:sender_name].to_s.presence
                  end

    recipients.each_with_index do |recipient, index|
      open_tracking_enabled = template&.open_tracking_enabled? || email_params[:open_tracking_enabled].to_s == "1"
      delivery = EmailDelivery.create!(
        project: @project,
        email_template: template,
        sender: User.current,
        sender_name: sender_name,
        recipient_user: recipient[:user],
        recipient_email: recipient[:email],
        subject: subject,
        body: body,
        body_html: body_html.presence,
        smtp_source: smtp_source,
        status: "queued",
        render_tokens: false,
        bypass_rate_limit: bypass_rate_limit,
        open_tracking_token: open_tracking_enabled ? generate_open_tracking_token : nil,
        scheduled_at: scheduled_at ? scheduled_at + (index * interval).seconds : nil
      )
      deliveries << delivery
    end

    store_attachments(deliveries)
    store_template_delivery_attachments(deliveries, template)
    deliveries.each do |delivery|
      if delivery.scheduled_at.present?
        EmailEmailSendJob.set(wait_until: delivery.scheduled_at).perform_later(delivery.id)
      else
        EmailEmailSendJob.perform_later(delivery.id)
      end
    end

    flash.now[:notice] = "Envios programados: #{deliveries.size}."
    load_send_context
    render :index_email
  end

  def preview
    template = find_template_for_preview
    subject = email_params[:subject].to_s
    body = template ? template.body.to_s : email_params[:body].to_s
    contact_preview = OpenStruct.new(
      first_name: User.current.name.to_s,
      email: User.current.mail.to_s,
      phone: ""
    )

    renderer = EmailEmail::TemplateRenderer.new(
      project: @project,
      sender: User.current,
      recipient: User.current,
      signature: @settings&.signature,
      contact: contact_preview
    )
    html = renderer.render_html(body)
    text = renderer.render_plain_from_html(html)
    render json: { subject: renderer.render_text(subject), html: html, text: text }
  end

  def open_track
    token = params[:token].to_s
    if token.present?
      delivery = EmailDelivery.find_by(project_id: @project.id, open_tracking_token: token)
      if delivery
        first_open = delivery.opened_at.blank?
        delivery.register_open!
        if first_open
          delivery.reload
          delivery.log_email_opened_activity!
        end
      end
    end

    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    send_data transparent_pixel_gif, type: "image/gif", disposition: "inline"
  rescue StandardError
    send_data transparent_pixel_gif, type: "image/gif", disposition: "inline"
  end

  def history
    @history_selected_date = parse_history_date(params[:history_date])
    persisted_deliveries = EmailDelivery.where(project: @project)
                                        .order(Arel.sql("COALESCE(sent_at, created_at) DESC"), id: :desc)
                                        .to_a
    flow_pending_deliveries = pending_flow_deliveries
    deliveries = persisted_deliveries + flow_pending_deliveries

    if @history_selected_date
      deliveries = deliveries.select do |delivery|
        delivery_event_time(delivery)&.to_date == @history_selected_date
      end
    end
    deliveries.sort_by! { |delivery| delivery_event_time(delivery) || Time.at(0) }
    deliveries.reverse!

    @history_sent_count = deliveries.count { |delivery| delivery.status.to_s == "sent" }

    grouped = deliveries.group_by { |delivery| delivery.recipient_email.to_s.strip.downcase }
    @history_groups = grouped.values.map do |items|
      sorted = items.sort_by { |delivery| delivery_event_time(delivery) || Time.at(0) }.reverse
      latest = sorted.first
      latest_status = history_delivery_status(latest)
      last_sent_delivery = sorted.find { |delivery| delivery.status.to_s == "sent" }
      last_sent_at = delivery_event_time(last_sent_delivery)
      sort_time = last_sent_at || delivery_event_time(latest)
      {
        recipient_email: latest&.recipient_email.to_s,
        last_sent_at: last_sent_at,
        sort_time: sort_time,
        status_label: latest_status[:label],
        status_class: latest_status[:css_class],
        smtp_source: latest&.smtp_source.to_s,
        deliveries: sorted
      }
    end

    @history_groups.sort_by! { |group| group[:sort_time] || Time.at(0) }
    @history_groups.reverse!
    paginate_history_groups!
    render :index_email
  end

  def destroy_history_delivery
    delivery = EmailDelivery.find_by(id: params[:id], project_id: @project.id)
    unless delivery
      redirect_to whatsapp_plugin_project_email_history_path(@project, history_redirect_params), alert: "Ejecucion no encontrada."
      return
    end

    delivery.destroy
    redirect_to whatsapp_plugin_project_email_history_path(@project, history_redirect_params), notice: "Ejecucion eliminada."
  rescue StandardError => e
    redirect_to whatsapp_plugin_project_email_history_path(@project, history_redirect_params), alert: "No se pudo eliminar: #{e.message}"
  end

  def destroy_history_pending
    run_id = params[:run_id].to_i
    node_id = params[:node_id].to_s.strip
    contact_id = params[:contact_id].to_i
    scheduled_at = parse_history_datetime(params[:scheduled_at])

    if run_id <= 0 || node_id.blank?
      redirect_to whatsapp_plugin_project_email_history_path(@project, history_redirect_params), alert: "Parametros invalidos para eliminar pendiente."
      return
    end

    destroyed_jobs = 0
    good_job_pending_scope.where("scheduled_at > ?", Time.current).find_each do |job|
      args = extract_flow_node_job_arguments(job.serialized_params)
      next unless args.is_a?(Array) && args.length >= 3
      next unless args[0].to_i == run_id
      next unless args[2].to_s == node_id
      if contact_id.positive?
        next unless args[1].to_i == contact_id
      end
      if scheduled_at
        next unless job.scheduled_at.present? && job.scheduled_at.to_i == scheduled_at.to_i
      end

      job.destroy
      destroyed_jobs += 1
    end

    cancelled_items = mark_pending_as_cancelled(run_id: run_id, node_id: node_id, contact_id: contact_id)
    redirect_to whatsapp_plugin_project_email_history_path(@project, history_redirect_params),
                notice: "Pendiente eliminado. Jobs cancelados: #{destroyed_jobs}. Items cancelados: #{cancelled_items}."
  rescue StandardError => e
    redirect_to whatsapp_plugin_project_email_history_path(@project, history_redirect_params), alert: "No se pudo eliminar pendiente: #{e.message}"
  end

  def destroy_history_bulk
    recipient_email = params[:recipient_email].to_s.strip.downcase
    if recipient_email.blank?
      redirect_to whatsapp_plugin_project_email_history_path(@project, history_redirect_params), alert: "Email invalido para eliminar historial."
      return
    end

    deleted_deliveries = 0
    EmailDelivery.where(project_id: @project.id)
                 .where("LOWER(TRIM(recipient_email)) = ?", recipient_email)
                 .find_each do |delivery|
      delivery.destroy
      deleted_deliveries += 1
    end

    contact_cache = {}
    run_cache = {}
    deleted_jobs = 0
    deleted_items = 0
    processed_keys = {}
    good_job_pending_scope.where("scheduled_at > ?", Time.current).find_each do |job|
      args = extract_flow_node_job_arguments(job.serialized_params)
      next unless args.is_a?(Array) && args.length >= 3

      run_id = args[0].to_i
      contact_id = args[1].to_i
      node_id = args[2].to_s
      next if run_id <= 0 || node_id.blank?

      job_email = ""
      if contact_id.positive?
        contact = contact_cache[contact_id]
        unless contact_cache.key?(contact_id)
          contact = WhatsappContactProfile.find_by(id: contact_id, project_id: @project.id)
          contact_cache[contact_id] = contact
        end
        job_email = contact&.email.to_s.strip
      end

      if job_email.blank?
        run = run_cache[run_id]
        unless run_cache.key?(run_id)
          run = FlowRun.find_by(id: run_id, project_id: @project.id)
          run_cache[run_id] = run
        end
        payload = run&.metadata.is_a?(Hash) ? run.metadata["payload"] : nil
        job_email = payload_email_value(payload)
      end

      next unless job_email.to_s.strip.downcase == recipient_email

      job.destroy
      key = [run_id, node_id.to_s, contact_id.to_i]
      unless processed_keys[key]
        deleted_items += mark_pending_as_cancelled(run_id: run_id, node_id: node_id, contact_id: contact_id)
        processed_keys[key] = true
      end
      deleted_jobs += 1
    end

    contact_ids = WhatsappContactProfile.where(project_id: @project.id)
                                        .where("LOWER(TRIM(email)) = ?", recipient_email)
                                        .pluck(:id)
    if contact_ids.any?
      FlowRunItem.joins(:flow_run)
                 .where(flow_runs: { project_id: @project.id }, status: "queued", contact_id: contact_ids)
                 .pluck(:flow_run_id, :node_id, :contact_id)
                 .uniq
                 .each do |run_id, node_id, contact_id|
        key = [run_id.to_i, node_id.to_s, contact_id.to_i]
        next if processed_keys[key]
        deleted_items += mark_pending_as_cancelled(run_id: run_id, node_id: node_id, contact_id: contact_id)
        processed_keys[key] = true
      end
    end

    # Also clear queued orphan items (contact_id=nil) by matching run payload email.
    run_items_without_contact = FlowRunItem.joins(:flow_run)
                                           .where(flow_runs: { project_id: @project.id }, status: "queued", contact_id: nil)
                                           .pluck(:flow_run_id, :node_id)
                                           .uniq
    run_payload_email_cache = {}
    run_items_without_contact.each do |run_id, node_id|
      run_id_i = run_id.to_i
      run_email = run_payload_email_cache[run_id_i]
      unless run_payload_email_cache.key?(run_id_i)
        run = run_cache[run_id_i]
        unless run_cache.key?(run_id_i)
          run = FlowRun.find_by(id: run_id_i, project_id: @project.id)
          run_cache[run_id_i] = run
        end
        payload = run&.metadata.is_a?(Hash) ? run.metadata["payload"] : nil
        run_email = payload_email_value(payload).to_s.strip.downcase
        run_payload_email_cache[run_id_i] = run_email
      end
      next unless run_email == recipient_email

      key = [run_id_i, node_id.to_s, 0]
      next if processed_keys[key]

      deleted_items += mark_pending_as_cancelled(run_id: run_id_i, node_id: node_id, contact_id: 0)
      processed_keys[key] = true
    end

    redirect_to whatsapp_plugin_project_email_history_path(@project, history_redirect_params),
                notice: "Historial eliminado para #{recipient_email}. Envios borrados: #{deleted_deliveries}. Pendientes cancelados: #{deleted_jobs + deleted_items}."
  rescue StandardError => e
    redirect_to whatsapp_plugin_project_email_history_path(@project, history_redirect_params), alert: "No se pudo eliminar historial: #{e.message}"
  end

  def recent_deliveries
    deliveries = EmailDelivery.where(project: @project).order(created_at: :desc).limit(10)
    render json: deliveries.map { |delivery|
      recent_delivery_payload(delivery)
    }
  end

  def flows
    @flows = FlowDefinition.where(project: @project).order(updated_at: :desc)
    @flow = @flows.first || FlowDefinition.new(project: @project)
    @crm_contacts = WhatsappContactProfile.active.where(project_id: @project.id).order(:first_name, :last_name).map do |contact|
      {
        id: contact.id,
        name: [contact.first_name, contact.last_name].map(&:to_s).join(" ").strip,
        email: contact.email.to_s,
        phone: contact.phone.to_s,
        chat_id: contact.chat_id
      }
    end
    base_tags = WhatsappContactTag.map_for_project(@project)
    names_from_contacts = WhatsappContactProfile.where(project_id: @project.id).pluck(:tags)
    names = names_from_contacts.flatten.compact.map { |tag| tag.to_s.strip }.reject(&:blank?)
    known = base_tags.each_with_object({}) { |tag, acc| acc[tag[:name].to_s.downcase] = tag }
    names.each do |name|
      key = name.downcase
      next if known.key?(key)
      known[key] = { id: nil, name: name, color: "#1e88e5" }
    end
    @flow_tags = known.values.sort_by { |tag| tag[:name].to_s.downcase }
    render :index_email
  end

  def flows_history
    render :index_email
  end

  def flow_history_data
    run_id = params[:run_id].to_s.presence
    if run_id.present?
      run = FlowRun.includes(:flow_definition, :started_by).find_by(id: run_id, project_id: @project.id)
      unless run
        render json: { ok: false, error: "Ejecucion no encontrada." }, status: :not_found
        return
      end

      items = FlowRunItem.where(flow_run_id: run.id).order(created_at: :asc).limit(1000)
      render json: {
        ok: true,
        execution: flow_run_payload(run),
        items: items.map { |item| flow_run_item_payload(item) }
      }
      return
    end

    runs = FlowRun.includes(:flow_definition, :started_by)
                  .where(project_id: @project.id)
                  .order(created_at: :desc)
                  .limit(200)

    render json: {
      ok: true,
      executions: runs.map { |run| flow_run_payload(run) }
    }
  end

  def flow_data
    flow = if params[:flow_id].present?
             FlowDefinition.find_by(id: params[:flow_id], project: @project)
           else
             FlowDefinition.where(project: @project).order(updated_at: :desc).first
           end
    flow ||= FlowDefinition.new(project: @project)
    endpoints = flow.persisted? ? FlowWebhookEndpoint.where(flow_definition: flow).order(created_at: :asc) : FlowWebhookEndpoint.none
    node_histories = flow.persisted? ? build_node_histories(flow) : {}
    node_progress = flow.persisted? ? build_node_progress(flow) : {}
    begin
      nodes = (flow.definition_json || {})["nodes"] || []
      whatsapp_nodes = nodes.select { |node| node.is_a?(Hash) && node["type"].to_s == "whatsapp" }.map { |node| node["id"].to_s }
      Rails.logger.info("[Flows] flow_data flow_id=#{flow.id} whatsapp_nodes=#{whatsapp_nodes.inspect} node_histories_keys=#{node_histories.keys.inspect}")
    rescue StandardError => error
      Rails.logger.warn("[Flows] flow_data log failed: #{error.message}")
    end
    render json: {
      id: flow.id,
      name: flow.name.to_s.presence || "Flujo principal",
      status: flow.status.to_s.presence || "draft",
      definition: flow.definition_json || {},
      webhook_endpoints: build_webhook_endpoints_payload(flow, endpoints),
      node_histories: node_histories,
      node_progress: node_progress
    }
  end

  def save_flow
    flow = if params[:flow_id].present?
             FlowDefinition.find_by(id: params[:flow_id], project: @project)
           else
             FlowDefinition.new(project: @project)
           end
    flow ||= FlowDefinition.new(project: @project)
    flow.name = params[:name].to_s.presence || "Flujo"
    flow.status = params[:status].to_s.presence || "draft"
    definition = params[:definition].is_a?(ActionController::Parameters) ? params[:definition].to_unsafe_h : params[:definition]
    flow.definition_json = definition
    log_macro_toggle_state(flow, definition)
    if flow.save
      begin
        definition = flow.definition_json || {}
        nodes = definition.is_a?(Hash) ? (definition["nodes"] || []) : []
        nodes.each do |node|
          next unless node.is_a?(Hash)
          next unless node["type"].to_s == "transform_json"
          mappings = node.dig("data", "mappings")
          Rails.logger.info("[CRM] flow_save transform_json node_id=#{node['id']} mappings=#{mappings.inspect}")
        end
      rescue StandardError => error
        Rails.logger.warn("[CRM] flow_save mapping log failed: #{error.message}")
      end
      sync_webhook_endpoints(flow)
      begin
        reschedule_queued_delay_jobs(flow, flow.definition_json)
      rescue StandardError => error
        Rails.logger.warn("[Flows] reschedule delay jobs failed: #{error.message}")
      end
      render json: {
        ok: true,
        id: flow.id,
        name: flow.name,
        webhook_endpoints: build_webhook_endpoints_payload(flow),
        definition: flow.definition_json,
        node_histories: build_node_histories(flow),
        node_progress: build_node_progress(flow)
      }
    else
      render json: { ok: false, errors: flow.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def run_flow
    flow = if params[:flow_id].present?
             FlowDefinition.find_by(id: params[:flow_id], project: @project)
           else
             FlowDefinition.where(project: @project).order(updated_at: :desc).first
           end
    unless flow
      render json: { ok: false, error: "No hay flujo guardado." }, status: :unprocessable_entity
      return
    end

    options = {}
    payload = {
      "first_name" => params[:first_name].to_s,
      "email" => params[:email].to_s,
      "phone" => params[:phone].to_s,
      "chat_id" => params[:chat_id].to_s
    }
    if params[:macro_node_id].present?
      macro_node_id = params[:macro_node_id].to_s
      unless flow_definition_has_node?(flow, macro_node_id)
        render json: { ok: false, error: "Nodo macro no encontrado." }, status: :unprocessable_entity
        return
      end
      options[:start_node_id] = macro_node_id
      options[:source] = "macro"
    end

    if params[:chat_id].present?
      chat = WhatsappChat.find_by(id: params[:chat_id], project: @project)
      profile = chat&.contact_profile
      if profile.nil? && chat&.external_id.present?
        profile = WhatsappContactProfile.find_by(project: @project, external_id: chat.external_id)
      end
      if profile.nil? && chat
        profile = WhatsappContactProfile.new(project: @project)
        profile.chat = chat
        profile.external_id = chat.external_id if chat.external_id.present?
        profile.first_name = payload["first_name"].to_s.presence || chat.title.to_s
        profile.email = payload["email"].to_s.presence
        profile.phone = payload["phone"].to_s.presence
        profile.save
      end
      unless profile&.persisted?
        render json: { ok: false, error: "Contacto no encontrado para este chat." }, status: :unprocessable_entity
        return
      end
      options[:contact_ids] = [profile.id]
      options[:restrict_to_ids] = true
      payload["first_name"] = profile.first_name.to_s if payload["first_name"].blank?
      payload["email"] = profile.email.to_s if payload["email"].blank?
      if payload["phone"].blank?
        payload["phone"] = chat&.external_id.to_s.presence ||
                           profile.external_id.to_s.presence ||
                           profile.phone.to_s
      end
    end
    options[:payload] = payload
    Rails.logger.info("[Flows] macro run payload flow_id=#{flow.id} node_id=#{options[:start_node_id]} chat_id=#{params[:chat_id].to_s} payload_keys=#{payload.keys.join(',')}")

    dedupe_key = [
      "macro_run",
      @project.id,
      flow.id,
      params[:chat_id].to_s,
      options[:start_node_id].to_s,
      User.current.id
    ].join(":")
    if Rails.cache.exist?(dedupe_key)
      Rails.logger.info("[Flows] macro run deduped key=#{dedupe_key}")
      render json: { ok: true, deduped: true }
      return
    end
    Rails.cache.write(dedupe_key, true, expires_in: 2.seconds)

    FlowRunnerJob.perform_later(flow.id, @project.id, User.current.id, options)
    render json: { ok: true }
  end

  def flow_list
    flows = FlowDefinition.where(project: @project).order(updated_at: :desc)
    Rails.logger.info(
      "[Flows] flow_list request project_id=#{@project.id} macros_only=#{params[:macros_only].inspect} total_flows=#{flows.size}"
    )
    ia_only = params[:ia_only].to_s == "true" || params[:ia_only].to_s == "1"
    if ia_only
      payload = flows.map do |flow|
        ia_node = ia_node_for_flow(flow)
        next unless ia_node
        {
          id: flow.id,
          name: flow.name.to_s,
          ia_node_id: (ia_node["id"] || ia_node[:id]).to_s
        }
      end.compact
      Rails.logger.info("[Flows] ia list response project_id=#{@project.id} count=#{payload.size}")
      render json: { flows: payload }
      return
    end
    macros_only = params[:macros_only].to_s == "true" || params[:macros_only].to_s == "1"
    if macros_only
      payload = flows.map do |flow|
        macro_node = macro_node_for_flow(flow)
        Rails.logger.info(
          "[Flows] macros list flow_id=#{flow.id} name=#{flow.name.inspect} macro_node=#{macro_node ? (macro_node['id'] || macro_node[:id]).to_s : 'none'}"
        )
        next unless macro_node
        {
          id: flow.id,
          name: flow.name.to_s,
          status: flow.status.to_s,
          macro_node_id: (macro_node["id"] || macro_node[:id]).to_s
        }
      end.compact
      Rails.logger.info("[Flows] macros list response project_id=#{@project.id} count=#{payload.size}")
      render json: { flows: payload }
      return
    end

    payload = flows.map { |flow| { id: flow.id, name: flow.name.to_s, status: flow.status.to_s } }
    Rails.logger.info("[Flows] flow_list response project_id=#{@project.id} count=#{payload.size}")
    render json: { flows: payload }
  end

  def ia_agents
    server_url = params[:server_url].to_s.strip
    username = params[:username].to_s.strip
    password = params[:password].to_s
    Rails.logger.info("[Flows][IA] ia_agents request url=#{server_url} user=#{username} pass_present=#{password.present?}")
    if server_url.blank? || username.blank? || password.blank?
      render json: { agents: [], error: "Credenciales incompletas" }, status: :ok
      return
    end

    base = server_url.chomp("/")
    uri = URI("#{base}/info")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    http.open_timeout = 5
    http.read_timeout = 15

    request = Net::HTTP::Get.new(uri.request_uri, { "Accept" => "application/json" })
    request.basic_auth(username, password)
    response = http.request(request)
    Rails.logger.info("[Flows][IA] ia_agents response http=#{response.code} url=#{base}")
    unless response.code.to_i == 200
      render json: { agents: [], error: "HTTP #{response.code}" }, status: :ok
      return
    end

    payload = JSON.parse(response.body) rescue {}
    agents = payload.is_a?(Hash) ? payload["agents"] : []
    Rails.logger.info("[Flows][IA] ia_agents parsed count=#{agents.is_a?(Array) ? agents.length : 0}")
    render json: { agents: agents || [] }, status: :ok
  rescue StandardError => e
    Rails.logger.error("[Flows][IA] ia_agents error #{e.class}: #{e.message}")
    render json: { agents: [], error: e.message }, status: :ok
  end

  def delete_flow
    flow = FlowDefinition.find_by(id: params[:flow_id], project: @project)
    unless flow
      render json: { ok: false, error: "Flujo no encontrado." }, status: :not_found
      return
    end
    flow.destroy
    render json: { ok: true }
  end

  def clear_flow_events
    flow = FlowDefinition.find_by(id: params[:flow_id], project: @project)
    unless flow
      render json: { ok: false, error: "Flujo no encontrado." }, status: :not_found
      return
    end
    node_id = params[:node_id].to_s.presence
    kind = params[:kind].to_s
    if node_id.present?
      if kind != "webhook"
        FlowRunItem.joins(:flow_run)
                   .where(flow_runs: { flow_definition_id: flow.id }, node_id: node_id)
                   .delete_all
      end
      if kind != "transform_json"
        FlowWebhookEvent.left_joins(:flow_webhook_endpoint)
                        .where(flow_definition_id: flow.id)
                        .where("flow_webhook_endpoints.node_id = ? OR flow_webhook_events.flow_webhook_endpoint_id IS NULL", node_id)
                        .delete_all
      end
    else
      FlowRunItem.joins(:flow_run).where(flow_runs: { flow_definition_id: flow.id }).delete_all
      FlowWebhookEvent.joins(:flow_webhook_endpoint)
                      .where(flow_webhook_endpoints: { flow_definition_id: flow.id })
                      .delete_all
    end
    render json: { ok: true }
  end

  def webhook_flow
    endpoint = FlowWebhookEndpoint.find_by(token: params[:token].to_s)
    unless endpoint
      Rails.logger.warn("[FlowsWebhook] invalid token=#{params[:token].to_s}")
      render json: { ok: false, error: "Webhook invalido." }, status: :not_found
      return
    end
    flow = endpoint.flow_definition
    project = flow.project
    if params[:project_id].present? && params[:project_id].to_s != project.identifier.to_s && params[:project_id].to_s != project.id.to_s
      Rails.logger.warn("[FlowsWebhook] project mismatch token=#{endpoint.token} param_project=#{params[:project_id]} flow_project=#{project.identifier}")
      render json: { ok: false, error: "Proyecto no encontrado." }, status: :not_found
      return
    end

    payload = parse_webhook_payload
    headers = extract_webhook_headers
    payload_fingerprint = webhook_payload_fingerprint(payload)
    dedupe_key = [
      "flows_webhook",
      endpoint.id,
      payload_fingerprint
    ].join(":")
    if Rails.cache.exist?(dedupe_key)
      Rails.logger.info(
        "[FlowsWebhook] deduped token=#{endpoint.token} flow_id=#{flow.id} fingerprint=#{payload_fingerprint}"
      )
      render json: { ok: true, status: "deduped" }
      return
    end
    Rails.cache.write(dedupe_key, true, expires_in: 20.seconds)

    Rails.logger.info("[FlowsWebhook] received token=#{endpoint.token} project=#{project.identifier} payload_keys=#{payload.is_a?(Hash) ? payload.keys : payload.class}")
    event = FlowWebhookEvent.create!(
      flow_definition: flow,
      project: project,
      flow_webhook_endpoint: endpoint,
      payload_json: payload,
      headers_json: headers,
      status: "received",
      received_at: Time.current
    )

    contacts = find_contacts_from_payload(project, payload, endpoint.mapping)
    start_node_id = find_start_node_id_for(flow, endpoint.node_id)
    if start_node_id.blank?
      Rails.logger.warn("[FlowsWebhook] missing start node token=#{endpoint.token} flow_id=#{flow.id}")
      event.update(status: "failed", error_message: "No hay nodo de inicio.")
      render json: { ok: false, error: "No hay nodo de inicio." }, status: :unprocessable_entity
      return
    end

    FlowRunnerJob.perform_later(
      flow.id,
      project.id,
      nil,
      {
        contact_ids: contacts.map(&:id),
        start_node_id: start_node_id,
        source: "webhook",
        webhook_event_id: event.id,
        payload: payload,
        allow_without_contact: true,
        restrict_to_ids: true
      }
    )

    response_status = contacts.any? ? "queued" : "no_contact"
    Rails.logger.info("[FlowsWebhook] queued token=#{endpoint.token} flow_id=#{flow.id} status=#{response_status} contacts=#{contacts.size}")
    event.update(status: response_status)
    render json: { ok: true, status: response_status }
  rescue StandardError => error
    Rails.logger.error("[FlowsWebhook] error token=#{params[:token]} message=#{error.message}")
    event&.update(status: "failed", error_message: error.message)
    render json: { ok: false, error: error.message }, status: :unprocessable_entity
  end

  def webhook_payload_fingerprint(payload)
    normalized = normalize_webhook_payload(payload)
    Digest::SHA256.hexdigest(normalized.to_json)
  rescue StandardError
    Digest::SHA256.hexdigest(payload.to_s)
  end

  def normalize_webhook_payload(payload)
    case payload
    when Hash
      payload.keys.map(&:to_s).sort.each_with_object({}) do |key, memo|
        value = payload[key]
        value = payload[key.to_sym] if value.nil? && payload.key?(key.to_sym)
        memo[key] = normalize_webhook_payload(value)
      end
    when Array
      payload.map { |value| normalize_webhook_payload(value) }
    else
      payload
    end
  end

  private

  def set_active_tab
    @active_tab =
      case action_name
      when "settings", "update_settings"
        "settings"
      when "templates", "new_template", "create_template", "edit_template", "update_template", "destroy_template", "destroy_template_attachment"
        "templates"
      when "history", "destroy_history_delivery", "destroy_history_pending", "destroy_history_bulk"
        "history"
      when "flows", "flow_data", "save_flow", "run_flow", "flow_list", "delete_flow"
        "flows"
      when "flows_history", "flow_history_data"
        "flows_history"
      else
        "send"
      end
  end

  def authorize_macro_list!
    if User.current.respond_to?(:allowed_to?)
      return if User.current.allowed_to?(:view_email, @project)
      return if User.current.allowed_to?(:view_whatsapp, @project)
    else
      return
    end

    render json: { ok: false, error: "No autorizado." }, status: :forbidden
  end

  def flow_definition_has_node?(flow, node_id)
    definition = flow.definition_json
    if definition.is_a?(String)
      begin
        definition = JSON.parse(definition)
      rescue StandardError
        definition = {}
      end
    end
    nodes = extract_flow_nodes(definition)
    Array(nodes).any? do |node|
      next false unless node.is_a?(Hash)
      (node["id"] || node[:id]).to_s == node_id.to_s
    end
  end

  def macro_node_for_flow(flow)
    definition = flow.definition_json
    if definition.is_a?(String)
      begin
        definition = JSON.parse(definition)
      rescue StandardError
        definition = {}
      end
    end
    nodes = extract_flow_nodes(definition)
    Array(nodes).find do |node|
      next false unless node.is_a?(Hash)
      node_type = (node["type"] || node[:type]).to_s
      next false unless node_type == "macro"
      raw_data = node["data"] || node[:data] || node["properties"] || node[:properties]
      data = normalize_flow_node_data(raw_data)
      data_props = (data["properties"] || data[:properties]).is_a?(Hash) ? (data["properties"] || data[:properties]) : {}
      show_in_chat = data["show_in_chat"] || data[:show_in_chat] || data["showInChat"] || data[:showInChat] ||
        data_props["show_in_chat"] || data_props[:show_in_chat] || data_props["showInChat"] || data_props[:showInChat] ||
        node["show_in_chat"] || node[:show_in_chat] || node["showInChat"] || node[:showInChat]
      truthy?(show_in_chat)
    end
  end

  def ia_node_for_flow(flow)
    definition = flow.definition_json
    if definition.is_a?(String)
      begin
        definition = JSON.parse(definition)
      rescue StandardError
        definition = {}
      end
    end
    nodes = extract_flow_nodes(definition)
    Array(nodes).find do |node|
      next false unless node.is_a?(Hash)
      node_type = (node["type"] || node[:type]).to_s
      next false unless node_type == "conversation_ai"
      raw_data = node["data"] || node[:data] || node["properties"] || node[:properties]
      data = normalize_flow_node_data(raw_data)
      data_props = (data["properties"] || data[:properties]).is_a?(Hash) ? (data["properties"] || data[:properties]) : {}
      show_in_chat = data["show_ai_in_chat"] || data[:show_ai_in_chat] ||
        data_props["show_ai_in_chat"] || data_props[:show_ai_in_chat] ||
        node["show_ai_in_chat"] || node[:show_ai_in_chat]
      truthy?(show_in_chat)
    end
  end

  def extract_flow_nodes(definition)
    return definition if definition.is_a?(Array)
    return [] unless definition.is_a?(Hash)
    if definition["definition"].is_a?(Hash) || definition[:definition].is_a?(Hash)
      definition = definition["definition"] || definition[:definition]
    end
    nodes = definition["nodes"] || definition[:nodes] || []
    if nodes.is_a?(String)
      begin
        parsed = JSON.parse(nodes)
        return parsed if parsed.is_a?(Array)
      rescue StandardError
        return []
      end
    end
    nodes
  end

  def log_macro_toggle_state(flow, definition)
    nodes = extract_flow_nodes(definition.is_a?(Hash) ? definition : {})
    return if nodes.empty?
    nodes.each do |node|
      next unless node.is_a?(Hash)
      node_type = (node["type"] || node[:type]).to_s
      next unless node_type == "macro"
      raw_data = node["data"] || node[:data]
      data = normalize_flow_node_data(raw_data)
      show_in_chat = data["show_in_chat"] || data[:show_in_chat]
      Rails.logger.info(
        "[Flows] macro toggle flow_id=#{flow.id || 'new'} node_id=#{node['id'] || node[:id]} show_in_chat=#{show_in_chat.inspect}"
      )
    end
  end

  def normalize_flow_node_data(raw_data)
    return {} if raw_data.nil?
    return raw_data if raw_data.is_a?(Hash)
    if raw_data.is_a?(String)
      begin
        parsed = JSON.parse(raw_data)
        return parsed if parsed.is_a?(Hash)
      rescue StandardError
        return {}
      end
    end
    {}
  end

  def truthy?(value)
    return true if value == true
    return false if value == false || value.nil?
    value.to_s.strip.downcase.in?(%w[1 true on yes])
  end

  def reschedule_queued_delay_jobs(flow, definition)
    nodes = extract_flow_nodes(definition.is_a?(Hash) ? definition : {})
    delay_nodes = nodes.select do |node|
      node.is_a?(Hash) &&
        node["type"].to_s == "delay" &&
        truthy?(node.dig("data", "night_convert"))
    end
    return if delay_nodes.empty?

    settings = {}
    delay_nodes.each do |node|
      node_id = node["id"].to_s
      settings[node_id] = {
        start: node.dig("data", "night_start").to_s.presence || "22:00",
        end: node.dig("data", "night_end").to_s.presence || "06:00"
      }
    end

    FlowRunItem.joins(:flow_run)
               .where(flow_runs: { flow_definition_id: flow.id })
               .where(node_id: settings.keys)
               .find_each do |item|
      meta = item.result_meta.is_a?(Hash) ? item.result_meta : {}
      next if meta["night_adjusted"] == true
      delay_str = meta["delay_until"].to_s
      next if delay_str.blank?
      old_time = begin
        Time.zone.parse(delay_str)
      rescue StandardError
        nil
      end
      next unless old_time
      next if old_time <= Time.current

      window = settings[item.node_id.to_s]
      new_time, adjusted = apply_night_adjustment(old_time, window[:start], window[:end])
      next unless adjusted

      updated = reschedule_flow_run_jobs(item.flow_run_id, old_time, new_time)
      next if updated.zero?

      meta["delay_until"] = new_time.iso8601
      meta["night_adjusted"] = true
      meta["night_adjust_hours"] = 12
      meta["night_window"] = "#{window[:start]}-#{window[:end]}"
      item.update_columns(result_meta: meta)
    end
  end

  def reschedule_flow_run_jobs(flow_run_id, old_time, new_time)
    return 0 unless defined?(GoodJob::Job)
    updated = 0
    scope = GoodJob::Job.where(job_class: "FlowNodeJob", finished_at: nil)
    scope = scope.where(discarded_at: nil) if good_job_has_column?(:discarded_at)
    scope
                .where.not(scheduled_at: nil)
                .find_each do |job|
      next unless job.scheduled_at.to_i == old_time.to_i
      params = job.serialized_params.is_a?(Hash) ? job.serialized_params : {}
      args = params["arguments"]
      next unless args.is_a?(Array) && args[0].to_s == flow_run_id.to_s
      job.update_columns(scheduled_at: new_time)
      updated += 1
    end
    updated
  end

  def apply_night_adjustment(time, start_value, end_value)
    start_minutes = parse_time_minutes(start_value)
    end_minutes = parse_time_minutes(end_value)
    return [time, false] unless start_minutes && end_minutes

    current_minutes = time.hour * 60 + time.min
    in_window =
      if start_minutes <= end_minutes
        current_minutes >= start_minutes && current_minutes <= end_minutes
      else
        current_minutes >= start_minutes || current_minutes <= end_minutes
      end
    return [time, false] unless in_window
    [time + 12.hours, true]
  end

  def parse_time_minutes(value)
    return nil if value.nil?
    text = value.to_s.strip
    return nil if text.empty?
    parts = text.split(":")
    return nil if parts.length < 2
    hour = parts[0].to_i
    minute = parts[1].to_i
    return nil if hour.negative? || hour > 23
    return nil if minute.negative? || minute > 59
    (hour * 60) + minute
  end

  def parse_webhook_payload
    raw = request.raw_post.to_s
    return {} if raw.blank?
    JSON.parse(raw)
  rescue StandardError
    { "_raw" => raw }
  end

  def extract_webhook_headers
    request.headers.to_h.select do |key, _|
      key.start_with?("HTTP_") || key == "CONTENT_TYPE" || key == "CONTENT_LENGTH"
    end
  end

  def find_contacts_from_payload(project, payload, flow = nil)
    scope = WhatsappContactProfile.where(project_id: project.id)
    mapping = default_webhook_mapping.merge(flow.is_a?(Hash) ? flow : {})
    id_key = mapping["contact_id_key"].presence || "contact_id"
    email_key = mapping["email_key"].presence || "email"
    phone_key = mapping["phone_key"].presence || "phone"

    ids = Array(fetch_payload_value(payload, id_key) || payload["contact_ids"]).compact.map(&:to_i).reject(&:zero?)
    return scope.where(id: ids) if ids.any?

    email = fetch_payload_value(payload, email_key).to_s.presence || payload.dig("contact", "email").to_s.presence
    phone = fetch_payload_value(payload, phone_key).to_s.presence || payload["phone_number"].to_s.presence || payload.dig("contact", "phone").to_s.presence
    contacts = []
    contacts += scope.where(email: email) if email.present?
    contacts += scope.where(phone: phone) if phone.present?
    contacts.uniq
  end

  def fetch_payload_value(payload, path)
    return if payload.blank? || path.blank?
    return payload[path] if payload.key?(path)
    keys = path.to_s.split(".").map(&:strip).reject(&:blank?)
    return if keys.empty?
    keys.reduce(payload) do |memo, key|
      break if memo.nil?
      memo.is_a?(Hash) ? memo[key] : nil
    end
  end

  def find_start_node_id_for(flow, preferred_node_id = nil)
    definition = flow.definition_json || {}
    nodes = definition["nodes"] || []
    if preferred_node_id.present? && nodes.any? { |node| node["id"] == preferred_node_id }
      return preferred_node_id
    end
    webhook_node = nodes.find { |node| node["type"] == "webhook_input" }
    webhook_node ? webhook_node["id"] : nodes.find { |node| node["type"] == "start" }&.dig("id")
  end

  def sync_webhook_endpoints(flow)
    definition = flow.definition_json || {}
    nodes = definition["nodes"].is_a?(Array) ? definition["nodes"] : []
    used_endpoint_ids = []

    nodes.each do |node|
      next unless node["type"] == "webhook_input"
      node["data"] ||= {}
      mapping = node.dig("data", "webhook_mapping") || default_webhook_mapping
      endpoint_id = node.dig("data", "endpoint_id")
      endpoint = endpoint_id.present? ? flow.flow_webhook_endpoints.find_by(id: endpoint_id) : nil
      endpoint ||= flow.flow_webhook_endpoints.find_or_initialize_by(node_id: node["id"])
      if endpoint.new_record? && flow.webhook_token.present? && flow.flow_webhook_endpoints.where.not(id: endpoint.id).empty?
        endpoint.token = flow.webhook_token
      end
      endpoint.node_id = node["id"]
      endpoint.mapping_json = mapping
      endpoint.save!
      node["data"]["webhook_mapping"] = mapping
      node["data"]["endpoint_id"] = endpoint.id
      used_endpoint_ids << endpoint.id
    end

    flow.flow_webhook_endpoints.where.not(id: used_endpoint_ids).destroy_all
    flow.definition_json = definition
    flow.save! if flow.changed?
  end

  def build_webhook_endpoints_payload(flow, endpoints = nil)
    list = endpoints || flow.flow_webhook_endpoints
    list.each_with_object({}) do |endpoint, acc|
      url = request.base_url + whatsapp_plugin_project_email_flows_webhook_path(flow.project, token: endpoint.token)
      events = FlowWebhookEvent.where(flow_webhook_endpoint: endpoint).order(received_at: :desc).limit(20)
      acc[endpoint.id] = {
        id: endpoint.id,
        node_id: endpoint.node_id,
        url: url,
        mapping: endpoint.mapping,
        events: events.map do |event|
          {
            id: event.id,
            received_at: event.received_at,
            status: event.status.to_s,
            error: event.error_message.to_s,
            payload_preview: event.payload_json.to_s[0, 200],
            payload: event.payload_json
          }
        end
      }
    end
  end

  def build_node_histories(flow)
    run_ids = FlowRun.where(flow_definition_id: flow.id).order(created_at: :desc).limit(200).pluck(:id)
    items = if run_ids.any?
              FlowRunItem.where(flow_run_id: run_ids).order(created_at: :desc).limit(600)
            else
              FlowRunItem.joins(:flow_run).where(flow_runs: { flow_definition_id: flow.id })
                        .order(created_at: :desc).limit(600)
            end
    grouped = {}
    items.each do |item|
      grouped[item.node_id] ||= []
      next if grouped[item.node_id].length >= 30
      grouped[item.node_id] << {
        id: item.id,
        status: item.status.to_s,
        result_path: item.result_path.to_s,
        finished_at: item.finished_at,
        created_at: item.created_at,
        error: item.error_message.to_s,
        contact_id: item.contact_id,
        meta: item.result_meta || {}
      }
    end
    begin
      delay_keys = grouped.keys.select { |key| key.to_s.start_with?("delay_") }
      whatsapp_keys = grouped.keys.select { |key| key.to_s.start_with?("whatsapp_") }
      Rails.logger.info(
        "[Flows] node_histories flow_id=#{flow.id} total_keys=#{grouped.keys.length} delay_keys=#{delay_keys.inspect} delay_counts=#{delay_keys.map { |k| [k, grouped[k].length] }.to_h} whatsapp_keys=#{whatsapp_keys.inspect} whatsapp_counts=#{whatsapp_keys.map { |k| [k, grouped[k].length] }.to_h}"
      )
    rescue StandardError => error
      Rails.logger.warn("[Flows] node_histories log failed: #{error.message}")
    end
    grouped
  end

  def build_node_progress(flow)
    run = FlowRun.where(flow_definition: flow).order(created_at: :desc).first
    return {} unless run
    meta = run.metadata.is_a?(Hash) ? run.metadata : {}
    total = meta["total_contacts"].to_i
    return {} if total <= 0
    counters = meta["node_counters"].is_a?(Hash) ? meta["node_counters"] : {}
    nodes = (flow.definition_json || {})["nodes"] || []
    whatsapp_nodes = nodes.select { |node| node["type"].to_s == "whatsapp" }.map { |node| node["id"].to_s }
    progress = {}
    whatsapp_nodes.each do |node_id|
      progress[node_id] = {
        current: counters[node_id].to_i,
        total: total,
        run_id: run.id
      }
    end
    progress
  end

  def flow_run_payload(run)
    counters = FlowRunItem.where(flow_run_id: run.id).group(:status).count
    total = counters.values.sum
    {
      id: run.id,
      flow_id: run.flow_definition_id,
      flow_name: run.flow_definition&.name.to_s.presence || "Flujo #{run.flow_definition_id}",
      status: run.status.to_s,
      started_at: run.started_at,
      finished_at: run.finished_at,
      created_at: run.created_at,
      started_by: run.started_by&.name.to_s,
      total: total,
      queued: counters["queued"].to_i,
      running: counters["running"].to_i,
      finished: counters["finished"].to_i,
      failed: counters["failed"].to_i,
      skipped: counters["skipped"].to_i,
      metadata: run.metadata || {}
    }
  end

  def flow_run_item_payload(item)
    {
      id: item.id,
      node_id: item.node_id.to_s,
      status: item.status.to_s,
      contact_id: item.contact_id,
      result_path: item.result_path.to_s,
      result_meta: item.result_meta || {},
      error: item.error_message.to_s,
      started_at: item.started_at,
      finished_at: item.finished_at,
      created_at: item.created_at
    }
  end

  def default_webhook_mapping
    {
      "contact_id_key" => "contact_id",
      "email_key" => "email",
      "phone_key" => "phone"
    }
  end

  def load_settings
    @settings = EmailProjectSetting.find_or_initialize_by(project: @project)
    @sender_names = @settings.sender_name_list
  end

  def load_templates
    @templates = EmailTemplate.where(project: @project, active: true).order(:name)
  end

  def load_whatsapp_templates
    @whatsapp_templates = WhatsappTemplate.where(project: @project, active: true).order(updated_at: :desc, name: :asc)
  end

  def load_template
    @template = EmailTemplate.where(project: @project).find(params[:id])
  end

  def load_template_attachment
    @template_attachment =
      EmailTemplateAttachment
        .joins(:email_template)
        .where(email_templates: { project_id: @project.id })
        .find(params[:id])
  end

  def load_send_context
    @members = @project.users.active.order(:lastname, :firstname)
    @recent_deliveries = EmailDelivery.where(project: @project).order(created_at: :desc).limit(10)
  end

  def load_contact_fields
    @contact_fields = WhatsappContactField.where(project: @project, active: true).order(:position, :name)
  end

  def settings_params
    params.require(:email_project_setting).permit(
      :enabled,
      :use_plugin_smtp,
      :smtp_address,
      :smtp_port,
      :smtp_domain,
      :smtp_user_name,
      :smtp_password,
      :smtp_authentication,
      :smtp_enable_starttls_auto,
      :smtp_ssl,
      :smtp_openssl_verify_mode,
      :smtp_timeout,
      :smtp3_address,
      :smtp3_port,
      :smtp3_domain,
      :smtp3_user_name,
      :smtp3_password,
      :smtp3_authentication,
      :smtp3_enable_starttls_auto,
      :smtp3_ssl,
      :smtp3_openssl_verify_mode,
      :smtp3_timeout,
      :smtp3_mail_from,
      :smtp3_reply_to,
      :smtp4_address,
      :smtp4_port,
      :smtp4_domain,
      :smtp4_user_name,
      :smtp4_password,
      :smtp4_authentication,
      :smtp4_enable_starttls_auto,
      :smtp4_ssl,
      :smtp4_openssl_verify_mode,
      :smtp4_timeout,
      :smtp4_mail_from,
      :smtp4_reply_to,
      :mail_from,
      :reply_to,
      :signature,
      :sender_names,
      :use_layout_default,
      :use_layout_plugin,
      :throttle_per_minute,
      :global_rate_limit_enabled,
      :global_rate_limit_count,
      :global_rate_limit_period_value,
      :global_rate_limit_period_unit
    )
  end

  def template_params
    permitted = params.require(:email_template).permit(
      :name,
      :subject,
      :body,
      :body_html,
      :editor_mode,
      :active,
      :open_tracking_enabled,
      :smtp_source,
      :sender_name,
      attachments: []
    )
    permitted[:smtp_source] = normalize_smtp_source(permitted[:smtp_source])
    permitted
  end

  def email_params
    permitted = params.fetch(:email, {}).permit(
      :template_id,
      :sender_name,
      :smtp_source,
      :scheduled_at,
      :subject,
      :body,
      :emails,
      :send_to_self,
      :send_to_self_recipients,
      :open_tracking_enabled,
      :bypass_rate_limit,
      attachments: [],
      user_ids: []
    )
    permitted[:smtp_source] = normalize_smtp_source(permitted[:smtp_source])
    permitted
  end

  def find_template_for_preview
    template_id = email_params[:template_id].to_s
    return nil if template_id.blank?

    EmailTemplate.where(project: @project, active: true).find_by(id: template_id)
  end

  def build_recipients
    recipients = []
    user_ids = Array(email_params[:user_ids]).map(&:to_s).reject(&:blank?)
    if user_ids.any?
      @project.users.where(id: user_ids).find_each do |user|
        recipients << { user: user, email: user.mail }
      end
    end

    raw_emails = email_params[:emails].to_s
    raw_emails.split(/[,\s;]/).map(&:strip).reject(&:blank?).each do |email|
      recipients << { user: nil, email: email }
    end

    if email_params[:send_to_self].to_s == "1" || email_params[:send_to_self_recipients].to_s == "1"
      recipients << { user: User.current, email: User.current.mail }
    end

    recipients.uniq { |entry| entry[:email].to_s.downcase }
  end

  def parse_scheduled_at
    raw = email_params[:scheduled_at].to_s.strip
    return nil if raw.blank?

    user_zone = User.current.respond_to?(:time_zone) ? User.current.time_zone : nil
    Time.use_zone(user_zone.presence || Time.zone) do
      Time.zone.parse(raw)
    end
  rescue StandardError
    nil
  end

  def recent_delivery_payload(delivery)
    {
      subject: delivery.subject.to_s,
      status: delivery.status.to_s,
      scheduled_at: delivery.scheduled_at&.iso8601,
      sent_at: delivery.sent_at&.iso8601,
      created_at: delivery.created_at&.iso8601,
      status_label: recent_delivery_status_label(delivery)
    }
  end

  def recent_delivery_status_label(delivery)
    status = delivery.status.to_s
    return "ENVIADO" if status == "sent"
    return "ERROR" if status == "failed"
    return "ENVIANDOSE" if status == "sending"

    "PENDIENTE"
  end

  def delivery_event_time(delivery)
    return nil unless delivery
    value = delivery.sent_at || delivery.created_at
    return nil unless value
    value.in_time_zone(history_time_zone)
  end

  def history_delivery_status(delivery)
    status = delivery&.status.to_s
    if status == "sent"
      { label: "Terminado", css_class: "is-sent" }
    elsif status == "failed"
      { label: "ERROR", css_class: "is-failed" }
    elsif status == "queued"
      { label: "Pendiente", css_class: "is-queued" }
    else
      { label: "En proceso", css_class: "is-sending" }
    end
  end

  def history_datetime_label(value)
    return "" if value.blank?

    local_value = value.in_time_zone(history_time_zone)
    "#{I18n.l(local_value.to_date, format: '%d-%B-%Y').upcase} (#{local_value.strftime('%H:%M:%S')})"
  end

  def pending_flow_deliveries
    run_cache = {}
    flow_cache = {}
    node_cache = {}
    edge_cache = {}
    contact_cache = {}
    template_cache = {}

    pending_jobs = good_job_pending_scope.where("scheduled_at > ?", Time.current).to_a
    planned_item_cache = {}

    from_jobs = pending_from_scheduled_jobs(
      jobs: pending_jobs,
      run_cache: run_cache,
      flow_cache: flow_cache,
      node_cache: node_cache,
      contact_cache: contact_cache,
      template_cache: template_cache,
      planned_item_cache: planned_item_cache
    )
    from_items = pending_from_materialized_items(
      run_cache: run_cache,
      flow_cache: flow_cache,
      node_cache: node_cache,
      contact_cache: contact_cache,
      template_cache: template_cache
    )

    from_projection = []
    pending_jobs.each do |job|
      args = extract_flow_node_job_arguments(job.serialized_params)
      next unless args.is_a?(Array) && args.length >= 3
      next unless pending_job_active_for_history?(args, planned_item_cache)

      run_id = args[0].to_i
      contact_id = args[1].to_i
      start_node_id = args[2].to_s
      next if run_id <= 0 || start_node_id.blank?
      next if materialized_run?(run_id, run_cache)

      projected = project_pending_deliveries(
        run_id: run_id,
        contact_id: contact_id,
        start_node_id: start_node_id,
        start_at: job.scheduled_at,
        run_cache: run_cache,
        flow_cache: flow_cache,
        node_cache: node_cache,
        edge_cache: edge_cache,
        contact_cache: contact_cache,
        template_cache: template_cache
      )
      if projected.present?
        Rails.logger.info(
          "[EmailHistory] projection run=#{run_id} contact=#{contact_id} start_node=#{start_node_id} " \
          "start_at=#{job.scheduled_at&.iso8601} projected=#{projected.size}"
        )
      end
      from_projection.concat(projected) if projected.present?
    end

    items = (from_items + from_jobs + from_projection).uniq { |item| pending_item_key(item) }
    items = dedupe_pending_items_by_run_and_node(items)
    items.sort_by! { |item| item.created_at || Time.at(0) }
    Rails.logger.info(
      "[EmailHistory] pending_flow_jobs items=#{from_items.size} jobs=#{from_jobs.size} projected=#{from_projection.size} " \
      "shown=#{items.size} project_id=#{@project.id}"
    )
    items.first(30).each do |item|
      Rails.logger.info(
        "[EmailHistory] pending_item run=#{item.try(:flow_run_id)} contact=#{item.try(:contact_profile_id)} " \
        "node=#{item.try(:node_id)} at=#{item.created_at&.iso8601} to=#{item.recipient_email} subject=#{item.subject.to_s[0, 120]}"
      )
    end
    items
  rescue StandardError => e
    Rails.logger.warn("[EmailHistory] pending_flow_deliveries failed: #{e.class}: #{e.message}")
    []
  end

  def pending_from_materialized_items(run_cache:, flow_cache:, node_cache:, contact_cache:, template_cache:)
    scope = FlowRunItem.joins(:flow_run)
                       .where(flow_runs: { project_id: @project.id })
                       .where(status: "queued")
                       .where("result_meta ->> 'materialized_plan' = 'true'")
                       .order(created_at: :desc)
                       .limit(1500)

    reachability_cache = {}
    parent_cache = {}

    scope.filter_map do |item|
      unless materialized_item_reachable_for_history?(item, reachability_cache: reachability_cache, parent_cache: parent_cache)
        Rails.logger.info(
          "[EmailHistory] pending_item_hidden run=#{item.flow_run_id} contact=#{item.contact_id || 'nil'} " \
          "node=#{item.node_id} reason=blocked_parent_chain"
        )
        next
      end
      meta = item.result_meta.is_a?(Hash) ? item.result_meta : {}
      scheduled_at = parse_history_datetime(meta["planned_at"]) || item.created_at
      build_pending_item_from_node(
        run_id: item.flow_run_id.to_i,
        node_id: item.node_id.to_s,
        contact_id: item.contact_id.to_i,
        scheduled_at: scheduled_at,
        run_cache: run_cache,
        flow_cache: flow_cache,
        node_cache: node_cache,
        contact_cache: contact_cache,
        template_cache: template_cache
      )
    end.compact
  rescue StandardError => e
    Rails.logger.warn("[EmailHistory] pending_from_materialized_items failed: #{e.class}: #{e.message}")
    []
  end

  def pending_from_scheduled_jobs(jobs:, run_cache:, flow_cache:, node_cache:, contact_cache:, template_cache:, planned_item_cache:)
    return [] unless defined?(GoodJob::Job)
    items = []

    Array(jobs).each do |job|
      args = extract_flow_node_job_arguments(job.serialized_params)
      next unless args.is_a?(Array) && args.length >= 3
      next unless pending_job_active_for_history?(args, planned_item_cache)
      run_id = args[0].to_i
      node_id = args[2].to_s
      contact_id = args[1].to_i

      pending = build_pending_item_from_node(
        run_id: run_id,
        node_id: node_id,
        contact_id: contact_id,
        scheduled_at: job.scheduled_at,
        run_cache: run_cache,
        flow_cache: flow_cache,
        node_cache: node_cache,
        contact_cache: contact_cache,
        template_cache: template_cache
      )
      items << pending if pending
    end

    items
  end

  def pending_job_active_for_history?(args, planned_item_cache)
    options = args[3]
    run_id = args[0].to_i
    contact_id = args[1].to_i
    node_id = args[2].to_s

    unless options.is_a?(Hash)
      return pending_materialized_node_active?(
        run_id: run_id,
        node_id: node_id,
        contact_id: contact_id,
        planned_item_cache: planned_item_cache
      )
    end

    planned_item_id = options["planned_item_id"] || options[:planned_item_id]
    if planned_item_id.blank?
      return pending_materialized_node_active?(
        run_id: run_id,
        node_id: node_id,
        contact_id: contact_id,
        planned_item_cache: planned_item_cache
      )
    end

    planned_item_id = planned_item_id.to_i
    return true if planned_item_id <= 0

    cache_key = [run_id, planned_item_id]
    return planned_item_cache[cache_key] if planned_item_cache.key?(cache_key)

    planned_item = FlowRunItem.find_by(id: planned_item_id, flow_run_id: run_id)
    active = planned_item&.status.to_s == "queued"
    if active && planned_item
      active = materialized_item_reachable_for_history?(
        planned_item,
        reachability_cache: {},
        parent_cache: {}
      )
    end
    planned_item_cache[cache_key] = active
    active
  rescue StandardError
    true
  end

  def materialized_item_reachable_for_history?(item, reachability_cache:, parent_cache:)
    return true unless item
    return reachability_cache[item.id] if reachability_cache.key?(item.id)

    status = item.status.to_s
    if %w[failed skipped cancelled].include?(status)
      reachability_cache[item.id] = false
      return false
    end
    unless %w[queued running finished].include?(status)
      reachability_cache[item.id] = true
      return true
    end

    meta = item.result_meta.is_a?(Hash) ? item.result_meta : {}
    planned_from = meta["planned_from"].to_s.presence
    if planned_from.blank?
      reachability_cache[item.id] = true
      return true
    end

    parent = resolve_materialized_parent_item_for_history(item: item, parent_node_id: planned_from, parent_cache: parent_cache)
    if parent.nil?
      # Keep visible if parent cannot be resolved to avoid accidental data loss in UI.
      reachability_cache[item.id] = true
      return true
    end

    parent_status = parent.status.to_s
    if %w[failed skipped cancelled].include?(parent_status)
      reachability_cache[item.id] = false
      return false
    end

    reachable = materialized_item_reachable_for_history?(parent, reachability_cache: reachability_cache, parent_cache: parent_cache)
    reachability_cache[item.id] = reachable
    reachable
  rescue StandardError
    true
  end

  def resolve_materialized_parent_item_for_history(item:, parent_node_id:, parent_cache:)
    cache_key = [item.id, parent_node_id.to_s]
    return parent_cache[cache_key] if parent_cache.key?(cache_key)

    scope = FlowRunItem.where(flow_run_id: item.flow_run_id, node_id: parent_node_id.to_s)
                       .where("id < ?", item.id)
    scope = scope.where(contact_id: item.contact_id) if item.contact_id.present?
    parent = scope.order(id: :desc).first
    parent_cache[cache_key] = parent
    parent
  rescue StandardError
    nil
  end

  def pending_materialized_node_active?(run_id:, node_id:, contact_id:, planned_item_cache:)
    return true if run_id <= 0 || node_id.blank?

    meta_key = [:materialized_run, run_id]
    materialized = if planned_item_cache.key?(meta_key)
                     planned_item_cache[meta_key]
                   else
                     run = FlowRun.select(:id, :metadata).find_by(id: run_id, project_id: @project.id)
                     value = run&.metadata.is_a?(Hash) && run.metadata["materialized_plan"] == true
                     planned_item_cache[meta_key] = value
                     value
                   end
    return true unless materialized

    cache_key = [:materialized_node, run_id, node_id.to_s, contact_id.to_i]
    return planned_item_cache[cache_key] if planned_item_cache.key?(cache_key)

    scope = FlowRunItem.where(flow_run_id: run_id, node_id: node_id.to_s, status: "queued")
    scope = scope.where(contact_id: contact_id.to_i) if contact_id.to_i.positive?
    active = scope.exists?
    planned_item_cache[cache_key] = active
    active
  rescue StandardError
    true
  end

  def dedupe_pending_items_by_run_and_node(items)
    grouped = items.group_by { |item| [item.try(:flow_run_id).to_i, item.try(:node_id).to_s] }
    grouped.values.flat_map do |group|
      with_contact = group.select { |item| item.try(:contact_profile_id).to_i.positive? }
      with_contact.any? ? with_contact : group
    end
  end

  def pending_from_delay_items(run_cache:, flow_cache:, node_cache:, edge_cache:, contact_cache:, template_cache:)
    items = []
    scope = FlowRunItem.joins(:flow_run)
                       .where(flow_runs: { project_id: @project.id })
                       .where(status: "finished")
                       .where.not(result_meta: nil)
                       .order(created_at: :desc)
                       .limit(400)

    scope.to_a.each do |item|
      meta = item.result_meta.is_a?(Hash) ? item.result_meta : {}
      delay_until_raw = meta["delay_until"].to_s
      next if delay_until_raw.blank?
      delay_until = begin
        Time.zone.parse(delay_until_raw)
      rescue StandardError
        nil
      end
      next unless delay_until && delay_until > Time.current

      run_id = item.flow_run_id.to_i
      flow = flow_cache[run_id]
      unless flow_cache.key?(run_id)
        run = run_cache[run_id]
        unless run
          run = FlowRun.includes(:flow_definition).find_by(id: run_id, project_id: @project.id)
          run_cache[run_id] = run
        end
        flow = run&.flow_definition
        flow_cache[run_id] = flow
      end
      next unless flow

      edges = edge_cache[flow.id]
      unless edges
        definition = flow.definition_json.is_a?(Hash) ? flow.definition_json : {}
        edges = definition["edges"].is_a?(Array) ? definition["edges"] : []
        edge_cache[flow.id] = edges
      end
      next_nodes = edges.select { |edge| edge.is_a?(Hash) && edge["source"].to_s == item.node_id.to_s }
                        .map { |edge| edge["target"].to_s }
                        .reject(&:blank?)
                        .uniq
      next if next_nodes.empty?

      next_nodes.each do |target_node_id|
        pending = build_pending_item_from_node(
          run_id: run_id,
          node_id: target_node_id,
          contact_id: item.contact_id.to_i,
          scheduled_at: delay_until,
          run_cache: run_cache,
          flow_cache: flow_cache,
          node_cache: node_cache,
          contact_cache: contact_cache,
          template_cache: template_cache
        )
        items << pending if pending
      end
    end

    items
  end

  def build_pending_item_from_node(run_id:, node_id:, contact_id:, scheduled_at:, run_cache:, flow_cache:, node_cache:, contact_cache:, template_cache:)
    run = run_cache[run_id]
    unless run
      run = FlowRun.includes(:flow_definition).find_by(id: run_id, project_id: @project.id)
      run_cache[run_id] = run
    end
    return nil unless run

    flow = flow_cache[run_id]
    unless flow_cache.key?(run_id)
      flow = run.flow_definition
      flow_cache[run_id] = flow
    end
    return nil unless flow

    nodes_by_id = node_cache[flow.id]
    unless nodes_by_id
      nodes = (flow.definition_json || {})["nodes"]
      nodes = [] unless nodes.is_a?(Array)
      nodes_by_id = nodes.each_with_object({}) do |node, memo|
        next unless node.is_a?(Hash)
        memo[node["id"].to_s] = node
      end
      node_cache[flow.id] = nodes_by_id
    end
    node = nodes_by_id[node_id.to_s]
    return nil unless node
    node_type = node["type"].to_s
    return nil unless %w[email email_template].include?(node_type)
    return nil if cancelled_from_history?(run_id: run_id, node_id: node_id, contact_id: contact_id)

    data = node["data"].is_a?(Hash) ? node["data"] : {}
    payload = run.metadata.is_a?(Hash) && run.metadata["payload"].is_a?(Hash) ? run.metadata["payload"] : {}
    contact = nil
    if contact_id.to_i.positive?
      contact = contact_cache[contact_id.to_i]
      unless contact
        contact = WhatsappContactProfile.find_by(id: contact_id.to_i, project_id: @project.id)
        contact_cache[contact_id.to_i] = contact
      end
    end

    recipient_email = contact&.email.to_s.strip
    recipient_email = payload_email_value(payload) if recipient_email.blank?

    subject = ""
    smtp_source = "openproject"
    if node_type == "email"
      subject = data["subject"].to_s
      smtp_source = normalize_smtp_source(data["smtp_source"])
    else
      template_id = data["template_id"].to_s
      template = nil
      if template_id.present?
        template = template_cache[template_id]
        unless template_cache.key?(template_id)
          template = EmailTemplate.find_by(id: template_id, project_id: @project.id)
          template_cache[template_id] = template
        end
      end
      subject = template&.subject.to_s
      smtp_source = normalize_smtp_source(template&.smtp_source)
    end

    OpenStruct.new(
      recipient_email: recipient_email.presence || "(pendiente)",
      subject: subject,
      status: "queued",
      smtp_source: smtp_source,
      flow_run_id: run.id,
      node_id: node_id.to_s,
      contact_profile_id: contact_id.to_i.positive? ? contact_id.to_i : contact&.id,
      sent_at: nil,
      created_at: scheduled_at,
      error_message: ""
    )
  end

  def materialized_run?(run_id, run_cache)
    run = run_cache[run_id]
    unless run
      run = FlowRun.find_by(id: run_id, project_id: @project.id)
      run_cache[run_id] = run
    end
    metadata = run&.metadata
    metadata = {} unless metadata.is_a?(Hash)
    metadata["materialized_plan"] == true
  rescue StandardError
    false
  end

  def cancelled_from_history?(run_id:, node_id:, contact_id:)
    run = FlowRun.find_by(id: run_id, project_id: @project.id)
    return false unless run

    contact_key = contact_id.to_i.positive? ? contact_id.to_i : nil
    metadata = run.metadata.is_a?(Hash) ? run.metadata : {}
    cancelled = metadata["history_cancelled"].is_a?(Array) ? metadata["history_cancelled"] : []
    in_metadata = cancelled.any? do |entry|
      next false unless entry.is_a?(Hash)
      entry["node_id"].to_s == node_id.to_s &&
        entry["contact_id"].to_i == contact_key.to_i
    end
    return true if in_metadata

    # Backward compatibility with legacy "skipped/cancelado" markers.
    scope = FlowRunItem.where(flow_run_id: run_id, node_id: node_id.to_s, status: "skipped", error_message: "Cancelado desde historial")
    scope = scope.where(contact_id: contact_id.to_i) if contact_id.to_i.positive?
    scope.exists?
  rescue StandardError
    false
  end

  def project_pending_deliveries(run_id:, contact_id:, start_node_id:, start_at:, run_cache:, flow_cache:, node_cache:, edge_cache:, contact_cache:, template_cache:)
    run = run_cache[run_id]
    unless run
      run = FlowRun.includes(:flow_definition).find_by(id: run_id, project_id: @project.id)
      run_cache[run_id] = run
    end
    return [] unless run

    flow = flow_cache[run_id]
    unless flow_cache.key?(run_id)
      flow = run.flow_definition
      flow_cache[run_id] = flow
    end
    return [] unless flow

    nodes_by_id = node_cache[flow.id]
    unless nodes_by_id
      nodes = (flow.definition_json || {})["nodes"]
      nodes = [] unless nodes.is_a?(Array)
      nodes_by_id = nodes.each_with_object({}) do |node, memo|
        next unless node.is_a?(Hash)
        memo[node["id"].to_s] = node
      end
      node_cache[flow.id] = nodes_by_id
    end

    edges = edge_cache[flow.id]
    unless edges
      definition = flow.definition_json.is_a?(Hash) ? flow.definition_json : {}
      edges = definition["edges"].is_a?(Array) ? definition["edges"] : []
      edge_cache[flow.id] = edges
    end

    items = []
    queue = [[start_node_id.to_s, start_at]]
    # Allow revisiting a node with different projected times (flows that loop through the same delay node).
    visited_per_node_times = Hash.new { |hash, key| hash[key] = [] }
    max_steps = 300
    steps = 0

    while queue.any? && steps < max_steps
      steps += 1
      node_id, node_time = queue.shift
      node_id = node_id.to_s
      next if node_id.blank?
      node_time_i = node_time&.to_i || 0
      seen_times = visited_per_node_times[node_id]
      next if seen_times.any? { |value| (value - node_time_i).abs <= 1 }
      next if seen_times.size >= 6
      seen_times << node_time_i

      pending = build_pending_item_from_node(
        run_id: run_id,
        node_id: node_id,
        contact_id: contact_id,
        scheduled_at: node_time,
        run_cache: run_cache,
        flow_cache: flow_cache,
        node_cache: node_cache,
        contact_cache: contact_cache,
        template_cache: template_cache
      )
      items << pending if pending

      node = nodes_by_id[node_id]
      next unless node.is_a?(Hash)
      node_type = node["type"].to_s
      node_data = node["data"].is_a?(Hash) ? node["data"] : {}
      next_time = node_time
      if node_type == "delay"
        next_time = estimate_delay_node_time(node_data, node_time)
      elsif node_type == "wait_until"
        next_time = estimate_wait_until_node_time(node_data, node_time)
      end

      targets = edges.select { |edge| edge.is_a?(Hash) && edge["source"].to_s == node_id }
                     .map { |edge| edge["target"].to_s }
                     .reject(&:blank?)
                     .uniq
      targets.each do |target_node_id|
        queue << [target_node_id, next_time]
      end
    end

    Rails.logger.info(
      "[EmailHistory] projection_walk run=#{run_id} contact=#{contact_id} start_node=#{start_node_id} " \
      "steps=#{steps} items=#{items.size} unique_nodes=#{items.map { |item| item.try(:node_id).to_s }.uniq.size}"
    )

    items
  end

  def estimate_delay_node_time(data, base_time)
    base = base_time || Time.current
    amount = data["amount"].to_i
    return base if amount <= 0
    unit = data["unit"].to_s
    seconds =
      case unit
      when "minutes" then amount.minutes
      when "hours" then amount.hours
      when "days" then amount.days
      else amount.seconds
      end
    base + seconds
  rescue StandardError
    base_time || Time.current
  end

  def estimate_wait_until_node_time(data, base_time)
    base = base_time || Time.current
    date_text = data["date"].to_s.strip
    time_text = data["time"].to_s.strip
    return base if date_text.blank?

    candidate = Time.zone.parse([date_text, time_text.presence || "00:00"].join(" "))
    return base unless candidate
    candidate > base ? candidate : base
  rescue StandardError
    base_time || Time.current
  end

  def pending_item_key(item)
    run = item.try(:flow_run_id).to_s
    contact = item.try(:contact_profile_id).to_s
    node = item.try(:node_id).to_s
    if run.present? && node.present?
      return [run, contact, node].join("|")
    end

    [
      item.recipient_email.to_s.strip.downcase,
      item.subject.to_s.strip.downcase,
      item.smtp_source.to_s.strip.downcase,
      item.created_at&.to_i.to_s
    ].join("|")
  end

  def extract_flow_node_job_arguments(serialized_params)
    raw = serialized_params
    if raw.is_a?(String)
      begin
        raw = JSON.parse(raw)
      rescue StandardError
        raw = {}
      end
    end
    return [] unless raw.is_a?(Hash)

    # Direct GoodJob serialization for custom jobs (FlowNodeJob).
    args =
      raw["arguments"] ||
      raw[:arguments] ||
      raw.dig("job_data", "arguments") ||
      raw.dig(:job_data, :arguments) ||
      raw.dig("job", "arguments") ||
      raw.dig(:job, :arguments)
    return args if args.is_a?(Array) && args.length >= 3 && args[2].to_s.present?

    # ActiveJob wrapper shape:
    # arguments: [ { job_class: "FlowNodeJob", arguments: [run_id, contact_id, node_id, ...] } ]
    wrapper = args.is_a?(Array) ? args.first : nil
    if wrapper.is_a?(Hash)
      job_class = wrapper["job_class"] || wrapper[:job_class] || wrapper.dig("job_data", "job_class")
      return [] unless job_class.to_s == "FlowNodeJob"

      inner_args =
        wrapper["arguments"] ||
        wrapper[:arguments] ||
        wrapper.dig("job_data", "arguments") ||
        wrapper.dig(:job_data, :arguments)
      return inner_args if inner_args.is_a?(Array)
    end

    []
  rescue StandardError
    []
  end

  def payload_email_value(payload)
    return "" unless payload.is_a?(Hash)

    direct = payload["email"].to_s.strip
    return direct if direct.present?

    submission = payload["submission"]
    if submission.is_a?(Hash)
      pair = submission.find { |key, value| key.to_s.strip.downcase == "email" && value.to_s.strip.present? }
      return pair[1].to_s.strip if pair
    end

    data = payload["data"]
    if data.is_a?(Hash)
      data.each_value do |entry|
        next unless entry.is_a?(Hash)
        next unless entry["name"].to_s.strip.downcase == "email"
        value = entry["value"].to_s.strip
        return value if value.present?
      end
    end

    ""
  end

  def good_job_has_column?(column_name)
    return false unless defined?(GoodJob::Job)
    GoodJob::Job.column_names.include?(column_name.to_s)
  rescue StandardError
    false
  end

  def smtp_source_options
    [
      ["SMTP por defecto", "openproject"],
      ["SMTP 2", "smtp2"],
      ["SMTP 3", "smtp3"],
      ["SMTP 4", "smtp4"]
    ]
  end

  def default_smtp_source_for_forms
    @settings&.use_plugin_smtp ? "smtp2" : "openproject"
  end

  def normalize_smtp_source(value)
    source = value.to_s
    source = "smtp2" if source == "plugin"
    EmailProjectSetting::SMTP_SOURCES.include?(source) ? source : "openproject"
  end

  def history_time_zone
    tz = User.current.respond_to?(:time_zone) ? User.current.time_zone.to_s : ""
    return ActiveSupport::TimeZone[tz] if ActiveSupport::TimeZone[tz].present?

    project_tz = WhatsappProjectSetting.find_by(project_id: @project.id)&.time_zone.to_s.strip
    return ActiveSupport::TimeZone[project_tz] if ActiveSupport::TimeZone[project_tz].present?

    Time.zone
  rescue StandardError
    Time.zone
  end

  def parse_history_date(value)
    text = value.to_s.strip
    return nil if text.empty?
    Date.iso8601(text)
  rescue StandardError
    begin
      Date.parse(text)
    rescue StandardError
      nil
    end
  end

  def parse_history_datetime(value)
    text = value.to_s.strip
    return nil if text.empty?
    Time.zone.parse(text)
  rescue StandardError
    nil
  end

  def good_job_pending_scope
    return GoodJob::Job.none unless defined?(GoodJob::Job)
    scope = GoodJob::Job.where(finished_at: nil)
    scope = scope.where(discarded_at: nil) if good_job_has_column?(:discarded_at)
    scope.where(job_class: ["FlowNodeJob", "ActiveJob::QueueAdapters::GoodJobAdapter::JobWrapper"])
         .where.not(scheduled_at: nil)
  end

  def mark_pending_as_cancelled(run_id:, node_id:, contact_id:)
    run = FlowRun.find_by(id: run_id, project_id: @project.id)
    return 0 unless run

    contact_key = contact_id.to_i.positive? ? contact_id.to_i : nil
    now = Time.current

    item_scope = FlowRunItem.where(flow_run_id: run_id, node_id: node_id.to_s)
    item_scope = if contact_key
                   item_scope.where(contact_id: contact_key)
                 else
                   item_scope.where(contact_id: nil)
                 end
    # Hard delete pending items for this run/contact/node.
    deleted = item_scope.where(status: "queued").delete_all
    # Cleanup legacy cancellation markers to avoid residue in history queries.
    deleted += item_scope.where(status: "skipped", error_message: "Cancelado desde historial").delete_all

    run.with_lock do
      metadata = run.metadata.is_a?(Hash) ? run.metadata.deep_dup : {}
      cancelled = metadata["history_cancelled"].is_a?(Array) ? metadata["history_cancelled"] : []
      already_present = cancelled.any? do |entry|
        entry.is_a?(Hash) &&
          entry["node_id"].to_s == node_id.to_s &&
          entry["contact_id"].to_i == contact_key.to_i
      end
      unless already_present
        cancelled << {
          "node_id" => node_id.to_s,
          "contact_id" => contact_key,
          "cancelled_at" => now.iso8601
        }
      end
      metadata["history_cancelled"] = cancelled
      run.update_columns(metadata: metadata, updated_at: now)
    end

    finalize_run_if_stale(run_id)
    deleted
  end

  def finalize_run_if_stale(run_id)
    run = FlowRun.find_by(id: run_id, project_id: @project.id)
    return if run.nil?
    return unless run.status.to_s == "running"
    return if FlowRunItem.where(flow_run_id: run.id, status: "queued").exists?

    now = Time.current
    run.update_columns(status: "finished", finished_at: (run.finished_at || now), updated_at: now)
  end

  def history_redirect_params
    result = {}
    parsed_date = parse_history_date(params[:history_date])
    result[:history_date] = parsed_date.iso8601 if parsed_date
    page = params[:page].to_i
    result[:page] = page if page.positive?
    result
  end

  def transparent_pixel_gif
    @transparent_pixel_gif ||= Base64.decode64("R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=")
  end

  def generate_open_tracking_token
    loop do
      token = SecureRandom.hex(20)
      break token unless EmailDelivery.exists?(open_tracking_token: token)
    end
  end

  def paginate_history_groups!
    per_page = 10
    total = @history_groups.size
    total_pages = (total.to_f / per_page).ceil
    page = params[:page].to_i
    page = 1 if page <= 0
    page = total_pages if total_pages.positive? && page > total_pages
    page = 1 if total_pages.zero?
    offset = (page - 1) * per_page

    @history_groups = @history_groups.slice(offset, per_page) || []
    @history_pagination = {
      page: page,
      per_page: per_page,
      total: total,
      total_pages: total_pages
    }
  end

  def store_attachments(deliveries)
    uploads = Array(email_params[:attachments]).compact
    return if uploads.empty?

    storage_dir = Rails.root.join("files", "email_attachments")
    FileUtils.mkdir_p(storage_dir)

    uploads.each do |upload|
      next unless upload.respond_to?(:original_filename)

      filename = File.basename(upload.original_filename.to_s)
      next if filename.blank?

      token = SecureRandom.hex(8)
      path = storage_dir.join("#{Time.current.strftime('%Y%m%d%H%M%S')}_#{token}_#{filename}")
      File.open(path, "wb") { |file| file.write(upload.read) }

      deliveries.each do |delivery|
        EmailAttachment.create!(
          email_delivery: delivery,
          file_name: filename,
          content_type: upload.content_type.to_s,
          file_size: upload.size.to_i,
          storage_path: path.to_s
        )
      end
    end
  end

  def store_template_attachments(template)
    uploads = Array(template_params[:attachments]).compact
    return if uploads.empty?

    storage_dir = Rails.root.join("files", "email_template_attachments")
    FileUtils.mkdir_p(storage_dir)

    uploads.each do |upload|
      next unless upload.respond_to?(:original_filename)

      filename = File.basename(upload.original_filename.to_s)
      next if filename.blank?

      token = SecureRandom.hex(8)
      path = storage_dir.join("#{Time.current.strftime('%Y%m%d%H%M%S')}_#{token}_#{filename}")
      File.open(path, "wb") { |file| file.write(upload.read) }

      EmailTemplateAttachment.create!(
        email_template: template,
        file_name: filename,
        content_type: upload.content_type.to_s,
        file_size: upload.size.to_i,
        storage_path: path.to_s
      )
    end
  end

  def store_template_delivery_attachments(deliveries, template)
    return unless template

    template.email_template_attachments.find_each do |attachment|
      deliveries.each do |delivery|
        EmailAttachment.create!(
          email_delivery: delivery,
          file_name: attachment.file_name,
          content_type: attachment.content_type,
          file_size: attachment.file_size,
          storage_path: attachment.storage_path
        )
      end
    end
  end
end
