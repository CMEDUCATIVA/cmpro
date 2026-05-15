class ContactosController < ApplicationController
  before_action :find_project_by_project_id
  before_action :authorize
  before_action :find_contact, only: [:show, :update, :destroy, :edit_panel, :files_index, :files_create, :files_destroy, :call_activity, :call_history_index, :call_history_audio, :call_history_destroy, :recorder_log, :recorder_preview_create, :recorder_preview_show]
  before_action :load_contact_fields, only: [:index, :show, :new, :edit_panel]
  before_action :load_table_settings, only: [:index, :show, :new, :edit_panel]
  before_action :load_project_users, only: [:index, :show, :new, :edit_panel]
  before_action :load_tag_map, only: [:index, :show, :new, :edit_panel]
  before_action :ensure_admin_for_tags_destroy, only: [:tags_destroy]
  helper_method :format_contact_time

  require "csv"

  def index
    requested_sort = params[:sort].to_s
    if requested_sort.in?(%w[last_interaction last_interaction_desc last_interaction_asc])
      Rails.logger.info(
        "[CRM][Sort] last_interaction_click project_id=#{@project.id} user_id=#{User.current.id} "\
        "sort=#{requested_sort.inspect} q=#{params[:q].to_s.inspect} assigned_to_id=#{params[:assigned_to_id].to_s.inspect} "\
        "per_page=#{params[:per_page].to_s.inspect} page=#{params[:page].to_s.inspect}"
      )
    end

    @filters = build_filters
    @contacts = apply_filters(contact_scope, @filters)
    @contacts = @contacts.includes(:chat, :assigned_to)
    @contacts = apply_sort(@contacts, @filters)
    @contacts, @pagination = paginate_contacts(@contacts)
    @contact_open_email_counts = {}
    contact_ids = @contacts.map(&:id)
    if contact_ids.any?
      @contact_open_email_counts = EmailDelivery
                                   .where(project: @project, contact_profile_id: contact_ids)
                                   .group(:contact_profile_id)
                                   .sum(:open_count)
    end
    @contact_wp_meta = {}
    chat_ids = @contacts.map(&:chat_id).compact
    if contact_ids.any? || chat_ids.any?
      chat_to_contact = @contacts.each_with_object({}) do |contact, map|
        map[contact.chat_id] = contact.id if contact.chat_id.present?
      end
      relations = WhatsappWorkPackageRelation
        .where(project: @project)
        .where("contact_profile_id IN (?) OR chat_id IN (?)", contact_ids.presence || [0], chat_ids.presence || [0])
        .includes(work_package: :status)
        .order(created_at: :desc)
      relations.each do |relation|
        contact_id = relation.contact_profile_id.presence || chat_to_contact[relation.chat_id]
        next unless contact_id
        next if @contact_wp_meta.key?(contact_id)
        work_package = relation.work_package
        status = work_package&.status
        @contact_wp_meta[contact_id] = {
          work_package_id: work_package&.id,
          status_id: status&.id,
          status_name: status&.name.to_s,
          status_color: status&.color&.hexcode.to_s
        }
      end
    end
    total =
      if @pagination.respond_to?(:total_entries)
        @pagination.total_entries
      elsif @pagination.respond_to?(:total_count)
        @pagination.total_count
      elsif @pagination.is_a?(Hash)
        @pagination[:total] || @pagination["total"]
      else
        nil
      end
    total ||= @contacts.size
    Rails.logger.info("[CRM] list project_id=#{@project.id} filters=#{@filters.inspect} total=#{total}")
  end

  def show
  end

  def history
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    @history_date = selected_history_date
    @history_date_iso = @history_date.strftime("%Y-%m-%d")
    @history_date_label = @history_date.strftime("%d/%m/%Y")
    range_start, range_end = history_day_range_utc(@history_date)

    entries = WhatsappCallHistory
      .where(project: @project)
      .where(logged_at: range_start..range_end)
      .includes({ contact_profile: :assigned_to }, :created_by)
      .order(logged_at: :desc, id: :desc)
      .limit(1000)
    unless User.current.admin?
      entries = entries.where(created_by_id: User.current.id)
                       .or(entries.where(contact_profile_id: visible_contact_ids_for_history))
    end

    @history_responsible_id = params[:responsible_id].to_s.strip
    @history_users = visible_project_users.order(:lastname, :firstname).map do |user|
      { id: user.id, name: user.name.to_s }
    end

    @call_history_rows = entries.map do |entry|
      contact = entry.contact_profile
      duration = entry.call_duration.to_s.presence || "00:00:00"
      duration_seconds = parse_call_duration_seconds(duration)
      ended_at = time_in_project_zone(entry.logged_at)
      started_at = ended_at.present? ? (ended_at - duration_seconds.seconds) : nil
      is_pause = entry.outcome.to_s.strip.casecmp("Pausa breve").zero?
      responsible_id = is_pause ? entry.created_by_id : contact&.assigned_to_id

      {
        name: is_pause ? "-" : ([contact&.first_name.to_s, contact&.last_name.to_s].join(" ").strip.presence || "Sin nombre"),
        phone: is_pause ? "-" : contact&.phone.to_s,
        responsible: is_pause ? entry.created_by&.name.to_s : contact&.assigned_to&.name.to_s,
        responsible_id: responsible_id,
        duration: duration,
        ended_at: ended_at,
        started_at: started_at,
        outcome: entry.outcome.to_s,
        is_pause: is_pause
      }
    end

    if @history_responsible_id.present?
      selected_id = @history_responsible_id.to_i
      @call_history_rows = @call_history_rows.select { |row| row[:responsible_id].to_i == selected_id }
    end

    @call_history_rows = @call_history_rows.sort_by do |row|
      started = row[:started_at]
      [started || Time.zone.at(0)]
    end

    @call_history_rows.each_with_index do |row, index|
      row[:gap_after_seconds] = nil
      row[:gap_after_label] = nil
      row[:gap_from_end_at_label] = nil
      row[:gap_to_start_at_label] = nil
      row[:gap_dead_time_alert] = false

      nxt = @call_history_rows[index + 1]
      next unless nxt && row[:ended_at].present? && nxt[:started_at].present?

      gap_seconds = (nxt[:started_at] - row[:ended_at]).to_i
      next unless gap_seconds.positive?

      row[:gap_after_seconds] = gap_seconds
      row[:gap_after_label] = format_hms(gap_seconds)
      row[:gap_from_end_at_label] = row[:ended_at].strftime("%H:%M:%S")
      row[:gap_to_start_at_label] = nxt[:started_at].strftime("%H:%M:%S")
      row[:gap_dead_time_alert] = dead_time_gap_alert?(row[:outcome], gap_seconds)
    end

    @history_dashboard_metrics = build_history_dashboard(@call_history_rows)

    @history_hour_counts = Hash.new(0)
    @call_history_by_hour = Array.new(24) { [] }
    @call_history_rows.each do |row|
      next unless row[:started_at].present?
      hour = row[:started_at].hour
      @history_hour_counts[hour] += 1
      @call_history_by_hour[hour] << row
    end
  end

  def pause_activity
    contact_profile_column = WhatsappCallHistory.columns_hash["contact_profile_id"]
    if contact_profile_column && !contact_profile_column.null
      render json: { ok: false, error: "Falta ejecutar migracion de pausas (contact_profile_id sigue siendo obligatorio)." }, status: :unprocessable_entity
      return
    end

    duration = params[:duration].to_s.strip
    duration = "00:00:00" if duration.blank?
    duration_seconds = parse_call_duration_seconds(duration)
    if duration_seconds <= 0
      render json: { ok: false, error: "Duracion invalida." }, status: :unprocessable_entity
      return
    end

    ended_at = Time.current
    entry = WhatsappCallHistory.create!(
      contact_profile: nil,
      project: @project,
      created_by: User.current,
      outcome: "Pausa breve",
      note: "",
      call_duration: format_hms(duration_seconds),
      logged_at: ended_at,
      audio_data: nil,
      audio_content_type: nil,
      audio_file_name: nil,
      audio_file_size: nil
    )

    render json: {
      ok: true,
      id: entry.id,
      outcome: entry.outcome,
      duration: entry.call_duration,
      logged_at: entry.logged_at
    }
  rescue StandardError => e
    Rails.logger.error("[Contactos][Pause] failed project_id=#{@project.id} user_id=#{User.current.id} error=#{e.class}: #{e.message}")
    render json: { ok: false, error: "No se pudo registrar la pausa: #{e.message}" }, status: :unprocessable_entity
  end

  def new
    redirect_to whatsapp_plugin_project_contactos_path(@project)
  end

  def edit_panel
    render partial: "contactos/edit_panel", locals: { contact: @contact }
  end

  def files_index
    files = @contact.contact_files.order(created_at: :desc)
    render json: { ok: true, files: files.map { |file| serialize_contact_file(file) } }
  end

  def files_create
    file = @contact.contact_files.new(contact_file_params)
    file.project = @project
    file.created_by = User.current if file.respond_to?(:created_by=)

    if file.save
      render json: { ok: true, file: serialize_contact_file(file) }
    else
      render json: { ok: false, errors: file.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def files_destroy
    file = @contact.contact_files.find(params[:file_id])
    file.destroy
    render json: { ok: true, id: file.id }
  end

  def call_activity
    outcome = params[:outcome].to_s.strip
    note_html = params[:note].to_s
    note_text = ActionController::Base.helpers.strip_tags(note_html).to_s.strip
    call_duration = params[:call_duration].to_s.strip
    call_duration = "00:00:00" if call_duration.blank?
    recorder_preview_token = params[:recorder_preview_token].to_s.strip

    if outcome.blank?
      render json: { ok: false, error: "Selecciona un resultado de llamada." }, status: :unprocessable_entity
      return
    end

    activity_lines = []
    activity_lines << "Actividad de llamada"
    activity_lines << "Resultado: #{outcome}"
    activity_lines << "Duracion de llamada: #{call_duration}"
    activity_lines << "Telefono: #{@contact.phone}" if @contact.phone.present?
    activity_lines << ""
    activity_lines << "Nota:"
    activity_lines << (note_text.presence || "Sin nota")
    activity_note = activity_lines.join("\n")

    relation_scope = WhatsappWorkPackageRelation.where(project: @project)
    relation_scope = if @contact.chat_id.present?
                       relation_scope.where("contact_profile_id = ? OR chat_id = ?", @contact.id, @contact.chat_id)
                     else
                       relation_scope.where(contact_profile_id: @contact.id)
                     end

    work_packages = relation_scope.includes(:work_package).map(&:work_package).compact.uniq { |wp| wp.id }
    created_ids = []
    skipped_ids = []

    work_packages.each do |work_package|
      unless User.current.allowed_in_project?(:add_work_package_comments, work_package.project)
        skipped_ids << work_package.id
        next
      end

      call = AddWorkPackageNoteService
             .new(user: User.current, work_package: work_package)
             .call(activity_note, send_notifications: true, internal: false)

      if call.success?
        created_ids << work_package.id
      else
        skipped_ids << work_package.id
      end
    end

    @contact.update!(
      last_call_activity_at: Time.current,
      last_call_activity_result: outcome,
      last_interaction_at: Time.current
    )

    preview = preview_for_token(recorder_preview_token)
    call_history = @contact.call_histories.create!(
      project: @project,
      created_by: User.current,
      outcome: outcome,
      note: note_text,
      call_duration: call_duration,
      logged_at: Time.current,
      audio_data: preview ? preview[:data] : nil,
      audio_content_type: preview ? preview[:content_type].to_s : nil,
      audio_file_name: preview ? preview[:filename].to_s : nil,
      audio_file_size: preview ? preview[:data].to_s.b.bytesize : nil
    )
    Rails.cache.delete(recorder_preview_cache_key(recorder_preview_token)) if recorder_preview_token.present?

    render json: {
      ok: true,
      contact_id: @contact.id,
      outcome: outcome,
      logged_at: @contact.last_call_activity_at,
      call_history_id: call_history.id,
      work_package_ids: created_ids,
      skipped_work_package_ids: skipped_ids,
      work_package_count: created_ids.size
    }
  end

  def call_history_index
    entries = @contact.call_histories.includes(:created_by).order(logged_at: :desc, id: :desc).limit(200)
    render json: {
      ok: true,
      items: entries.map { |entry| serialize_call_history(entry) }
    }
  end

  def call_history_audio
    entry = @contact.call_histories.find(params[:history_id])
    data = entry.audio_data.to_s.b
    if data.bytesize <= 0
      head :not_found
      return
    end

    stream_binary_with_ranges(
      data: data,
      content_type: entry.audio_content_type.to_s.presence || "audio/webm",
      filename: entry.audio_file_name.to_s.presence || "llamada-#{entry.id}.webm"
    )
  end

  def call_history_destroy
    unless User.current.admin?
      render json: { ok: false, error: "No autorizado" }, status: :forbidden
      return
    end

    entry = @contact.call_histories.find(params[:history_id])
    entry.destroy!
    render json: { ok: true, id: entry.id }
  end

  def recorder_log
    event_name = params[:event].to_s.presence || "unknown"
    payload = normalize_recorder_payload(params[:payload])
    client_time = params[:client_time].to_s

    Rails.logger.info(
      "[Contactos][Recorder] project_id=#{@project.id} contact_id=#{@contact.id} user_id=#{User.current.id} event=#{event_name} client_time=#{client_time} payload=#{payload.to_json}"
    )

    render json: { ok: true }
  end

  def recorder_preview_create
    audio_file = params[:audio]
    unless audio_file.respond_to?(:read)
      render json: { ok: false, error: "audio_missing" }, status: :unprocessable_entity
      return
    end

    binary = audio_file.read.to_s.b
    if binary.bytesize <= 0
      render json: { ok: false, error: "audio_empty" }, status: :unprocessable_entity
      return
    end
    if binary.bytesize > 10.megabytes
      render json: { ok: false, error: "audio_too_large" }, status: :unprocessable_entity
      return
    end

    token = SecureRandom.hex(24)
    payload = {
      project_id: @project.id,
      contact_id: @contact.id,
      user_id: User.current.id,
      content_type: audio_file.content_type.to_s.presence || "audio/webm",
      filename: audio_file.original_filename.to_s.presence || "grabacion.webm",
      data: binary
    }

    Rails.cache.write(recorder_preview_cache_key(token), payload, expires_in: 20.minutes)
    url = whatsapp_plugin_project_contactos_recorder_preview_file_path(@project, @contact.id, token: token)
    render json: { ok: true, token: token, url: url }
  end

  def recorder_preview_show
    token = params[:token].to_s
    preview = Rails.cache.read(recorder_preview_cache_key(token))
    unless preview
      head :not_found
      return
    end
    unless preview[:project_id].to_i == @project.id &&
           preview[:contact_id].to_i == @contact.id &&
           preview[:user_id].to_i == User.current.id
      head :forbidden
      return
    end

    stream_binary_with_ranges(
      data: preview[:data].to_s.b,
      content_type: preview[:content_type].to_s.presence || "application/octet-stream",
      filename: preview[:filename].to_s
    )
  end

  def create
    contact = WhatsappContactProfile.new(contact_params)
    contact.project = @project
    if contact.external_id.blank? && contact.phone.present?
      contact.external_id = normalize_phone_to_external_id(contact.phone)
    end
    contact.points = 0 if contact.points.nil?
    if contact.save
      chat = ensure_chat_for_contact(contact)
      WhatsappContactTag.ensure_for_project(@project, contact.tags)
      wp_relation = Whatsapp::AutoWorkPackageService
        .new(project: @project, contact_profile: contact, chat: chat, user: (User.current || User.system))
        .call(contact_was_new: true)
      work_package = wp_relation&.work_package
      respond_to do |format|
        format.html { redirect_to whatsapp_plugin_project_contacto_path(@project, contact.id), notice: "Contacto creado." }
        format.json do
          render json: {
            ok: true,
            id: contact.id,
            work_package_id: work_package&.id,
            work_package_subject: work_package&.subject.to_s
          }
        end
      end
    else
      errors = contact.errors.full_messages
      detail_codes = contact.errors.details.each_with_object({}) do |(field, details), memo|
        memo[field] = Array(details).map { |entry| entry[:error].to_s }
      end
      Rails.logger.warn(
        "[CRM] create_failed project_id=#{@project.id} user_id=#{User.current&.id} " \
        "phone=#{contact.phone.to_s.inspect} external_id=#{contact.external_id.to_s.inspect} " \
        "errors=#{errors.join(' | ')} details=#{detail_codes.inspect}"
      )
      respond_to do |format|
        format.html { redirect_to whatsapp_plugin_project_contactos_path(@project), alert: errors.join(", ") }
        format.json { render json: { ok: false, errors: errors, details: detail_codes }, status: :unprocessable_entity }
      end
    end
  end

  def update
    if @contact.update(contact_params)
      WhatsappContactTag.ensure_for_project(@project, @contact.tags)
      respond_to do |format|
        format.html { redirect_to whatsapp_plugin_project_contacto_path(@project, @contact.id), notice: "Contacto actualizado." }
        format.json { render json: { ok: true } }
      end
    else
      respond_to do |format|
        format.html do
          @users = visible_project_users.order(:lastname, :firstname)
          render :show
        end
        format.json { render json: { ok: false, errors: @contact.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def bulk_assign
    ids = Array(params[:contact_ids]).map(&:to_i).select(&:positive?).uniq
    if ids.empty?
      render json: { ok: false, error: "Selecciona al menos un contacto." }, status: :unprocessable_entity
      return
    end

    assigned_to_raw = params[:assigned_to_id].to_s.strip
    assigned_user = nil
    assigned_to_id = nil
    if assigned_to_raw.present?
      assigned_to_id = assigned_to_raw.to_i
      assigned_user = visible_project_users.find_by(id: assigned_to_id)
      unless assigned_user
        render json: { ok: false, error: "Responsable invalido." }, status: :unprocessable_entity
        return
      end
    end

    contacts = contact_scope.where(id: ids)
    updated = 0
    now = Time.current
    contacts.find_each do |contact|
      next if contact.assigned_to_id.to_i == assigned_to_id.to_i
      contact.update_columns(assigned_to_id: assigned_to_id, updated_at: now)
      updated += 1
    end

    render json: {
      ok: true,
      updated: updated,
      assigned_to_id: assigned_to_id,
      assigned_to_name: assigned_user&.name.to_s
    }
  end

  def destroy
    chat = @contact.chat
    if chat.nil? && @contact.external_id.present?
      chat = WhatsappChat.find_by(project: @project, external_id: @contact.external_id)
    end

    relation_scope =
      if chat
        WhatsappWorkPackageRelation.where("contact_profile_id = ? OR chat_id = ?", @contact.id, chat.id)
      else
        WhatsappWorkPackageRelation.where(contact_profile_id: @contact.id)
      end

    work_package_ids = relation_scope.pluck(:work_package_id).compact.uniq

    ActiveRecord::Base.transaction do
      relation_scope.destroy_all
      if work_package_ids.any?
        WhatsappBoardCardRelation.where(project: @project, work_package_id: work_package_ids).destroy_all
      end
      if work_package_ids.any?
        WorkPackage.where(id: work_package_ids).find_each(&:destroy)
      end
      chat&.destroy
      @contact.destroy
    end

    respond_to do |format|
      format.html { redirect_to whatsapp_plugin_project_contactos_path(@project), notice: "Contacto eliminado." }
      format.json { render json: { ok: true, id: @contact.id } }
    end
  end

  def duplicates
    scope = contact_scope
    @duplicates = {
      phone: duplicates_for(scope, :phone),
      email: duplicates_for(scope, :email),
      external_id: duplicates_for(scope, :external_id)
    }
  end

  def export
    contacts = apply_filters(contact_scope, build_filters).includes(:assigned_to)
    fields = contact_fields
    data = CSV.generate(headers: true) do |csv|
      headers = base_headers + fields.map { |field| "cf:#{field.name}" }
      csv << headers
      contacts.find_each do |contact|
        csv << build_row(contact, fields)
      end
    end

    format = params[:format].to_s == "xlsx" ? "xlsx" : "csv"
    filename = "contactos-#{@project.identifier}-#{Time.current.strftime('%Y%m%d%H%M%S')}.#{format}"
    content_type = format == "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv"
    send_data data, filename: filename, type: content_type
  end

  def import
    file = params[:file]
    unless file
      redirect_to whatsapp_plugin_project_contactos_path(@project), alert: "Selecciona un archivo CSV o Excel."
      return
    end

    rows = read_import_rows(file)
    if rows.nil?
      redirect_to whatsapp_plugin_project_contactos_path(@project), alert: "No se pudo leer el archivo. Usa CSV o instala 'roo' para Excel."
      return
    end

    fields = contact_fields.index_by { |field| field.name.to_s.downcase }
    imported = 0
    rows.each do |row|
      attrs = map_import_row(row, fields)
      next if attrs.empty?

      contact = find_contact_for_import(attrs)
      contact.project = @project
      contact.assign_attributes(attrs)
      imported += 1 if contact.save
    end

    redirect_to whatsapp_plugin_project_contactos_path(@project), notice: "Importados #{imported} contactos."
  end

  def create_field
    if field_params[:position].blank?
      max_position = WhatsappContactField.where(project: @project).maximum(:position).to_i
      field = WhatsappContactField.new(field_params.merge(project: @project, position: max_position + 1))
    else
      field = WhatsappContactField.new(field_params.merge(project: @project))
    end
    if field.save
      redirect_to whatsapp_plugin_project_contactos_path(@project), notice: "Campo creado."
    else
      redirect_to whatsapp_plugin_project_contactos_path(@project), alert: field.errors.full_messages.join(", ")
    end
  end

  def update_field
    field = contact_fields.find(params[:id])
    if field.update(field_params)
      redirect_to whatsapp_plugin_project_contactos_path(@project), notice: "Campo actualizado."
    else
      redirect_to whatsapp_plugin_project_contactos_path(@project), alert: field.errors.full_messages.join(", ")
    end
  end

  def update_fields_order
    ids = Array(params[:field_ids]).map(&:to_i).reject(&:zero?)
    return render json: { ok: false, error: "Sin campos" }, status: :unprocessable_entity if ids.empty?

    fields = WhatsappContactField.where(project: @project, id: ids)
    return render json: { ok: false, error: "Campos invalidos" }, status: :unprocessable_entity if fields.empty?

    position = 1
    ActiveRecord::Base.transaction do
      ids.each do |field_id|
        field = fields.find { |item| item.id == field_id }
        next unless field
        field.update_column(:position, position)
        position += 1
      end
    end

    settings = contact_table_settings
    existing_order = Array(settings.form_field_order)
    custom_keys = ids.map { |field_id| "custom:#{field_id}" }
    base_keys = existing_order.reject { |key| key.to_s.start_with?("custom:") }
    if base_keys.empty?
      base_keys = [
        "base:first_name",
        "base:last_name",
        "base:email",
        "base:phone",
        "base:company",
        "base:country",
        "base:state",
        "base:city",
        "base:address",
        "base:postal_code",
        "base:birthday",
        "base:job_title",
        "base:tags_text",
        "base:points"
      ]
    end
    settings.form_field_order = base_keys + custom_keys
    settings.save!

    render json: { ok: true }
  end

  def fields_panel
    @contact_fields = contact_fields
    render partial: "contactos/fields_panel"
  end

  def update_form_order
    order = Array(params[:field_ids]).map(&:to_s).map(&:strip).reject(&:blank?)
    return render json: { ok: false, error: "Sin campos" }, status: :unprocessable_entity if order.empty?
    settings = contact_table_settings
    settings.form_field_order = order
    settings.save!
    render json: { ok: true }
  end

  def destroy_field
    field = contact_fields.find(params[:id])
    used = WhatsappContactProfile.where(project: @project)
                                 .where("custom_fields::jsonb ? :key", key: field.name.to_s)
                                 .limit(1)
                                 .exists?
    if used
      redirect_to whatsapp_plugin_project_contactos_path(@project),
                  alert: "No se puede eliminar porque el campo está en uso."
    else
      field.destroy
      redirect_to whatsapp_plugin_project_contactos_path(@project), notice: "Campo eliminado."
    end
  end

  def tags_index
    render json: { tags: WhatsappContactTag.map_for_project(@project) }
  end

  def tags_upsert
    name = params[:name].to_s.strip
    return render json: { ok: false, error: "Nombre requerido" }, status: :unprocessable_entity if name.blank?

    color = params[:color].to_s.strip
    if color.present? && !WhatsappContactTag::PRIMARY_COLORS.include?(color)
      return render json: { ok: false, error: "Color invalido" }, status: :unprocessable_entity
    end

    tag = WhatsappContactTag.where(project: @project)
                            .where("LOWER(name) = ?", name.downcase)
                            .first
    tag ||= WhatsappContactTag.create!(
      project: @project,
      name: name,
      color: color.presence || WhatsappContactTag.color_for_name(name)
    )
    render json: { ok: true, tag: { id: tag.id, name: tag.name, color: tag.color } }
  end

  def tags_color
    tag = WhatsappContactTag.where(project: @project, id: params[:id]).first
    return render json: { ok: false, error: "Tag no encontrado" }, status: :not_found if tag.nil?

    color = params[:color].to_s
    unless WhatsappContactTag::PRIMARY_COLORS.include?(color)
      return render json: { ok: false, error: "Color invalido" }, status: :unprocessable_entity
    end

    tag.update!(color: color)
    render json: { ok: true, tag: { id: tag.id, name: tag.name, color: tag.color } }
  end

  def tags_rename
    tag = WhatsappContactTag.where(project: @project, id: params[:id]).first
    return render json: { ok: false, error: "Tag no encontrado" }, status: :not_found if tag.nil?

    name = params[:name].to_s.strip
    return render json: { ok: false, error: "Nombre requerido" }, status: :unprocessable_entity if name.blank?

    old_name = tag.name
    tag.update!(name: name)
    update_contacts_tag_name(old_name, name)
    render json: { ok: true, tag: { id: tag.id, name: tag.name, color: tag.color }, old_name: old_name }
  end

  def tags_destroy
    tag = WhatsappContactTag.where(project: @project, id: params[:id]).first
    return render json: { ok: false, error: "Tag no encontrado" }, status: :not_found if tag.nil?

    name = tag.name
    tag.destroy
    remove_contacts_tag(name)
    render json: { ok: true, name: name }
  end

  def table_settings
    settings = contact_table_settings
    render json: {
      hidden_fields: settings.hidden_fields || [],
      column_order: settings.column_order || [],
      column_widths: settings.column_widths || {},
      advanced_filters: settings.advanced_filters || {}
    }
  end

  def update_table_settings
    settings = contact_table_settings
    hidden_fields = settings.hidden_fields || []
    if params.key?(:hidden_fields)
      hidden_fields = normalize_hidden_fields(params[:hidden_fields])
      settings.hidden_fields = hidden_fields
    end
    if params.key?(:column_order)
      settings.column_order = normalize_column_order(params[:column_order])
    end
    if params.key?(:column_widths)
      settings.column_widths = normalize_column_widths(params[:column_widths])
    end
    if params.key?(:advanced_filters)
      settings.advanced_filters = normalize_advanced_filters(params[:advanced_filters])
    end
    settings.save!
    render json: {
      ok: true,
      hidden_fields: hidden_fields,
      column_order: settings.column_order || [],
      column_widths: settings.column_widths || {},
      advanced_filters: settings.advanced_filters || {}
    }
  end

  private

  def normalize_recorder_payload(raw_payload)
    source =
      if raw_payload.respond_to?(:to_unsafe_h)
        raw_payload.to_unsafe_h
      elsif raw_payload.is_a?(Hash)
        raw_payload
      else
        {}
      end

    source.each_with_object({}) do |(key, value), memo|
      safe_key = key.to_s[0, 80]
      memo[safe_key] = normalize_recorder_value(value)
    end
  end

  def parse_call_duration_seconds(value)
    raw = value.to_s.strip
    return 0 if raw.blank?
    parts = raw.split(":")
    return 0 unless parts.size == 3
    hh = parts[0].to_i
    mm = parts[1].to_i
    ss = parts[2].to_i
    return 0 if hh.negative? || mm.negative? || ss.negative?
    (hh * 3600) + (mm * 60) + ss
  end

  def format_hms(total_seconds)
    seconds = total_seconds.to_i
    hours = seconds / 3600
    minutes = (seconds % 3600) / 60
    secs = seconds % 60
    format("%02d:%02d:%02d", hours, minutes, secs)
  end

  def normalize_recorder_value(value)
    case value
    when String
      value[0, 500]
    when Numeric, TrueClass, FalseClass, NilClass
      value
    when Array
      value.first(20).map { |item| normalize_recorder_value(item) }
    when Hash
      value.each_with_object({}) do |(k, v), memo|
        memo[k.to_s[0, 80]] = normalize_recorder_value(v)
      end
    else
      value.to_s[0, 500]
    end
  end

  def serialize_call_history(entry)
    duration = entry.call_duration.to_s.presence || "00:00:00"
    duration_seconds = parse_call_duration_seconds(duration)
    ended_at = time_in_project_zone(entry.logged_at)
    started_at = ended_at.present? ? (ended_at - duration_seconds.seconds) : nil

    event_type = entry.respond_to?(:event_type) ? entry.event_type.to_s : "call"
    event_type = "call" if event_type.blank?
    event_meta = entry.respond_to?(:event_meta) && entry.event_meta.is_a?(Hash) ? entry.event_meta : {}
    if event_type == "call" && entry.outcome.to_s == "Actualizacion CRM"
      legacy_meta = begin
        JSON.parse(entry.note.to_s)
      rescue StandardError
        {}
      end
      if legacy_meta.is_a?(Hash) && legacy_meta["title"].present?
        event_type = "crm_trace"
        event_meta = legacy_meta
      end
    end

    {
      id: entry.id,
      event_type: event_type,
      event_meta: event_meta,
      outcome: entry.outcome.to_s,
      note: entry.note.to_s,
      call_duration: duration,
      logged_at: entry.logged_at,
      logged_at_label: format_contact_time(entry.logged_at),
      logged_at_date: ended_at&.strftime("%d/%m/%Y"),
      logged_at_time: ended_at&.strftime("%H:%M:%S"),
      started_at_time: started_at&.strftime("%H:%M:%S"),
      user_id: entry.created_by_id,
      user_name: entry.created_by&.name.to_s,
      has_audio: entry.audio_data.present?,
      audio_url: entry.audio_data.present? ? whatsapp_plugin_project_contactos_call_history_audio_path(@project, @contact.id, history_id: entry.id) : ""
    }
  end

  def preview_for_token(token)
    return nil if token.blank?
    preview = Rails.cache.read(recorder_preview_cache_key(token))
    return nil unless preview
    return nil unless preview[:project_id].to_i == @project.id
    return nil unless preview[:contact_id].to_i == @contact.id
    return nil unless preview[:user_id].to_i == User.current.id
    preview
  end

  def stream_binary_with_ranges(data:, content_type:, filename:)
    total_size = data.bytesize
    if total_size <= 0
      head :not_found
      return
    end

    response.headers["Accept-Ranges"] = "bytes"
    response.headers["Cache-Control"] = "private, max-age=120"
    response.headers["Content-Type"] = content_type.to_s
    response.headers["Content-Disposition"] = %(inline; filename="#{filename.to_s.gsub('"', '')}")

    range_header = request.headers["Range"].to_s
    if range_header.start_with?("bytes=")
      start_str, end_str = range_header.delete_prefix("bytes=").split("-", 2)
      range_start = start_str.present? ? start_str.to_i : 0
      range_end = end_str.present? ? end_str.to_i : (total_size - 1)
      range_start = 0 if range_start.negative?
      range_end = total_size - 1 if range_end >= total_size

      if range_start > range_end || range_start >= total_size
        response.headers["Content-Range"] = "bytes */#{total_size}"
        head :requested_range_not_satisfiable
        return
      end

      chunk = data.byteslice(range_start..range_end)
      response.headers["Content-Range"] = "bytes #{range_start}-#{range_end}/#{total_size}"
      response.headers["Content-Length"] = chunk.bytesize.to_s
      send_data chunk,
                type: content_type.to_s,
                disposition: "inline",
                filename: filename.to_s,
                status: :partial_content
      return
    end

    response.headers["Content-Length"] = total_size.to_s
    send_data data,
              type: content_type.to_s,
              disposition: "inline",
              filename: filename.to_s
  end

  def recorder_preview_cache_key(token)
    "contactos:recorder_preview:#{token}"
  end

  def find_contact
    @contact = contact_scope.find(params[:id])
  end

  def contact_scope
    scope = WhatsappContactProfile.active.where(project: @project)
    return scope if User.current.admin?

    scope.where(assigned_to_id: User.current.id)
  end

  def contact_fields
    WhatsappContactField.where(project: @project, active: true).order(Arel.sql("position IS NULL, position ASC, name ASC"))
  end

  def load_contact_fields
    @contact_fields = contact_fields
  end

  def load_table_settings
    @table_settings = contact_table_settings
  end

  def load_project_users
    @users = visible_project_users.order(:lastname, :firstname)
  end

  def visible_project_users
    users = @project.users.active
    return users if User.current.admin?

    users.where(id: User.current.id)
  end

  def visible_contact_ids_for_history
    @visible_contact_ids_for_history ||= contact_scope.reselect(:id)
  end

  def load_tag_map
    @tag_map = WhatsappContactTag.map_for_project(@project)
  end

  def ensure_admin_for_tags_destroy
    return if User.current.admin?
    render json: { ok: false, error: "No autorizado" }, status: :forbidden
  end

  def contact_table_settings
    settings = WhatsappContactTableSetting.find_by(project: @project, user: User.current)
    return settings if settings

    legacy_settings = WhatsappContactTableSetting.find_by(project: @project, user_id: nil)
    return WhatsappContactTableSetting.new(project: @project, user: User.current) unless legacy_settings

    WhatsappContactTableSetting.new(
      project: @project,
      user: User.current,
      hidden_fields: legacy_settings.hidden_fields,
      column_order: legacy_settings.column_order,
      column_widths: legacy_settings.column_widths,
      form_field_order: legacy_settings.form_field_order,
      advanced_filters: legacy_settings.advanced_filters
    )
  end

  def normalize_hidden_fields(value)
    Array(value).map(&:to_s).reject(&:blank?).uniq
  end

  def normalize_column_order(value)
    Array(value).map(&:to_s).reject(&:blank?).uniq
  end

  def normalize_column_widths(value)
    payload = if value.is_a?(ActionController::Parameters)
                value.to_unsafe_h
              else
                value
              end
    payload = payload.is_a?(Hash) ? payload : {}
    normalized = {}
    payload.each do |key, width|
      next if key.to_s.strip.empty?
      number = width.to_f
      next if number <= 0
      normalized[key.to_s] = number.round(1)
    end
    normalized
  end

  def normalize_advanced_filters(value)
    payload = if value.is_a?(ActionController::Parameters)
                value.to_unsafe_h
              else
                value
              end
    payload = payload.is_a?(Hash) ? payload : {}
    {
      "q" => payload["q"].to_s.strip,
      "sort" => payload["sort"].to_s.strip,
      "builder" => payload["builder"].is_a?(Hash) ? payload["builder"] : parse_filters_json(payload["builder"])
    }
  end

  def filters_present?(filters)
    q = filters[:q].to_s
    sort = filters[:sort].to_s
    assigned_to_id = filters[:assigned_to_id].to_s
    builder = filters[:builder]
    q.present? || sort.present? || assigned_to_id.present? || (builder.is_a?(Hash) && builder["rules"].to_a.any?)
  end

  def load_saved_filters
    settings = @table_settings || contact_table_settings
    saved = settings&.advanced_filters
    saved = saved.to_unsafe_h if saved.is_a?(ActionController::Parameters)
    saved = saved.is_a?(Hash) ? saved : {}
    builder = if saved["builder"].is_a?(Hash)
                saved["builder"]
              elsif legacy_filters_present?(saved)
                legacy_builder_from(saved)
              else
                {}
              end
    {
      q: saved["q"].to_s.strip,
      sort: saved["sort"].to_s.strip,
      assigned_to_id: saved["assigned_to_id"].to_s.strip,
      builder: builder
    }
  end

  def save_advanced_filters(filters)
    settings = contact_table_settings
    payload = {
      "q" => filters[:q].to_s.strip,
      "sort" => filters[:sort].to_s.strip,
      "assigned_to_id" => filters[:assigned_to_id].to_s.strip,
      "builder" => filters[:builder].is_a?(Hash) ? filters[:builder] : parse_filters_json(filters[:builder])
    }
    settings.advanced_filters = payload
    settings.save!
  end

  def legacy_filters_present?(saved)
    saved["status"].present? ||
      saved["source"].present? ||
      saved["tag"].present? ||
      saved["assigned_to_id"].present? ||
      saved["points_min"].present? ||
      saved["points_max"].present?
  end

  def legacy_builder_from(saved)
    rules = []
    rules << { "type" => "rule", "field" => "status", "operator" => "equals", "value" => saved["status"] } if saved["status"].present?
    rules << { "type" => "rule", "field" => "source", "operator" => "equals", "value" => saved["source"] } if saved["source"].present?
    rules << { "type" => "rule", "field" => "tags", "operator" => "contains", "value" => saved["tag"] } if saved["tag"].present?
    if saved["assigned_to_id"].present?
      rules << { "type" => "rule", "field" => "assigned_to_id", "operator" => "equals", "value" => saved["assigned_to_id"] }
    end
    rules << { "type" => "rule", "field" => "points", "operator" => "gte", "value" => saved["points_min"] } if saved["points_min"].present?
    rules << { "type" => "rule", "field" => "points", "operator" => "lte", "value" => saved["points_max"] } if saved["points_max"].present?
    { "op" => "and", "rules" => rules }
  end

  def build_filters
    requested = {
      q: params[:q].to_s.strip,
      sort: params[:sort].to_s.strip,
      assigned_to_id: params[:assigned_to_id].to_s.strip,
      builder: parse_filters_json(params[:filters_json])
    }

    if params[:apply].present?
      save_advanced_filters(requested)
      return requested
    end

    return requested if filters_present?(requested) || params[:page].present? || params[:per_page].present?

    saved = load_saved_filters
    return saved if filters_present?(saved)

    requested
  end

  def apply_filters(scope, filters)
    scoped = scope
    if filters[:q].present?
      needle = "%#{filters[:q].downcase}%"
      scoped = scoped.where(
        "LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(company) LIKE ?",
        needle, needle, needle, needle, needle
      )
    end
    if filters[:assigned_to_id].present?
      scoped = scoped.where(assigned_to_id: filters[:assigned_to_id].to_i)
    end
    builder = filters[:builder]
    return scoped if builder.blank?

    apply_advanced_filters(scoped, builder)
  end

  def parse_filters_json(value)
    return {} if value.blank?
    return value if value.is_a?(Hash)
    JSON.parse(value.to_s)
  rescue JSON::ParserError, TypeError
    {}
  end

  def apply_advanced_filters(scope, builder)
    rules = builder.is_a?(Hash) ? builder["rules"] : nil
    op = builder.is_a?(Hash) ? builder["op"].to_s.downcase : "and"
    rules = Array(rules)
    return scope if rules.empty?
    records = scope.to_a
    filtered = records.select do |contact|
      match_group?(contact, { "op" => op, "rules" => rules })
    end
    WhatsappContactProfile.where(id: filtered.map(&:id))
  end

  def match_group?(contact, group)
    op = group["op"].to_s.downcase == "or" ? "or" : "and"
    rules = Array(group["rules"])
    return true if rules.empty?
    results = rules.map do |rule|
      if rule["type"] == "group"
        match_group?(contact, rule)
      else
        match_rule?(contact, rule)
      end
    end
    op == "or" ? results.any? : results.all?
  end

  def match_rule?(contact, rule)
    field = rule["field"].to_s
    operator = rule["operator"].to_s
    value = rule["value"]
    raw = contact_field_value(contact, field, rule)
    compare_value(raw, operator, value)
  end

  def contact_field_value(contact, field, rule)
    return "" if contact.nil?
    return [contact.first_name, contact.last_name].join(" ").strip if field == "name"
    if field.start_with?("custom:")
      name = rule["custom_name"].to_s
      data = contact.custom_fields.is_a?(Hash) ? contact.custom_fields : {}
      return data[name]
    end
    return contact.tags.is_a?(Array) ? contact.tags : [] if field == "tags"
    return open_email_count_for(contact) if field == "open_email"
    contact.respond_to?(field) ? contact.public_send(field) : ""
  end

  def compare_value(raw, operator, value)
    op = operator.to_s
    return raw.present? if op == "is_not_blank"
    return raw.blank? if op == "is_blank"

    if raw.is_a?(Date) || raw.is_a?(Time) || raw.is_a?(ActiveSupport::TimeWithZone)
      parsed = begin
        Time.zone.parse(value.to_s)
      rescue StandardError
        nil
      end
      if parsed
        left_date = raw.to_date
        right_date = parsed.to_date
        return left_date == right_date if op == "equals"
        return left_date != right_date if op == "not_equals"
      end
    end

    return compare_array(raw, op, value) if raw.is_a?(Array)

    left = raw.to_s
    right = value.to_s
    case op
    when "equals"
      left.casecmp(right).zero?
    when "not_equals"
      !left.casecmp(right).zero?
    when "contains"
      left.downcase.include?(right.downcase)
    when "not_contains"
      !left.downcase.include?(right.downcase)
    when "starts_with"
      left.downcase.start_with?(right.downcase)
    when "ends_with"
      left.downcase.end_with?(right.downcase)
    when "gt", "gte", "lt", "lte"
      compare_numbers(raw, op, value)
    when "in", "not_in"
      list = right.split(",").map(&:strip).reject(&:blank?)
      match = list.any? { |item| left.casecmp(item).zero? }
      op == "in" ? match : !match
    else
      false
    end
  end

  def compare_numbers(raw, operator, value)
    if raw.is_a?(Date) || raw.is_a?(Time) || raw.is_a?(ActiveSupport::TimeWithZone)
      left_time = raw.to_time
      right_time = begin
        Time.zone.parse(value.to_s)
      rescue StandardError
        nil
      end
      return false if right_time.nil?
      case operator
      when "gt" then left_time > right_time
      when "gte" then left_time >= right_time
      when "lt" then left_time < right_time
      when "lte" then left_time <= right_time
      else false
      end
    end
    left = begin
      Float(raw)
    rescue StandardError
      nil
    end
    right = begin
      Float(value)
    rescue StandardError
      nil
    end
    return false if left.nil? || right.nil?
    case operator
    when "gt" then left > right
    when "gte" then left >= right
    when "lt" then left < right
    when "lte" then left <= right
    else false
    end
  end

  def compare_array(raw, operator, value)
    list = raw.map(&:to_s)
    needle = value.to_s
    case operator
    when "equals", "contains"
      list.any? { |item| item.casecmp(needle).zero? }
    when "not_equals", "not_contains"
      list.none? { |item| item.casecmp(needle).zero? }
    when "in", "not_in"
      targets = needle.split(",").map(&:strip).reject(&:blank?)
      match = targets.any? { |target| list.any? { |item| item.casecmp(target).zero? } }
      operator == "in" ? match : !match
    else
      false
    end
  end

  def open_email_count_for(contact)
    @advanced_filter_open_email_counts ||= EmailDelivery
                                           .where(project: @project)
                                           .where.not(contact_profile_id: nil)
                                           .group(:contact_profile_id)
                                           .sum(:open_count)

    @advanced_filter_open_email_counts[contact.id].to_i
  end

  def sort_order(filters)
    case filters[:sort]
    when "registration_date", "registration_date_desc"
      "created_at DESC"
    when "registration_date_asc"
      "created_at ASC"
    when "last_interaction", "last_interaction_desc"
      Arel.sql("COALESCE(last_interaction_at, updated_at) DESC")
    when "last_interaction_asc"
      Arel.sql("COALESCE(last_interaction_at, updated_at) ASC")
    when "points"
      "points DESC"
    when "name"
      "last_name ASC, first_name ASC"
    else
      "updated_at DESC"
    end
  end

  def apply_sort(scope, filters)
    case filters[:sort].to_s
    when "open_email_desc", "open_email_asc"
      direction = filters[:sort].to_s.end_with?("_asc") ? "ASC" : "DESC"
      counts_sql = EmailDelivery
                   .where(project_id: @project.id)
                   .where.not(contact_profile_id: nil)
                   .group(:contact_profile_id)
                   .select("contact_profile_id, COALESCE(SUM(open_count), 0) AS open_email_total")
                   .to_sql

      scope
        .joins("LEFT JOIN (#{counts_sql}) email_open_counts ON email_open_counts.contact_profile_id = whatsapp_contact_profiles.id")
        .order(Arel.sql("COALESCE(email_open_counts.open_email_total, 0) #{direction}, whatsapp_contact_profiles.updated_at DESC"))
    else
      scope.order(sort_order(filters))
    end
  end

  def paginate_contacts(scope)
    allowed_per_page = [10, 25, 50, 100, 300]
    per_page = params[:per_page].to_i
    page = params[:page].to_i
    per_page = 10 unless allowed_per_page.include?(per_page)
    page = 1 if page <= 0
    total = scope.count
    total_pages = (total.to_f / per_page).ceil
    page = total_pages if total_pages.positive? && page > total_pages
    offset = (page - 1) * per_page
    [
      scope.offset(offset).limit(per_page),
      {
        page: page,
        per_page: per_page,
        total: total,
        total_pages: total_pages,
        offset: offset
      }
    ]
  end

  def duplicates_for(scope, column)
    ids = scope.where.not(column => [nil, ""])
               .group(column)
               .having("COUNT(*) > 1")
               .pluck(column)
    scope.where(column => ids).group_by { |contact| contact.public_send(column).to_s }
  end

  def contact_params
    contact_input = params[:contact]
    tags_text_param_present = contact_input.respond_to?(:key?) && (contact_input.key?(:tags_text) || contact_input.key?("tags_text"))
    data = params.require(:contact).permit(
      :chat_id,
      :external_id,
      :first_name,
      :last_name,
      :email,
      :phone,
      :address,
      :city,
      :state,
      :country,
      :postal_code,
      :company,
      :job_title,
      :notes,
      :source,
      :status,
      :birthday,
      :assigned_to_id,
      :points,
      :last_interaction_at,
      :tags_text,
      tags: [],
      custom_fields: {}
    )
    if tags_text_param_present && (!data[:tags].is_a?(Array) || data[:tags].empty?)
      data[:tags] = normalize_contact_tags(data[:tags_text])
    elsif data[:tags].is_a?(Array)
      data[:tags] = normalize_contact_tags(data[:tags])
    end
    data.except(:tags_text)
  end

  def normalize_contact_tags(raw)
    seen = {}
    Array(raw).flat_map { |item| item.to_s.split(",") }.filter_map do |item|
      name = item.to_s.strip
      next if name.blank?

      key = name.downcase
      next if seen[key]

      seen[key] = true
      name
    end
  end

  def ensure_chat_for_contact(contact)
    return contact.chat if contact.chat.present?

    chat = nil
    if contact.chat_id.present?
      chat = WhatsappChat.find_by(id: contact.chat_id, project: @project)
    end

    external_id = normalize_whatsapp_id(contact.external_id)
    if chat.nil? && external_id.present?
      chat = WhatsappChat.find_by(project: @project, external_id: external_id)
    end

    if chat.nil? && contact.phone.present?
      external_id = normalize_whatsapp_id(contact.phone)
      external_id = normalize_phone_to_external_id(external_id) if external_id.present? && !external_id.include?("@")
      chat = WhatsappChat.find_by(project: @project, external_id: external_id) if external_id.present?
    end

    if chat.nil? && external_id.present?
      title = [contact.first_name.to_s.strip, contact.last_name.to_s.strip].reject(&:blank?).join(" ")
      title = contact.phone.to_s.strip if title.blank?
      title = external_id if title.blank?
      chat = WhatsappChat.create!(
        project: @project,
        title: title,
        chat_type: "direct",
        external_id: external_id
      )
    end

    if chat
      WhatsappChatParticipant.find_or_create_by!(chat: chat, user: (User.current || User.system)) do |participant|
        participant.joined_at = Time.current if participant.respond_to?(:joined_at=)
      end

      updates = {}
      updates[:chat_id] = chat.id if contact.chat_id.blank?
      updates[:external_id] = chat.external_id if contact.external_id.blank? && chat.external_id.present?
      contact.update_columns(updates) unless updates.empty?
    end

    chat
  end

  def normalize_whatsapp_id(value)
    raw = value.to_s.strip
    return "" if raw.empty?
    raw = raw.sub("@s.whatsapp.net", "@c.us")
    return raw unless raw.include?("@")
    local, domain = raw.split("@", 2)
    local = local.split(":", 2)[0]
    [local, domain].join("@")
  end

  def normalize_phone_to_external_id(value)
    digits = value.to_s.gsub(/\D/, "")
    return "" if digits.blank?
    "#{digits}@c.us"
  end

  def update_contacts_tag_name(old_name, new_name)
    WhatsappContactProfile.active.where(project: @project).find_each do |contact|
      tags = contact.tags.is_a?(Array) ? contact.tags : []
      next unless tags.any? { |tag| tag.to_s == old_name }
      updated = tags.map { |tag| tag.to_s == old_name ? new_name : tag.to_s }.uniq
      contact.update_column(:tags, updated)
    end
  end

  def remove_contacts_tag(name)
    WhatsappContactProfile.active.where(project: @project).find_each do |contact|
      tags = contact.tags.is_a?(Array) ? contact.tags : []
      next unless tags.any? { |tag| tag.to_s == name }
      updated = tags.reject { |tag| tag.to_s == name }
      contact.update_column(:tags, updated)
    end
  end

  def field_params
    data = params.require(:field).permit(:name, :field_type, :required, :position, :active, :visible_in_chat_card, :add_to_variables, :options_text, options: [])
    if data[:options_text].present? && (!data[:options].is_a?(Array) || data[:options].empty?)
      data[:options] = data[:options_text].to_s.split(",").map(&:strip).reject(&:blank?)
    end
    data.except(:options_text)
  end

  def contact_file_params
    params.require(:file).permit(:storage_id, :storage_file_id, :file_name, :file_size, :mime_type, :folder_id)
  end

  def serialize_contact_file(file)
    {
      id: file.id,
      storage_id: file.storage_id,
      storage_file_id: file.storage_file_id,
      file_name: file.file_name,
      file_size: file.file_size,
      mime_type: file.mime_type,
      folder_id: file.folder_id,
      created_at: file.created_at
    }
  end

  def read_import_rows(file)
    ext = File.extname(file.original_filename.to_s).downcase
    if ext == ".csv"
      CSV.read(file.path, headers: true).map(&:to_h)
    elsif ext == ".xlsx"
      begin
        require "roo"
      rescue LoadError
        return nil
      end
      sheet = Roo::Spreadsheet.open(file.path).sheet(0)
      headers = sheet.row(1).map(&:to_s)
      (2..sheet.last_row).map do |idx|
        row = sheet.row(idx)
        headers.each_with_index.to_h { |header, i| [header, row[i]] }
      end
    else
      nil
    end
  end

  def map_import_row(row, fields)
    normalized = {}
    mapping = {
      "first_name" => :first_name,
      "nombre" => :first_name,
      "last_name" => :last_name,
      "apellidos" => :last_name,
      "email" => :email,
      "telefono" => :phone,
      "phone" => :phone,
      "empresa" => :company,
      "company" => :company,
      "estado" => :status,
      "status" => :status,
      "origen" => :source,
      "source" => :source,
      "puntos" => :points,
      "points" => :points,
      "external_id" => :external_id,
      "tags" => :tags
    }
    custom = {}
    row.each do |key, value|
      next if key.nil?
      normalized_key = key.to_s.strip.downcase
      if normalized_key.start_with?("cf:")
        field_name = normalized_key.delete_prefix("cf:").strip
        field = fields[field_name]
        custom[field.name] = value if field
      elsif mapping[normalized_key]
        if mapping[normalized_key] == :tags
          normalized[:tags] = value.to_s.split(",").map(&:strip).reject(&:blank?)
          next
        end
        normalized[mapping[normalized_key]] = value
      end
    end
    normalized[:custom_fields] = custom if custom.any?
    normalized
  end

  def find_contact_for_import(attrs)
    if attrs[:external_id].present?
      WhatsappContactProfile.find_or_initialize_by(project: @project, external_id: attrs[:external_id].to_s)
    elsif attrs[:phone].present?
      WhatsappContactProfile.find_or_initialize_by(project: @project, phone: attrs[:phone].to_s)
    elsif attrs[:email].present?
      WhatsappContactProfile.find_or_initialize_by(project: @project, email: attrs[:email].to_s)
    else
      WhatsappContactProfile.new
    end
  end

  def base_headers
    %w[first_name last_name email phone company status source points external_id assigned_to_id last_interaction_at tags notes]
  end

  def build_row(contact, fields)
    base = [
      contact.first_name,
      contact.last_name,
      contact.email,
      contact.phone,
      contact.company,
      contact.status,
      contact.source,
      contact.points,
      contact.external_id,
      contact.assigned_to_id,
      contact.last_interaction_at,
      contact.tags.is_a?(Array) ? contact.tags.join(",") : "",
      contact.notes
    ]
    custom = fields.map do |field|
      values = contact.custom_fields.is_a?(Hash) ? contact.custom_fields : {}
      values[field.name]
    end
    base + custom
  end

  def format_contact_time(value)
    return "" if value.blank?
    time = time_in_project_zone(value)
    months = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ]
    month = months[time.month - 1] || time.strftime("%m")
    "#{time.strftime('%d')} #{month} #{time.strftime('%y')} #{time.strftime('%H:%M:%S')}"
  rescue StandardError
    value.to_s
  end

  def build_history_dashboard(rows)
    list = Array(rows)
    calls = list.reject { |row| row[:is_pause] }
    pauses = list.select { |row| row[:is_pause] }

    total_calls = calls.size
    unique_contact_keys = calls.map { |row| dashboard_contact_key(row) }.reject(&:blank?)
    unique_contacts = unique_contact_keys.uniq
    repeated_calls = [total_calls - unique_contacts.size, 0].max

    attempts_by_contact = Hash.new(0)
    unique_contact_keys.each { |key| attempts_by_contact[key] += 1 }
    avg_attempts = unique_contacts.any? ? (total_calls.to_f / unique_contacts.size) : 0.0

    total_call_seconds = calls.sum { |row| parse_call_duration_seconds(row[:duration]) }
    total_pause_seconds = pauses.sum { |row| parse_call_duration_seconds(row[:duration]) }
    total_dead_seconds = list.select { |row| row[:gap_dead_time_alert] == true }
                            .sum { |row| row[:gap_after_seconds].to_i }
    max_dead_seconds = list.map { |row| row[:gap_after_seconds].to_i }.max.to_i

    advanced_contact_keys = calls.select { |row| advancement_outcome?(row[:outcome]) }
                                .map { |row| dashboard_contact_key(row) }
                                .reject(&:blank?)
                                .uniq

    stalled_contacts = attempts_by_contact.count do |key, attempts|
      attempts >= 3 && !advanced_contact_keys.include?(key)
    end

    outcome_spec = [
      { key: "interesado", label: "Interesado", color: "success" },
      { key: "avanzo", label: "Avanzo la conversacion", color: "success" },
      { key: "aplazado", label: "Aplazado", color: "info" },
      { key: "no_contesta", label: "No contesta", color: "danger" },
      { key: "ocupado", label: "Ocupado", color: "danger" },
      { key: "numero_equivocado", label: "Numero equivocado", color: "danger" },
      { key: "no_interesado", label: "No interesado", color: "danger" }
    ]
    counts = outcome_spec.each_with_object({}) { |item, memo| memo[item[:key]] = 0 }
    calls.each do |row|
      key = classify_outcome_key(row[:outcome])
      next if key.blank?
      counts[key] = counts[key].to_i + 1
    end
    outcome_breakdown = outcome_spec.map do |item|
      count = counts[item[:key]].to_i
      percent = total_calls.positive? ? ((count.to_f * 100.0) / total_calls.to_f).round(1) : 0.0
      {
        key: item[:key],
        label: item[:label],
        count: count,
        percent: percent,
        color: item[:color]
      }
    end

    {
      total_calls: total_calls,
      unique_contacts: unique_contacts.size,
      repeated_calls: repeated_calls,
      avg_attempts_per_contact: avg_attempts.round(2),
      total_call_seconds: total_call_seconds,
      total_pause_seconds: total_pause_seconds,
      total_dead_seconds: total_dead_seconds,
      max_dead_seconds: max_dead_seconds,
      advanced_contacts: advanced_contact_keys.size,
      stalled_contacts: stalled_contacts,
      outcome_breakdown: outcome_breakdown
    }
  end

  def dashboard_contact_key(row)
    return "" unless row.is_a?(Hash)
    phone_digits = row[:phone].to_s.gsub(/\D/, "")
    return "phone:#{phone_digits}" if phone_digits.present?

    name = I18n.transliterate(row[:name].to_s.downcase.strip).gsub(/\s+/, " ")
    return "" if name.blank? || name == "-"
    "name:#{name}"
  rescue StandardError
    ""
  end

  def advancement_outcome?(outcome)
    text = normalize_outcome_key(outcome)
    text.include?("avanzo")
  end

  def dead_time_gap_alert?(outcome, gap_seconds)
    return false if gap_seconds.to_i < 120
    key = normalize_outcome_key(outcome)
    dead_time_outcome?(key)
  end

  def normalize_outcome_key(value)
    text = value.to_s.downcase.strip
    text = I18n.transliterate(text)
    text.gsub(/\s+/, " ")
  rescue StandardError
    value.to_s.downcase.strip
  end

  def dead_time_outcome?(key)
    value = key.to_s
    return false if value.blank?

    value.include?("ocupado") ||
      value.include?("no contesta") ||
      value.include?("numero equivocado") ||
      value.include?("no interesado")
  end

  def classify_outcome_key(outcome)
    key = normalize_outcome_key(outcome)
    return "" if key.blank?
    return "interesado" if key.include?("interesado") && !key.include?("no interesado")
    return "avanzo" if key.include?("avanzo")
    return "aplazado" if key.include?("aplazado")
    return "no_contesta" if key.include?("no contesta")
    return "ocupado" if key.include?("ocupado")
    return "numero_equivocado" if key.include?("numero equivocado")
    return "no_interesado" if key.include?("no interesado")

    ""
  end

  def selected_history_date
    raw = params[:history_date].to_s.strip
    if raw.present?
      parsed = begin
        Date.iso8601(raw)
      rescue StandardError
        nil
      end
      return parsed if parsed
    end

    tz = project_time_zone_name
    if tz.present?
      Time.use_zone(tz) { Time.zone.today }
    else
      Time.zone.today
    end
  end

  def history_day_range_utc(date)
    tz = project_time_zone_name
    if tz.present?
      start_at = Time.use_zone(tz) { Time.zone.local(date.year, date.month, date.day, 0, 0, 0) }
      end_at = Time.use_zone(tz) { Time.zone.local(date.year, date.month, date.day, 23, 59, 59) }
      [start_at.utc, end_at.utc]
    else
      [date.beginning_of_day, date.end_of_day]
    end
  rescue StandardError
    [date.beginning_of_day, date.end_of_day]
  end

  def project_time_zone_name
    @project_time_zone_name ||= begin
      project_tz = WhatsappProjectSetting.find_by(project: @project)&.time_zone.to_s.strip
      user_tz = User.current&.time_zone.to_s.strip
      project_tz.presence || user_tz.presence || Time.zone&.name.to_s.presence
    end
  end

  def time_in_project_zone(value)
    return value if value.blank?
    tz = project_time_zone_name
    return value if tz.blank?

    value.in_time_zone(tz)
  rescue StandardError
    value
  end
end
