class WhatsappController < ApplicationController
  before_action :find_project_by_project_id
  before_action :authorize
  skip_before_action :find_project_by_project_id, only: [:waha_webhook]
  skip_before_action :authorize, only: [:waha_webhook]
  skip_before_action :verify_authenticity_token, only: [:waha_webhook]
  skip_before_action :require_login, only: [:waha_webhook], raise: false
  skip_before_action :check_if_login_required, only: [:waha_webhook], raise: false
  helper_method :chat_unread_count
  helper_method :format_time
  helper_method :format_time_full
  helper_method :time_zone_country_map

  require "cgi"
  require "base64"
  require "net/http"
  require "uri"
  require "fileutils"

  def index
    if request.format.json?
      raise ActiveRecord::RecordNotFound if params[:chat_id].blank?
      @active_chat = visible_chats_scope.find_by!(id: params[:chat_id])
      @messages, @has_more_messages, @oldest_message_id = fetch_messages(@active_chat)
      media_bytes = chat_media_bytes(@active_chat)
      last_message = @active_chat.messages.max_by(&:created_at)
      preview = last_message ? preview_for_message(last_message) : "Sin mensajes"
      time_label = format_time(@active_chat.last_message_at || @active_chat.created_at)
      time_full = format_time_full(@active_chat.last_message_at || @active_chat.created_at)
      render json: {
        chat: {
          id: @active_chat.id,
          external_id: @active_chat.external_id.to_s,
          title: truncate_chat_title(@active_chat.title.presence || "Chat"),
          initials: chat_initials(@active_chat),
          last_message_at: time_full,
          time_label: time_label,
          preview: preview,
          unread_count: chat_unread_count(@active_chat),
          conversation_status: chat_conversation_status(@active_chat),
          media_bytes: media_bytes,
          media_label: format_media_size(media_bytes),
          ia_flow_id: chat_ia_flow_id(@active_chat)
        },
        messages: @messages.map { |message| serialize_message(message) },
        has_more: @has_more_messages,
        oldest_id: @oldest_message_id,
        load_url: whatsapp_plugin_project_whatsapp_path(@project, chat_id: @active_chat.id)
      }
      return
    end

    @chats = visible_chats_scope
                         .order(last_message_at: :desc, created_at: :desc)
                         .includes(:messages)
                         .limit(25)
    plugin_settings = Setting.plugin_openproject_whatsapp || {}
    @waha_url = plugin_settings["waha_url"]
    realtime_enabled = plugin_settings.key?("realtime_enabled") ? plugin_settings["realtime_enabled"] : true
    @realtime_enabled = realtime_enabled.to_s == "true" || realtime_enabled == true
    @project_settings = WhatsappProjectSetting.find_or_initialize_by(project: @project)
    @wp_statuses = Status
      .joins("INNER JOIN work_packages ON work_packages.status_id = statuses.id")
      .where("work_packages.project_id = ?", @project.id)
      .distinct
      .order(:position, :id)
    @total_project_media_bytes = project_media_bytes
    @contact_fields = WhatsappContactField.where(project: @project, active: true).order(:position, :name)
    @tag_map = WhatsappContactTag.map_for_project(@project)
    @tags_admin = User.current.admin?
    @wa_responsible_options = @project.users
                                   .where(type: "User")
                                   .select(:id, :firstname, :lastname, :login)
                                   .distinct
                                   .order(:lastname, :firstname)
                                   .map do |user|
      display_name = [user.firstname.to_s.strip, user.lastname.to_s.strip].reject(&:blank?).join(" ").strip
      display_name = user.login.to_s.strip if display_name.blank?
      { id: user.id, name: display_name }
    end
    @whatsapp_templates = WhatsappTemplate.where(project: @project, active: true).order(updated_at: :desc, name: :asc)
    @macro_flows = FlowDefinition.where(project: @project).order(updated_at: :desc).map do |flow|
      macro_node = macro_node_for_flow(flow)
      next unless macro_node
      {
        id: flow.id,
        name: flow.name.to_s,
        macro_node_id: (macro_node["id"] || macro_node[:id]).to_s
      }
    end.compact
    @ia_flows = FlowDefinition.where(project: @project).order(updated_at: :desc).map do |flow|
      ia_node = ia_node_for_flow(flow)
      next unless ia_node
      {
        id: flow.id,
        name: flow.name.to_s,
        ia_node_id: (ia_node["id"] || ia_node[:id]).to_s
      }
    end.compact

    if @chats.empty?
      @chats = []
    end

    @active_chat = if params[:chat_id].present?
                     @chats.find { |chat| chat.id == params[:chat_id].to_i }
                   end

    if @active_chat
      @messages, @has_more_messages, @oldest_message_id = fetch_messages(@active_chat)
      @active_chat_media_bytes = chat_media_bytes(@active_chat)
    else
      @messages = []
      @has_more_messages = false
      @oldest_message_id = nil
      @active_chat_media_bytes = 0
    end

    return render layout: "whatsapp_embedded" if params[:embedded].to_s == "1"
  end

  def create_template
    template = WhatsappTemplate.new(whatsapp_template_params.merge(project: @project))
    template.created_by = User.current if template.respond_to?(:created_by=)
    template.updated_by = User.current if template.respond_to?(:updated_by=)
    redirect_target = whatsapp_plugin_project_whatsapp_path(@project, wa_tab: "templates")
    upload = params.dig(:template, :media_file)
    if upload.present? && !validate_video_template_size!(template.template_type, upload, template)
      redirect_to redirect_target, alert: template.errors.full_messages.join(", ")
      return
    end
    if upload.blank? && !validate_video_template_url_size!(template.template_type, template.media_url, template)
      redirect_to redirect_target, alert: template.errors.full_messages.join(", ")
      return
    end
    if template.save
      store_whatsapp_template_media(template, upload)
      apply_whatsapp_template_media_url(template)
      redirect_to redirect_target, notice: "Plantilla creada."
    else
      redirect_to redirect_target, alert: template.errors.full_messages.join(", ")
    end
  end

  def update_template
    template = WhatsappTemplate.where(project: @project).find(params[:id])
    template.updated_by = User.current if template.respond_to?(:updated_by=)
    redirect_target = whatsapp_plugin_project_whatsapp_path(@project, wa_tab: "templates")
    upload = params.dig(:template, :media_file)
    intended_type = params.dig(:template, :template_type).presence || template.template_type
    if upload.present? && !validate_video_template_size!(intended_type, upload, template)
      redirect_to redirect_target, alert: template.errors.full_messages.join(", ")
      return
    end
    if upload.blank? && !validate_video_template_url_size!(intended_type, params.dig(:template, :media_url), template)
      redirect_to redirect_target, alert: template.errors.full_messages.join(", ")
      return
    end
    if template.update(whatsapp_template_params)
      if upload.present?
        store_whatsapp_template_media(template, upload)
      else
        apply_whatsapp_template_media_url(template)
      end
      redirect_to redirect_target, notice: "Plantilla actualizada."
    else
      redirect_to redirect_target, alert: template.errors.full_messages.join(", ")
    end
  end

  def destroy_template
    template = WhatsappTemplate.where(project: @project).find(params[:id])
    template.update_columns(active: false, updated_at: Time.current)
    if request.xhr?
      @whatsapp_templates = WhatsappTemplate.where(project: @project, active: true).order(updated_at: :desc, name: :asc)
      render partial: "whatsapp/templates_panel"
    else
      redirect_to whatsapp_plugin_project_whatsapp_path(@project, wa_tab: "templates"), notice: "Plantilla eliminada."
    end
  end

  def work_package_chat
    relation = WhatsappWorkPackageRelation
      .where(project: @project, work_package_id: params[:id])
      .order(created_at: :desc)
      .first

    chat = relation&.chat
    if chat.nil? && relation&.contact_profile
      chat = relation.contact_profile.chat
    end

    unless chat
      render json: { ok: false, chat_id: nil, error: "Sin chat relacionado." }, status: :not_found
      return
    end

    render json: {
      ok: true,
      chat_id: chat.id,
      chat_external_id: chat.external_id.to_s,
      url: whatsapp_plugin_project_whatsapp_path(@project, chat_id: chat.id)
    }
  end

  def template_media
    template = WhatsappTemplate.where(project: @project).find(params[:id])
    path = template.storage_path.to_s
    if path.blank? || !File.exist?(path)
      render json: { error: "Sin media." }, status: :not_found
      return
    end
    send_file path,
              filename: template.file_name.to_s.presence || "archivo",
              type: template.content_type.to_s.presence || "application/octet-stream",
              disposition: "inline"
  end

  def search_chats
    query = params[:q].to_s.strip
    statuses = params[:statuses].to_s.split(",").map { |v| v.to_i }.select { |v| v > 0 }
    tags_filter = params[:tags].to_s.split(",").map { |v| v.strip }.reject(&:blank?)
    limit = params[:limit].to_i
    offset = params[:offset].to_i
    limit = 25 if limit <= 0
    limit = 200 if limit > 200
    offset = 0 if offset < 0
    scope = visible_chats_scope.left_joins(:contact_profile, :messages)
    Rails.logger.info("[WAHA] search_chats q='#{query}' filter='#{params[:filter]}'")
    if params[:filter].to_s == "favorites"
      scope = scope.where(favorite: true)
    elsif params[:filter].to_s == "unread"
      scope = scope.where("COALESCE((whatsapp_chats.metadata->>'unread_count')::integer, 0) > 0")
    end
    if statuses.any?
      scope = scope.joins(
        "LEFT JOIN whatsapp_work_package_relations wpr ON " \
        "wpr.project_id = whatsapp_chats.project_id AND " \
        "(wpr.chat_id = whatsapp_chats.id OR wpr.contact_profile_id = whatsapp_contact_profiles.id)"
      ).joins(
        "LEFT JOIN work_packages wp ON wp.id = wpr.work_package_id"
      ).where("wp.status_id IN (?)", statuses).distinct
    end
    if query.present?
      needle = "%#{query.downcase}%"
      digits = query.gsub(/\D/, "")
      scope = scope.where(
        "LOWER(whatsapp_chats.title) LIKE ? OR " \
        "LOWER(whatsapp_contact_profiles.first_name) LIKE ? OR " \
        "LOWER(whatsapp_contact_profiles.last_name) LIKE ? OR " \
        "LOWER(whatsapp_contact_profiles.phone) LIKE ? OR " \
        "LOWER(whatsapp_contact_profiles.email) LIKE ? OR " \
        "LOWER(whatsapp_messages.body) LIKE ? OR " \
        "LOWER(whatsapp_chats.external_id) LIKE ?",
        needle,
        needle,
        needle,
        needle,
        needle,
        needle,
        needle
      )
      if digits.present?
        digits_needle = "%#{digits}%"
        digits_scope = visible_chats_scope
                       .left_joins(:contact_profile, :messages)
                       .where(
                         "REGEXP_REPLACE(whatsapp_contact_profiles.phone, '\\\\D', '', 'g') LIKE ? OR " \
                         "REGEXP_REPLACE(whatsapp_chats.external_id, '\\\\D', '', 'g') LIKE ?",
                         digits_needle,
                         digits_needle
                       )
        scope = scope.or(digits_scope)
      end
    end

      sort_sql = "COALESCE(whatsapp_chats.last_message_at, whatsapp_chats.created_at)"
      order_last = Arel.sql("#{sort_sql} DESC")
      order_created = Arel.sql("whatsapp_chats.created_at DESC")
      ids = scope.reselect("whatsapp_chats.id, whatsapp_chats.last_message_at, whatsapp_chats.created_at, #{sort_sql} AS sort_ts")
                 .distinct
                 .order(order_last)
                 .order(order_created)
                 .map(&:id)
    if tags_filter.any?
      tagged = WhatsappChat.where(id: ids).includes(:contact_profile)
      ids = tagged.select do |chat|
        profile_tags = Array(chat.contact_profile&.tags).map { |tag| tag.to_s.strip }.reject(&:blank?)
        (profile_tags & tags_filter).any?
      end.map(&:id)
    end
    ids = ids.drop(offset).first(limit)
    chat_records = WhatsappChat.where(id: ids)
                               .includes(:messages, :contact_profile)
                               .index_by(&:id)
    ordered_chats = ids.map { |id| chat_records[id] }.compact
    chat_ids = ordered_chats.map(&:id)
    contact_to_chat = ordered_chats.each_with_object({}) do |chat, map|
      profile_id = chat.contact_profile&.id
      map[profile_id] = chat.id if profile_id.present?
    end
    contact_ids = contact_to_chat.keys

    wp_status_by_chat = {}
    if chat_ids.any? || contact_ids.any?
      relations = WhatsappWorkPackageRelation
        .where(project: @project)
        .where("chat_id IN (?) OR contact_profile_id IN (?)", chat_ids.presence || [0], contact_ids.presence || [0])
        .includes(work_package: :status)
        .order(created_at: :desc)

      relations.each do |relation|
        target_chat_id = relation.chat_id.presence || contact_to_chat[relation.contact_profile_id]
        next unless target_chat_id
        next if wp_status_by_chat.key?(target_chat_id)

        work_package = relation.work_package
        status = work_package&.status
        next unless work_package && status

        wp_status_by_chat[target_chat_id] = {
          work_package_id: work_package.id,
          wp_status_id: status.id,
          wp_status_name: status.name.to_s,
          wp_status_color: status.color&.hexcode.to_s
        }
      end
    end

    chats = ordered_chats.map do |chat|
      profile = chat.contact_profile
      last_message = chat.messages.max_by(&:created_at)
      preview = last_message&.body.to_s
      preview = preview.present? ? truncate_preview(preview) : "Sin mensajes"
      tags = Array(profile&.tags).map { |tag| tag.to_s.strip }.reject(&:blank?)
      wp_meta = wp_status_by_chat[chat.id] || {}
      {
        id: chat.id,
        external_id: chat.external_id.to_s,
        title: truncate_chat_title(chat.title.to_s.presence || "Chat"),
        initials: chat_initials(chat),
        preview: preview,
        time_label: format_time(chat.last_message_at || chat.created_at),
        unread_count: chat_unread_count(chat),
        conversation_status: chat_conversation_status(chat),
        favorite: chat.favorite,
        phone: formatted_profile_phone(profile, chat.external_id),
        email: profile&.email,
        tags: tags,
        ia_flow_id: chat_ia_flow_id(chat),
        work_package_id: wp_meta[:work_package_id],
        wp_status_id: wp_meta[:wp_status_id],
        wp_status_name: wp_meta[:wp_status_name],
        wp_status_color: wp_meta[:wp_status_color]
      }
    end

      if chats.any?
        first = chats.first
        Rails.logger.info("[WAHA] search_chats.top id=#{first[:id]} time_label=#{first[:time_label]} unread=#{first[:unread_count]}")
        begin
          top_ids = visible_chats_scope
                                .order(order_last)
                                .order(order_created)
                                .limit(5)
                                .pluck(:id, :last_message_at, :created_at)
          Rails.logger.info("[WAHA] search_chats.db_top #{top_ids.inspect}")
        rescue StandardError => error
          Rails.logger.info("[WAHA] search_chats.db_top.error #{error.class}: #{error.message}")
        end
      end
      render json: { chats: chats }
  end

  def media_files
    allowed_types = %w[image video audio file]
    selected_types = params[:types].to_s.split(",").map(&:strip).select { |type| allowed_types.include?(type) }
    selected_types = allowed_types if selected_types.empty?
    selected_direction = params[:direction].to_s
    selected_chat_id = params[:chat_id].to_i

    scope = WhatsappMessage.joins(:chat)
                           .where(whatsapp_chats: { project_id: @project.id })
                           .where(
                             "whatsapp_messages.message_type IN (?) OR " \
                             "COALESCE((whatsapp_messages.metadata->>'file_size')::bigint, 0) > 0 OR " \
                             "COALESCE(whatsapp_messages.metadata->>'data_url', '') <> '' OR " \
                             "COALESCE(whatsapp_messages.metadata->>'remote_url', '') <> ''",
                             allowed_types
                           )
    scope = scope.where(chat_id: selected_chat_id) if selected_chat_id.positive?
    if selected_direction == "incoming"
      scope = scope.where(sender_user_id: nil)
    elsif selected_direction == "outgoing"
      scope = scope.where.not(sender_user_id: nil)
    end

    messages = scope.includes(:chat, :sender_user, :sender_contact)
                    .order(created_at: :desc, id: :desc)
                    .to_a
    message_ids = messages.map(&:id)
    file_sizes = media_file_sizes_by_message(message_ids)

    items = messages.filter_map do |message|
      metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
      inferred_type = infer_media_type_for_message(message)
      next nil unless selected_types.include?(inferred_type)
      file_size = file_sizes[message.id].to_i
      sender_name =
        if message.sender_user.present?
          message.sender_user.name.to_s
        elsif message.sender_contact.present?
          message.sender_contact.name.to_s
        elsif metadata["from_me"] == true
          "Agente"
        else
          "Contacto"
        end

      {
        id: message.id,
        name: media_filename_for(message),
        message_type: inferred_type,
        type_label: media_type_label_for(inferred_type),
        size_bytes: file_size,
        size_label: format_media_size(file_size),
        chat_id: message.chat_id,
        chat_title: message.chat&.title.to_s.presence || "Chat ##{message.chat_id}",
        created_at: format_time_full(message.created_at),
        sender_label: sender_name.presence || "Contacto",
        media_url: whatsapp_plugin_project_whatsapp_message_media_path(@project, id: message.id)
      }
    end

    chat_options = WhatsappChat.where(project: @project)
                               .order(last_message_at: :desc, created_at: :desc)
                               .pluck(:id, :title)
                               .map { |id, title| { id: id, title: title.to_s.presence || "Chat ##{id}" } }

    render json: {
      items: items,
      filters: {
        types: selected_types,
        direction: selected_direction,
        chat_id: selected_chat_id.positive? ? selected_chat_id : nil
      },
      chats: chat_options,
      total_media_label: format_media_size(project_media_bytes)
    }
  end

  def destroy_media_file
    message = WhatsappMessage.joins(:chat)
                             .where(whatsapp_chats: { project_id: @project.id })
                             .where(
                               "whatsapp_messages.message_type IN (?) OR " \
                               "COALESCE((whatsapp_messages.metadata->>'file_size')::bigint, 0) > 0 OR " \
                               "COALESCE(whatsapp_messages.metadata->>'data_url', '') <> '' OR " \
                               "COALESCE(whatsapp_messages.metadata->>'remote_url', '') <> ''",
                               %w[image video audio file]
                             )
                             .find_by(id: params[:id])
    unless message
      render json: { error: "Archivo no encontrado." }, status: :not_found
      return
    end

    chat = message.chat
    message.destroy!
    refresh_chat_last_message_at!(chat)

    render json: {
      ok: true,
      id: params[:id].to_i,
      total_media_label: format_media_size(project_media_bytes)
    }
  end

  def bulk_destroy_media_files
    ids = Array(params[:ids]).map(&:to_i).select(&:positive?).uniq
    if ids.empty?
      render json: { error: "No se recibieron archivos." }, status: :unprocessable_entity
      return
    end

    messages = WhatsappMessage.joins(:chat)
                              .where(whatsapp_chats: { project_id: @project.id })
                              .where(
                                "whatsapp_messages.message_type IN (?) OR " \
                                "COALESCE((whatsapp_messages.metadata->>'file_size')::bigint, 0) > 0 OR " \
                                "COALESCE(whatsapp_messages.metadata->>'data_url', '') <> '' OR " \
                                "COALESCE(whatsapp_messages.metadata->>'remote_url', '') <> ''",
                                %w[image video audio file]
                              )
                              .where(id: ids)
    chat_ids = messages.pluck(:chat_id).compact.uniq
    deleted_count = messages.delete_all

    WhatsappChat.where(id: chat_ids).find_each do |chat|
      refresh_chat_last_message_at!(chat)
    end

    render json: {
      ok: true,
      deleted_count: deleted_count,
      total_media_label: format_media_size(project_media_bytes)
    }
  end

  def toggle_favorite
    chat = WhatsappChat.find_by!(id: params[:id], project: @project)
    desired = params[:favorite].to_s == "true"
    chat.update!(favorite: desired)

    render json: { favorite: chat.favorite }
  end

  def update_ai_flow
    chat = WhatsappChat.find_by!(id: params[:id], project: @project)
    flow_id = params[:flow_id].to_s
    flow_id = nil if flow_id.blank?

    if flow_id.present?
      flow = FlowDefinition.find_by(id: flow_id, project: @project)
      ia_node = flow ? ia_node_for_flow(flow) : nil
      unless ia_node
        render json: { ok: false, error: "Flujo IA no encontrado." }, status: :unprocessable_entity
        return
      end
    end

    meta = chat.metadata.is_a?(Hash) ? chat.metadata : {}
    meta["ia_flow_id"] = flow_id
    chat.update!(metadata: meta)

    render json: { ok: true, chat_id: chat.id, ia_flow_id: flow_id }
  end

  def create_message
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    chat_id = normalize_chat_external_id(chat)
    reply_to = params[:reply_to].to_s.presence

    message = chat.messages.new(message_params)
    message.sender_user = User.current
    message.message_type = "text"
    message.status = "sent"
    message.metadata = { "reply_to" => reply_to } if reply_to.present?
    message.save!

    chat.update!(last_message_at: message.created_at)

    session_name = WhatsappProjectSetting.find_by(project: @project)&.session_name.to_s
    if session_name.present? && chat_id.present?
      Rails.logger.info("[WAHA] sendText chat=#{chat_id} session=#{session_name}")
      response = waha_request(
        "/api/sendText",
        :post,
        {
          chatId: chat_id,
          reply_to: reply_to,
          text: message.body.to_s,
          linkPreview: true,
          linkPreviewHighQuality: false,
          session: session_name
        }
      )
      Rails.logger.info("[WAHA] sendText response status=#{response[:status]}")
      if response[:status].to_i >= 200 && response[:status].to_i < 300
        metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
        waha_id = extract_waha_id(response[:json])
        metadata["waha_id"] = waha_id if waha_id.present?
        metadata["waha"] = response[:json] if response[:json].present?
        metadata["reply_to"] = reply_to if reply_to.present?
        message.update!(metadata: metadata)
      else
        message.update!(status: "failed")
      end
    end

    respond_to do |format|
      format.html do
        redirect_to action: :index, project_id: @project.id, chat_id: chat.id
      end
      format.json do
        metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
        render json: {
          id: message.id,
          body: message.body,
          created_at: format_time(message.created_at),
          sender_label: "",
          outgoing: true,
          message_type: message.message_type,
          waha_id: metadata["waha_id"],
          reply_to: metadata["reply_to"],
          media_id: message.id
        }
      end
    end
  end

  def start_typing
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    session_name = WhatsappProjectSetting.find_by(project: @project)&.session_name.to_s
    chat_id = normalize_chat_external_id(chat)
    if session_name.blank? || chat_id.blank?
      render json: { error: "Falta la sesion o el chat." }, status: :unprocessable_entity
      return
    end

    response = waha_request(
      "/api/startTyping",
      :post,
      { chatId: chat_id, session: session_name }
    )
    render_waha_response(response)
  end

  def stop_typing
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    session_name = WhatsappProjectSetting.find_by(project: @project)&.session_name.to_s
    chat_id = normalize_chat_external_id(chat)
    if session_name.blank? || chat_id.blank?
      render json: { error: "Falta la sesion o el chat." }, status: :unprocessable_entity
      return
    end

    response = waha_request(
      "/api/stopTyping",
      :post,
      { chatId: chat_id, session: session_name }
    )
    render_waha_response(response)
  end

  def create_image_message
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    data_url = params[:data_url].to_s
    thumb_data_url = params[:thumb_data_url].to_s
    filename = params[:filename].to_s.presence || "imagen"
    content_type = params[:content_type].to_s.presence || "image/jpeg"
    caption = params[:caption].to_s
    reply_to = params[:reply_to].to_s.presence

    if data_url.blank?
      render json: { error: "Falta la imagen." }, status: :unprocessable_entity
      return
    end

    base64 = data_url.split(",", 2)[1].to_s
    if base64.blank?
      render json: { error: "Imagen invalida." }, status: :unprocessable_entity
      return
    end

    message = chat.messages.new(body: caption)
    message.sender_user = User.current
    message.message_type = "image"
    message.status = "sent"
    file_size = params[:file_size].to_i
    message.metadata = {
      data_url: data_url,
      thumb_data_url: thumb_data_url.presence || data_url,
      filename: filename,
      content_type: content_type,
      file_size: file_size,
      reply_to: reply_to
    }
    message.save!

    chat.update!(last_message_at: message.created_at)

    session_name = WhatsappProjectSetting.find_by(project: @project)&.session_name.to_s
    chat_id = normalize_chat_external_id(chat)
    if session_name.present? && chat_id.present?
      Rails.logger.info("[WAHA] sendImage chat=#{chat_id} session=#{session_name}")
      response = waha_request(
        "/api/sendImage",
        :post,
        {
          chatId: chat_id,
          file: {
            mimetype: content_type,
            filename: filename,
            data: base64
          },
          reply_to: reply_to,
          caption: caption,
          session: session_name
        }
      )
      Rails.logger.info("[WAHA] sendImage response status=#{response[:status]}")
      if response[:status].to_i >= 200 && response[:status].to_i < 300
        metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
        waha_id = extract_waha_id(response[:json])
        metadata["waha_id"] = waha_id if waha_id.present?
        metadata["waha"] = response[:json] if response[:json].present?
        message.update!(metadata: metadata)
      else
        message.update!(status: "failed")
      end
    end

    metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
    render json: {
      id: message.id,
      body: message.body.to_s,
      created_at: format_time(message.created_at),
      sender_label: "",
      outgoing: true,
      message_type: message.message_type,
      reply_to: reply_to,
      waha_id: metadata["waha_id"],
      media_id: message.id,
      data_url: data_url,
      thumb_data_url: thumb_data_url.presence || data_url,
      filename: filename,
      media_bytes: chat_media_bytes(chat),
      media_label: format_media_size(chat_media_bytes(chat)),
      total_media_label: format_media_size(project_media_bytes)
    }
  end

  def create_video_message
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    data_url = params[:data_url].to_s
    filename = params[:filename].to_s.presence || "video"
    content_type = params[:content_type].to_s.presence || "video/mp4"
    caption = params[:caption].to_s
    reply_to = params[:reply_to].to_s.presence

    if data_url.blank?
      render json: { error: "Falta el video." }, status: :unprocessable_entity
      return
    end

    base64 = data_url.split(",", 2)[1].to_s
    if base64.blank?
      render json: { error: "Video invalido." }, status: :unprocessable_entity
      return
    end

    message = chat.messages.new(body: caption)
    message.sender_user = User.current
    message.message_type = "video"
    message.status = "sent"
    file_size = params[:file_size].to_i
    message.metadata = {
      data_url: data_url,
      filename: filename,
      content_type: content_type,
      file_size: file_size,
      reply_to: reply_to
    }
    message.save!

    chat.update!(last_message_at: message.created_at)

    session_name = WhatsappProjectSetting.find_by(project: @project)&.session_name.to_s
    chat_id = normalize_chat_external_id(chat)
    if session_name.present? && chat_id.present?
      Rails.logger.info("[WAHA] sendVideo chat=#{chat_id} session=#{session_name}")
      response = waha_request(
        "/api/sendVideo",
        :post,
        {
          chatId: chat_id,
          file: {
            mimetype: content_type,
            filename: filename,
            data: base64
          },
          reply_to: reply_to,
          asNote: false,
          convert: true,
          caption: caption,
          session: session_name
        }
      )
      Rails.logger.info("[WAHA] sendVideo response status=#{response[:status]} body=#{response[:json].inspect}")
      if response[:status].to_i >= 200 && response[:status].to_i < 300
        metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
        waha_id = extract_waha_id(response[:json])
        metadata["waha_id"] = waha_id if waha_id.present?
        metadata["waha"] = response[:json] if response[:json].present?
        message.update!(metadata: metadata)
      else
        message.update!(status: "failed")
      end
    end

    metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
    render json: {
      id: message.id,
      body: message.body.to_s,
      created_at: format_time(message.created_at),
      sender_label: "",
      outgoing: true,
      message_type: message.message_type,
      reply_to: reply_to,
      waha_id: metadata["waha_id"],
      media_id: message.id,
      data_url: data_url,
      filename: filename,
      media_bytes: chat_media_bytes(chat),
      media_label: format_media_size(chat_media_bytes(chat)),
      total_media_label: format_media_size(project_media_bytes)
    }
  end

  def create_activity_note
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    note = params[:note].to_s.strip

    if note.blank?
      render json: { error: "Mensaje vacío." }, status: :unprocessable_entity
      return
    end

    unless User.current.allowed_in_project?(:view_whatsapp, @project)
      render json: { error: "No autorizado." }, status: :forbidden
      return
    end

    profile = contact_profile_for_chat(chat)
    relations = WhatsappWorkPackageRelation.where(project: @project)
    relations =
      if profile
        relations.where("contact_profile_id = ? OR chat_id = ?", profile.id, chat.id)
      else
        relations.where(chat_id: chat.id)
      end

    work_packages = relations.includes(:work_package).map(&:work_package).compact.uniq { |wp| wp.id }
    created_ids = []
    skipped_ids = []

    work_packages.each do |work_package|
      unless User.current.allowed_in_project?(:add_work_package_comments, work_package.project)
        skipped_ids << work_package.id
        next
      end

      call = AddWorkPackageNoteService
        .new(user: User.current, work_package: work_package)
        .call(note, send_notifications: true, internal: false)

      if call.success?
        created_ids << work_package.id
      else
        skipped_ids << work_package.id
      end
    end

    message = chat.messages.new(body: note)
    message.sender_user = User.current
    message.message_type = "activity"
    message.status = "sent"
    message.metadata = { from_me: true }
    message.save!

    chat.update!(last_message_at: message.created_at)

    render json: serialize_message(message).merge(
      created: true,
      work_package_ids: created_ids,
      skipped_work_package_ids: skipped_ids,
      work_package_count: created_ids.size
    )
  end

  def create_file_message
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    data_url = params[:data_url].to_s
    filename = params[:filename].to_s.presence || "archivo"
    content_type = params[:content_type].to_s.presence || "application/octet-stream"
    caption = params[:caption].to_s
    reply_to = params[:reply_to].to_s.presence

    if data_url.blank?
      render json: { error: "Falta el archivo." }, status: :unprocessable_entity
      return
    end

    base64 = data_url.split(",", 2)[1].to_s
    if base64.blank?
      render json: { error: "Archivo invalido." }, status: :unprocessable_entity
      return
    end

    send_voice = voice_note_file?(content_type, filename)
    message = chat.messages.new(body: send_voice ? "" : caption)
    message.sender_user = User.current
    message.message_type = send_voice ? "audio" : "file"
    message.status = "sent"
    file_size = params[:file_size].to_i
    message.metadata = {
      data_url: data_url,
      filename: filename,
      content_type: content_type,
      file_size: file_size,
      reply_to: reply_to
    }
    message.save!

    chat.update!(last_message_at: message.created_at)

    session_name = WhatsappProjectSetting.find_by(project: @project)&.session_name.to_s
    chat_id = normalize_chat_external_id(chat)
    if session_name.present? && chat_id.present?
      endpoint = send_voice ? "/api/sendVoice" : "/api/sendFile"
      Rails.logger.info("[WAHA] #{send_voice ? 'sendVoice' : 'sendFile'} chat=#{chat_id} session=#{session_name}")
      payload = {
        chatId: chat_id,
        file: {
          mimetype: content_type,
          filename: filename,
          data: base64
        },
        reply_to: reply_to,
        session: session_name
      }
      if send_voice
        payload[:convert] = true
      else
        payload[:caption] = caption
      end

      response = waha_request(endpoint, :post, payload)
      Rails.logger.info("[WAHA] #{send_voice ? 'sendVoice' : 'sendFile'} response status=#{response[:status]} body=#{response[:json].inspect}")
      if response[:status].to_i >= 200 && response[:status].to_i < 300
        metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
        waha_id = extract_waha_id(response[:json])
        metadata["waha_id"] = waha_id if waha_id.present?
        metadata["waha"] = response[:json] if response[:json].present?
        message.update!(metadata: metadata)
      else
        message.update!(status: "failed")
      end
    end

    metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
    render json: {
      id: message.id,
      body: message.body.to_s,
      created_at: format_time(message.created_at),
      sender_label: "",
      outgoing: true,
      message_type: message.message_type,
      reply_to: reply_to,
      waha_id: metadata["waha_id"],
      media_id: message.id,
      data_url: data_url,
      filename: filename,
      media_bytes: chat_media_bytes(chat),
      media_label: format_media_size(chat_media_bytes(chat)),
      total_media_label: format_media_size(project_media_bytes)
    }
  end

  def destroy_chat
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    Rails.logger.info("[WAHA] destroy_chat id=#{chat.id} external_id=#{chat.external_id}")
    chat.destroy!

    respond_to do |format|
      format.html { redirect_to action: :index, project_id: @project.id }
      format.json { render json: { deleted: true, chat_id: chat.id } }
    end
  end

  def contact_profile
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    profile = WhatsappContactProfile.find_by(project: @project, chat: chat)
    if profile.nil? && chat.external_id.present?
      profile = WhatsappContactProfile.find_by(project: @project, external_id: chat.external_id)
    end

    base = profile&.slice(
      "first_name",
      "last_name",
      "email",
      "phone",
      "address",
      "city",
      "state",
      "country",
      "postal_code",
      "company",
      "job_title",
      "notes",
      "tags",
      "source",
      "status",
      "birthday"
    ) || {}
    base["assigned_to_id"] = profile&.assigned_to_id
    base["assigned_to_name"] = profile&.assigned_to&.name.to_s
    base["conversation_status"] = chat_conversation_status(chat)
    base["custom_fields"] = profile&.custom_fields || {}
    render json: { profile: base, tag_map: WhatsappContactTag.map_for_project(@project) }
  end

  def upsert_contact_profile
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    Rails.logger.info("[WAHA] upsert_contact_profile chat_id=#{chat.id}")
    profile = WhatsappContactProfile.find_by(project: @project, chat: chat)
    if profile.nil? && chat.external_id.present?
      profile = WhatsappContactProfile.find_by(project: @project, external_id: chat.external_id)
    end
    contact_was_new = profile.nil? || profile.new_record?
    profile ||= WhatsappContactProfile.new(project: @project)
    profile.chat = chat
    profile.external_id = chat.external_id if chat.external_id.present?
    assigned_to_key_present = params.key?(:assigned_to_id) || params.key?("assigned_to_id")
    if assigned_to_key_present && !User.current.admin?
      render json: { saved: false, error: "Solo los administradores pueden cambiar el responsable." }, status: :forbidden
      return
    end

    conversation_status_key_present = params.key?(:conversation_status) || params.key?("conversation_status")
    if conversation_status_key_present
      conversation_status = normalize_conversation_status(params[:conversation_status])
      unless %w[started ended].include?(conversation_status)
        render json: { saved: false, error: "Estado de conversacion invalido." }, status: :unprocessable_entity
        return
      end
      chat_meta = chat.metadata.is_a?(Hash) ? chat.metadata.dup : {}
      chat_meta["conversation_status"] = conversation_status
      chat_meta["unread_count"] = 0 if conversation_status == "ended"
      chat.update!(metadata: chat_meta)
    end

    profile.assign_attributes(contact_profile_params.except(:assigned_to_id))
    if assigned_to_key_present
      assigned_to_raw = params[:assigned_to_id].to_s.strip
      if assigned_to_raw.blank?
        profile.assigned_to_id = nil
      else
        assigned_user = @project.users.where(type: "User").find_by(id: assigned_to_raw.to_i)
        unless assigned_user
          render json: { saved: false, error: "Responsable invalido para este proyecto." }, status: :unprocessable_entity
          return
        end
        profile.assigned_to_id = assigned_user.id
      end
    end
    if params.key?(:tags) || params.key?("tags")
      profile.tags = normalize_tags(params[:tags])
    end
    profile.custom_fields = merge_custom_fields(profile.custom_fields, params[:custom_fields])
    profile.save!
    WhatsappContactTag.ensure_for_project(@project, profile.tags)

    if profile.first_name.present?
      chat.update!(title: profile.first_name)
    end

    Whatsapp::AutoWorkPackageService
      .new(project: @project, contact_profile: profile, chat: chat, user: (User.current || User.system))
      .call(contact_was_new: contact_was_new)

    render json: {
      saved: true,
      title: truncate_chat_title(chat.title.to_s),
      tags: profile.tags,
      assigned_to_id: profile.assigned_to_id,
      assigned_to_name: profile.assigned_to&.name.to_s,
      conversation_status: chat_conversation_status(chat),
      tag_map: WhatsappContactTag.map_for_project(@project)
    }
  end

  def work_package_types
    unless User.current.allowed_in_project?(:view_work_packages, @project) ||
           User.current.allowed_in_project?(:add_work_packages, @project) ||
           User.current.allowed_in_project?(:view_whatsapp, @project)
      render json: { types: [] }
      return
    end

    types_scope = @project.types.order(:position)
    types_scope = Type.order(:position) if types_scope.empty?
    types = types_scope.map { |type| { id: type.id, name: type.name } }
    render json: { types: types }
  end

  def boards
    unless User.current.allowed_in_project?(:view_whatsapp, @project) ||
           User.current.allowed_in_project?(:show_board_views, @project) ||
           User.current.allowed_in_project?(:view_work_packages, @project)
      render json: { boards: [] }
      return
    end

    boards = Boards::Grid.where(project: @project).order(:name)
    items = boards.map do |board|
      {
        id: board.id,
        name: board.name.to_s,
        url: project_work_package_board_path(@project, board)
      }
    end

    render json: { boards: items }
  end

  def board_lists
    board = Boards::Grid.find_by!(id: params[:id], project: @project)
    unless User.current.allowed_in_project?(:view_whatsapp, @project) ||
           User.current.allowed_in_project?(:show_board_views, @project) ||
           User.current.allowed_in_project?(:view_work_packages, @project)
      render json: { lists: [] }
      return
    end

    query_ids = board.widgets.map { |w| w.options["queryId"] || w.options["query_id"] }.compact.map(&:to_i)
    queries = Query.where(id: query_ids).index_by(&:id)
    lists = query_ids.map do |qid|
      query = queries[qid]
      next unless query
      { id: query.id, name: query.name.to_s }
    end.compact

    render json: { lists: lists, board_id: board.id }
  end

  def board_add_card
    unless User.current.allowed_in_project?(:manage_board_views, @project) ||
           User.current.allowed_in_project?(:view_work_packages, @project) ||
           User.current.allowed_in_project?(:view_whatsapp, @project)
      render json: { error: "No autorizado." }, status: :forbidden
      return
    end

    board = Boards::Grid.find_by!(id: params[:board_id], project: @project)
    query_id = params[:query_id].to_i
    if query_id.zero?
      render json: { error: "Selecciona una lista." }, status: :unprocessable_entity
      return
    end

    work_package = WorkPackage.find_by(id: params[:work_package_id], project_id: @project.id)
    if work_package.nil?
      render json: { error: "Paquete no encontrado." }, status: :not_found
      return
    end

    query_ids = board.widgets.map { |w| w.options["queryId"] || w.options["query_id"] }.compact.map(&:to_i)
    unless query_ids.include?(query_id)
      render json: { error: "Lista no encontrada." }, status: :unprocessable_entity
      return
    end

    query = Query.find_by(id: query_id)
    if query.nil?
      render json: { error: "Lista no encontrada." }, status: :not_found
      return
    end

    chat = params[:chat_id].present? ? WhatsappChat.find_by(id: params[:chat_id], project: @project) : nil
    profile = chat ? contact_profile_for_chat(chat) : nil

    existing = query.ordered_work_packages.find_by(work_package_id: work_package.id)
    if existing
      relation = WhatsappBoardCardRelation.create!(
        project: @project,
        chat: chat,
        contact_profile: profile,
        board: board,
        query: query,
        work_package: work_package,
        created_by: User.current
      )
      render json: {
        added: true,
        id: relation.id,
        work_package_id: work_package.id,
        already: true,
        work_package_subject: work_package.subject.to_s,
        board_name: board.name.to_s,
        list_name: query.name.to_s,
        board_url: project_work_package_board_path(@project, board)
      }
      return
    end

    position = query.ordered_work_packages.maximum(:position)
    next_position = position ? position + 1 : 0
    query.ordered_work_packages.create!(work_package: work_package, position: next_position)
    relation = WhatsappBoardCardRelation.create!(
      project: @project,
      chat: chat,
      contact_profile: profile,
      board: board,
      query: query,
      work_package: work_package,
      created_by: User.current
    )

    render json: {
      added: true,
      id: relation.id,
      work_package_id: work_package.id,
      work_package_subject: work_package.subject.to_s,
      board_name: board.name.to_s,
      list_name: query.name.to_s,
      board_url: project_work_package_board_path(@project, board)
    }
  end

  def board_cards
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    unless User.current.allowed_in_project?(:view_whatsapp, @project) ||
           User.current.allowed_in_project?(:view_work_packages, @project)
      render json: { items: [] }
      return
    end

    profile = contact_profile_for_chat(chat)
    relations = WhatsappBoardCardRelation.where(project: @project)
    relations =
      if profile
        relations.where("contact_profile_id = ? OR chat_id = ?", profile.id, chat.id)
      else
        relations.where(chat_id: chat.id)
      end

    items = relations.includes(:work_package, :board, :query).order(created_at: :desc).limit(50).map do |relation|
      {
        id: relation.id,
        work_package_id: relation.work_package_id,
        work_package_subject: relation.work_package&.subject.to_s,
        board_name: relation.board&.name.to_s,
        list_name: relation.query&.name.to_s,
        board_url: relation.board ? project_work_package_board_path(@project, relation.board) : ""
      }
    end

    render json: { items: items }
  end

  def destroy_board_card
    relation = WhatsappBoardCardRelation.find_by!(id: params[:id], project: @project)
    unless User.current.allowed_in_project?(:manage_board_views, @project) ||
           User.current.allowed_in_project?(:view_whatsapp, @project)
      render json: { error: "No autorizado." }, status: :forbidden
      return
    end

    if relation.query && relation.work_package_id
      relation.query.ordered_work_packages.where(work_package_id: relation.work_package_id).delete_all
    end
    relation.destroy!
    render json: { deleted: true }
  end

  def related_work_packages
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    unless User.current.allowed_in_project?(:view_work_packages, @project) ||
           User.current.allowed_in_project?(:add_work_packages, @project) ||
           User.current.allowed_in_project?(:view_whatsapp, @project)
      render json: { error: "No autorizado." }, status: :forbidden
      return
    end

    profile = contact_profile_for_chat(chat)
    relations = WhatsappWorkPackageRelation.where(project: @project)
    relations =
      if profile
        relations.where("contact_profile_id = ? OR chat_id = ?", profile.id, chat.id)
      else
        relations.where(chat_id: chat.id)
      end

    items = relations.includes(:work_package).order(created_at: :desc).limit(30).map do |relation|
      wp = relation.work_package
      next unless wp
      {
        id: wp.id,
        subject: wp.subject.to_s,
        type_name: wp.type&.name.to_s,
        status_name: wp.status&.name.to_s,
        url: project_work_package_path(@project, wp)
      }
    end.compact

    render json: { items: items }
  end

  def work_package_details
    work_package = WorkPackage.visible.find_by(id: params[:id], project_id: @project.id)
    if work_package.nil?
      render_404
      return
    end

    unless User.current.allowed_in_project?(:view_work_packages, @project)
      render_403
      return
    end

    @work_package = work_package
    @tab = params[:tab].presence || "overview"
    render "whatsapp/work_package_details",
           layout: "whatsapp_embedded",
           locals: { page_title: [@work_package.subject.to_s] }
  end

  def work_package_statuses
    work_package = WorkPackage.visible.find_by(id: params[:id], project_id: @project.id)
    if work_package.nil?
      render json: { error: "No encontrado." }, status: :not_found
      return
    end

    unless User.current.allowed_in_project?(:view_work_packages, @project) ||
           User.current.allowed_in_project?(:add_work_packages, @project) ||
           User.current.allowed_in_project?(:view_whatsapp, @project)
      render json: { error: "No autorizado." }, status: :forbidden
      return
    end

    assignable = WorkPackages::UpdateContract.new(work_package, User.current).assignable_statuses

      render json: {
        work_package_id: work_package.id,
        current_status_id: work_package.status_id,
        lock_version: work_package.lock_version,
        statuses: assignable.map do |status|
          { id: status.id, name: status.name, color: status.color&.hexcode, allowed: true }
        end
      }
    end

  def create_related_work_package
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    unless User.current.allowed_in_project?(:add_work_packages, @project)
      render json: { error: "No autorizado." }, status: :forbidden
      return
    end

    subject = params[:subject].to_s.strip
    type = Type.enabled_in(@project).find_by(id: params[:type_id])
    if subject.blank? || type.nil?
      render json: { error: "Datos incompletos." }, status: :unprocessable_entity
      return
    end

    call = WorkPackages::CreateService.new(user: User.current).call(
      project: @project,
      type_id: type.id,
      subject: subject
    )

    unless call.success?
      render json: { error: call.errors.full_messages.join(", ") }, status: :unprocessable_entity
      return
    end

    work_package = call.result
    profile = contact_profile_for_chat(chat)
    WhatsappWorkPackageRelation.create!(
      project: @project,
      chat: chat,
      contact_profile: profile,
      work_package: work_package,
      created_by: User.current
    )

    render json: { created: true, id: work_package.id }
  end

  def destroy_related_work_package
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    unless User.current.allowed_in_project?(:delete_work_packages, @project)
      render json: { error: "No autorizado." }, status: :forbidden
      return
    end

    work_package = WorkPackage.find_by(id: params[:id], project_id: @project.id)
    if work_package.nil?
      render json: { error: "No encontrado." }, status: :not_found
      return
    end

    profile = contact_profile_for_chat(chat)
    relation_scope = WhatsappWorkPackageRelation.where(project: @project, work_package: work_package)
    relation_scope =
      if profile
        relation_scope.where("contact_profile_id = ? OR chat_id = ?", profile.id, chat.id)
      else
        relation_scope.where(chat_id: chat.id)
      end

    if relation_scope.empty?
      render json: { error: "No relacionado." }, status: :unprocessable_entity
      return
    end

    relation_scope.destroy_all
    WhatsappBoardCardRelation.where(project: @project, work_package: work_package).destroy_all

    call = WorkPackages::DeleteService.new(user: User.current, model: work_package).call
    unless call.success?
      render json: { error: call.errors.full_messages.join(", ") }, status: :unprocessable_entity
      return
    end

    render json: { deleted: true }
  end

  def unlink_related_work_package
    chat = WhatsappChat.find_by!(id: params[:chat_id], project: @project)
    unless User.current.allowed_in_project?(:view_work_packages, @project) ||
           User.current.allowed_in_project?(:add_work_packages, @project) ||
           User.current.allowed_in_project?(:view_whatsapp, @project)
      render json: { error: "No autorizado." }, status: :forbidden
      return
    end

    work_package = WorkPackage.find_by(id: params[:id], project_id: @project.id)
    if work_package.nil?
      render json: { error: "No encontrado." }, status: :not_found
      return
    end

    profile = contact_profile_for_chat(chat)
    relation_scope = WhatsappWorkPackageRelation.where(project: @project, work_package: work_package)
    relation_scope =
      if profile
        relation_scope.where("contact_profile_id = ? OR chat_id = ?", profile.id, chat.id)
      else
        relation_scope.where(chat_id: chat.id)
      end

    if relation_scope.empty?
      render json: { error: "No relacionado." }, status: :unprocessable_entity
      return
    end

    relation_scope.destroy_all
    render json: { unlinked: true }
  end

  def create_chat
      session_name = params[:session].to_s.strip
      phone = params[:phone].to_s.strip
      Rails.logger.info("[WAHA] create_chat session=#{session_name} phone=#{phone}")
    if session_name.blank? || phone.blank?
      render json: { error: "Falta la sesion o el numero." }, status: :unprocessable_entity
      return
    end

    response = waha_request(
      "/api/contacts/check-exists?phone=#{CGI.escape(phone)}&session=#{CGI.escape(session_name)}",
      :get
    )
    Rails.logger.info("[WAHA] create_chat check-exists response=#{response.inspect}")

    unless response[:json].is_a?(Hash) && response[:json]["numberExists"]
      render json: { error: "El numero no tiene WhatsApp." }, status: :unprocessable_entity
      return
    end

    chat_id = normalize_whatsapp_id(response[:json]["chatId"].to_s)
    if chat_id.blank?
      render json: { error: "No se pudo obtener el chatId." }, status: :unprocessable_entity
      return
    end

      existing = WhatsappChat.find_by(project: @project, external_id: chat_id)
      if existing
        profile = WhatsappContactProfile.find_by(project: @project, external_id: chat_id)
        if profile&.first_name.present?
          existing.update!(title: profile.first_name)
        end
        profile, created = ensure_contact_profile_for_chat(existing)
        hydrate_contact_profile_basics!(profile, existing, fallback_name: existing.title.to_s, fallback_phone: phone)
        Whatsapp::AutoWorkPackageService
          .new(project: @project, contact_profile: profile, chat: existing, user: (User.current || User.system))
          .call(contact_was_new: created)
        Rails.logger.info("[WAHA] create_chat existing chat_id=#{existing.id}")
        render json: {
          chat_id: existing.id,
          existing: true,
        message: "Este chat ya existe.",
        chat: {
          id: existing.id,
          external_id: existing.external_id.to_s,
          title: truncate_chat_title(existing.title.to_s),
          initials: chat_initials(existing),
          preview: truncate_preview(existing.messages.last&.body.to_s),
          time_label: format_time(existing.last_message_at || existing.created_at),
          favorite: existing.favorite
        }
      }
      return
    end

    title = params[:label].to_s.strip
    title = phone if title.blank?

        chat = WhatsappChat.create!(
          project: @project,
          title: title,
          chat_type: "direct",
          external_id: chat_id
        )
      WhatsappChatParticipant.create!(chat: chat, user: User.current, joined_at: Time.current)
      profile = WhatsappContactProfile.find_by(project: @project, external_id: chat_id)
      if profile&.first_name.present?
        chat.update!(title: profile.first_name)
      end
      profile, created = ensure_contact_profile_for_chat(chat)
      hydrate_contact_profile_basics!(profile, chat, fallback_name: title, fallback_phone: phone)
      Whatsapp::AutoWorkPackageService
        .new(project: @project, contact_profile: profile, chat: chat, user: (User.current || User.system))
        .call(contact_was_new: created)

      Rails.logger.info("[WAHA] create_chat created chat_id=#{chat.id} external_id=#{chat_id}")
      render json: {
        chat_id: chat.id,
      existing: false,
      message: "Chat creado.",
      chat: {
        id: chat.id,
        external_id: chat.external_id.to_s,
        title: truncate_chat_title(chat.title.to_s),
        initials: chat_initials(chat),
        preview: "",
        time_label: format_time(chat.last_message_at || chat.created_at),
        unread_count: chat_unread_count(chat),
        conversation_status: chat_conversation_status(chat),
        favorite: chat.favorite
      }
    }
  end

  def update_settings
    current = Setting.plugin_openproject_whatsapp || {}
    realtime_enabled = if settings_params.key?(:realtime_enabled)
                         settings_params[:realtime_enabled].to_s == "true"
                       else
                         current.fetch("realtime_enabled", true)
                       end
    Setting.plugin_openproject_whatsapp = current.merge(
      "waha_url" => settings_params[:waha_url].to_s,
      "realtime_enabled" => realtime_enabled
    )

    render json: {
      waha_url: Setting.plugin_openproject_whatsapp["waha_url"],
      realtime_enabled: Setting.plugin_openproject_whatsapp["realtime_enabled"]
    }
  end

  def debug_log
    label = params[:label].to_s
    payload = if params[:payload].is_a?(ActionController::Parameters)
                params[:payload].to_unsafe_h
              else
                params[:payload]
              end
    Rails.logger.info("[WA-FE] user=#{User.current.id} project=#{@project.id} label=#{label} payload=#{payload.inspect}")
    render json: { ok: true }
  end

  def create_waha_session
    name = params[:name].to_s.strip
    if name.blank?
      render json: { error: "Escribe un nombre para la sesion." }, status: :unprocessable_entity
      return
    end

    metadata = if params[:metadata].is_a?(ActionController::Parameters)
                 params[:metadata].to_unsafe_h
               elsif params[:metadata].respond_to?(:to_h)
                 params[:metadata].to_h
               else
                 {}
               end
    settings = save_project_settings(params)
    if settings.errors.any?
      render json: { error: "Completa los campos obligatorios.", details: settings.errors.full_messages },
             status: :unprocessable_entity
      return
    end
    webhook_url = whatsapp_plugin_project_whatsapp_waha_webhook_url(@project)
    payload = {
      name: name,
      start: true,
      config: {
        metadata: metadata,
        webhooks: [
          {
            url: webhook_url,
            events: ["message.any"]
          }
        ]
      }
    }

    response = waha_request("/api/sessions", :post, payload)
    render_waha_response(response)
  end

  def start_waha_session
    name = params[:session].to_s.strip
    if name.blank?
      render json: { error: "Escribe un nombre para la sesion." }, status: :unprocessable_entity
      return
    end

    response = waha_request("/api/sessions/#{CGI.escape(name)}/start", :post)
    render_waha_response(response)
  end

  def waha_session_status
    name = params[:session].to_s.strip
    if name.blank?
      render json: { error: "Escribe un nombre para la sesion." }, status: :unprocessable_entity
      return
    end

    response = waha_request("/api/sessions/#{CGI.escape(name)}", :get)
    render_waha_response(response)
  end

  def delete_waha_session
    name = params[:session].to_s.strip
    if name.blank?
      render json: { error: "Escribe un nombre para la sesion." }, status: :unprocessable_entity
      return
    end

    response = waha_request("/api/sessions/#{CGI.escape(name)}", :delete)
    settings = WhatsappProjectSetting.find_by(project: @project)
    if settings&.session_name.to_s == name
      updates = { session_name: nil }
      updates[:admin_name] = params[:admin_name].to_s.strip if params[:admin_name].present?
      updates[:admin_email] = params[:admin_email].to_s.strip if params[:admin_email].present?
      updates[:time_zone] = params[:time_zone].to_s.strip if params[:time_zone].present?
      settings.update_columns(updates)
    end
    render_waha_response(response)
  end

  def admin_connections
    return if require_admin!

    settings = WhatsappProjectSetting.includes(:project)
                                     .where.not(session_name: [nil, ""])
    limits = AdminWhatsapp.where(project_id: settings.map(&:project_id)).index_by(&:project_id)
    connections = []

    settings.each do |setting|
      session_name = setting.session_name.to_s.strip
      next if session_name.blank?
      project = setting.project
      next if project.nil?
      status = fetch_waha_status(session_name)
      next unless status == "WORKING"
      bytes = project_media_bytes_for(project.id)
      connections << {
        project_id: project.id,
        project_name: project.name.to_s,
        admin_name: setting.admin_name.to_s,
        session_name: session_name,
        status: status,
        media_bytes: bytes,
        media_label: format_media_size(bytes),
        limit_gb: limits[project.id]&.limit_gb
      }
    end

    render json: { connections: connections }
  end

  def update_admin_connection_limit
    return if require_admin!

    project_id = params[:connection_project_id].to_i
    if project_id <= 0
      render json: { error: "Proyecto invalido." }, status: :unprocessable_entity
      return
    end

    raw_limit = params[:limit_gb].to_s.strip
    limit_value = raw_limit.present? ? raw_limit.to_f : nil
    record = AdminWhatsapp.find_or_initialize_by(project_id: project_id)
    record.limit_gb = limit_value
    record.save!

    render json: { ok: true, limit_gb: record.limit_gb }
  end

  def qr_waha_session
    name = params[:session].to_s.strip
    if name.blank?
      render json: { error: "Escribe un nombre para la sesion." }, status: :unprocessable_entity
      return
    end

    response = waha_request("/api/#{CGI.escape(name)}/auth/qr?format=image", :get, nil, { "Accept" => "image/png" })
    if response[:content_type] == "image/png"
      send_data response[:body], type: "image/png", disposition: "inline"
    else
      render json: response[:json] || { error: "Error al obtener QR." }, status: response[:status] || :bad_gateway
    end
  end

  def waha_webhook
    payload = request.request_parameters.presence ||
              begin
                JSON.parse(request.raw_post.to_s)
              rescue JSON::ParserError
                {}
              end

    # TEMP DEBUG: log full webhook payload for troubleshooting.
    Rails.logger.info("[WAHA] webhook payload raw=#{payload.inspect}")

    session_name = payload["session"].to_s
    event_name = payload["event"].to_s
    data = payload["payload"].is_a?(Hash) ? payload["payload"] : {}
    Rails.logger.info("[WAHA] webhook payload keys=#{data.keys} body_start=#{data['body'].to_s[0,30]} caption=#{data['caption']} data_body_start=#{data.dig('_data','body').to_s[0,30]} data_caption=#{data.dig('_data','caption')} mimetype=#{data['mimetype'] || data.dig('_data','mimetype')} media_url=#{data.dig('media','url') || data.dig('_data','media','url')}")
    Rails.logger.info("[WAHA] webhook received event=#{event_name} session=#{session_name} has_payload=#{data.present?}")

    if session_name.blank? || data.blank? || event_name.blank?
      Rails.logger.info("[WAHA] webhook skip missing fields event=#{event_name.inspect} session=#{session_name.inspect} payload_present=#{data.present?}")
      head :ok
      return
    end
    unless event_name == "message" || event_name == "message.any"
      Rails.logger.info("[WAHA] webhook skip event=#{event_name}")
      head :ok
      return
    end

    settings = WhatsappProjectSetting.find_by(session_name: session_name)
    unless settings
      Rails.logger.info("[WAHA] webhook skip no settings for session=#{session_name}")
      head :ok
      return
    end

    project = settings.project
    Rails.logger.info("[WAHA] webhook route project_id=#{project.id} project=#{project.identifier} session=#{session_name} event=#{event_name}")
    info = data["_data"].is_a?(Hash) ? data["_data"]["Info"] : nil
    info_chat = info.is_a?(Hash) ? info["Chat"].to_s : ""
    status_broadcast = [
      data["from"].to_s,
      data["to"].to_s,
      data["participant"].to_s,
      info_chat
    ].any? { |value| value == "status@broadcast" }
    if status_broadcast
      broadcast_webhook_debug(project, "filter.status_broadcast", {
        session: session_name,
        event: event_name,
        from: data["from"].to_s,
        to: data["to"].to_s,
        participant: data["participant"].to_s,
        info_chat: info_chat
      })
      Rails.logger.info("[WAHA] webhook skip status broadcast from=#{data['from']} chat=#{info_chat}")
      head :ok
      return
    end
    group_message = [
      data["from"].to_s,
      data["to"].to_s,
      data["participant"].to_s,
      info_chat
    ].any? { |value| value.include?("@g.us") } || (info.is_a?(Hash) && info["IsGroup"] == true)
    if group_message
      broadcast_webhook_debug(project, "filter.group", {
        session: session_name,
        event: event_name,
        from: data["from"].to_s,
        to: data["to"].to_s,
        participant: data["participant"].to_s,
        info_chat: info_chat
      })
      Rails.logger.info("[WAHA] webhook skip group message from=#{data['from']} chat=#{info_chat}")
      head :ok
      return
    end

    from_me = data.key?("fromMe") ? data["fromMe"] == true : nil
    own_id = payload.dig("me", "id").to_s
    if from_me.nil? && own_id.present? && data["from"].to_s == own_id
      from_me = true
    end
    source = data["source"].to_s

    info_sender = info.is_a?(Hash) ? info["Sender"].to_s : ""
    info_sender_alt = info.is_a?(Hash) ? info["SenderAlt"].to_s : ""
    info_recipient_alt = info.is_a?(Hash) ? info["RecipientAlt"].to_s : ""

    normalized_sender = normalize_whatsapp_id(info_sender)
    normalized_sender_alt = normalize_whatsapp_id(info_sender_alt)
    normalized_recipient_alt = normalize_whatsapp_id(info_recipient_alt)

    from_id = extract_external_id(data["from"])
    to_id = extract_external_id(data["to"])
    if from_me
      resolved_external_id = normalized_recipient_alt.presence || normalized_sender.presence
      if resolved_external_id.blank? && own_id.present?
        resolved_external_id = own_id
      end
    else
      resolved_external_id = normalized_sender_alt.presence || normalized_sender.presence
    end
    resolved_external_id = resolve_external_id(from_id, to_id, own_id) if resolved_external_id.blank?

    chat = nil
    if resolved_external_id.present?
      chat = WhatsappChat.find_by(project: project, external_id: resolved_external_id)
      if chat && from_me.nil?
        from_me = resolved_external_id == to_id
      end
    end
    if chat.nil? && to_id.present?
      chat = WhatsappChat.find_by(project: project, external_id: to_id)
      if chat && from_me.nil?
        from_me = true
      end
    end
    if chat.nil? && from_id.present?
      chat = WhatsappChat.find_by(project: project, external_id: from_id)
      if chat && from_me.nil?
        from_me = false
      end
    end
    from_me = !!from_me

    if from_me
      preferred_external_id = resolve_external_chat_id(data, resolved_external_id)
      if preferred_external_id.present?
        if chat && normalize_whatsapp_id(chat.external_id) != preferred_external_id
          chat = WhatsappChat.find_by(project: project, external_id: preferred_external_id)
        end
        resolved_external_id = preferred_external_id
      end
    end

    external_id = chat ? chat.external_id.to_s : resolve_external_chat_id(data, resolved_external_id)
    external_id = normalize_whatsapp_id(external_id)
    if external_id.blank?
      broadcast_webhook_debug(project, "filter.missing_external_id", {
        session: session_name,
        event: event_name,
        from: data["from"].to_s,
        to: data["to"].to_s,
        participant: data["participant"].to_s,
        info_chat: info_chat
      })
      Rails.logger.info("[WAHA] webhook skip missing external_id from=#{data['from']} to=#{data['to']}")
      head :ok
      return
    end

    unless external_id.include?("@c.us")
      broadcast_webhook_debug(project, "filter.non_chat", {
        session: session_name,
        event: event_name,
        external_id: external_id.to_s,
        from: data["from"].to_s,
        to: data["to"].to_s,
        participant: data["participant"].to_s,
        info_chat: info_chat
      })
      Rails.logger.info("[WAHA] webhook skip non-chat external_id=#{external_id}")
      head :ok
      return
    end

    if !external_id.include?("@c.us")
      broadcast_webhook_debug(project, "filter.non_cus", {
        session: session_name,
        event: event_name,
        external_id: external_id.to_s,
        from: data["from"].to_s,
        to: data["to"].to_s,
        participant: data["participant"].to_s,
        info_chat: info_chat
      })
      Rails.logger.info("[WAHA] webhook skip non-cus external_id=#{external_id}")
      head :ok
      return
    end

    if from_me && source == "api"
      broadcast_webhook_debug(project, "filter.source_api", {
        session: session_name,
        event: event_name,
        external_id: external_id.to_s,
        from_me: from_me,
        source: source
      })
      Rails.logger.info("[WAHA] webhook skip source=api from_me=#{from_me} external_id=#{external_id}")
      head :ok
      return
    end

    media = data["media"].is_a?(Hash) ? data["media"] : {}
    if media.blank? && data.dig("_data", "media").is_a?(Hash)
      media = data.dig("_data", "media")
    end

    media_mime = media["mimetype"].to_s
    if media_mime.blank?
      media_mime = data["mimetype"].to_s
      media_mime = data.dig("_data", "mimetype").to_s if media_mime.blank?
    end
    media_filename = media["filename"].to_s
    if media_filename.blank?
      media_filename = data["filename"].to_s
      media_filename = data.dig("_data", "filename").to_s if media_filename.blank?
    end
    media_url = media["url"].to_s
    if media_url.blank?
      media_url = data["url"].to_s
      media_url = data.dig("_data", "url").to_s if media_url.blank?
    end
    if media_url.blank?
      media_url = data["deprecatedMms3Url"].to_s
      media_url = data.dig("_data", "deprecatedMms3Url").to_s if media_url.blank?
    end
    media["mimetype"] = media_mime if media_mime.present?
    media["filename"] = media_filename if media_filename.present?
    media["url"] = media_url if media_url.present?

    raw_type = data["type"].to_s
    raw_type = data.dig("_data", "type").to_s if raw_type.blank?
    has_media = data["hasMedia"] == true || data.dig("_data", "hasMedia") == true
    message_type = map_message_type(raw_type, has_media, media_mime)

    caption = data["caption"].to_s
    if caption.blank?
      caption = data.dig("_data", "caption").to_s
    end
    body_source = data["body"].to_s
    if body_source.blank?
      body_source = data.dig("_data", "body").to_s
    end
    body = if message_type == "text"
             body_source
           else
             caption.to_s
           end
    if body.blank? && message_type != "text"
      fallback = body_source
      if fallback.present? && !fallback.start_with?("data:") && fallback.length <= 2000
        body = fallback
      end
    end
    if message_type != "text"
      if body_source.start_with?("data:") || (body_source.length > 200 && body_source.match?(/\A[a-zA-Z0-9+\/=\s]+\z/))
        body = caption.to_s
      end
    end
    Rails.logger.info(
      "[WAHA] webhook normalized type=#{message_type} raw=#{raw_type} has_media=#{has_media} mime=#{media_mime} body_len=#{body_source.length} caption_len=#{caption.length}"
    )

    waha_id = if data["id"].is_a?(Hash)
                data["id"]["_serialized"].to_s.presence ||
                  data["id"]["id"].to_s.presence ||
                  data["id"].to_s
              else
                data["id"].to_s
              end
    direction = from_me ? "outgoing" : "incoming"
    Rails.logger.info(
      "[WAHA] webhook event=#{event_name} project=#{project.identifier} direction=#{direction} from_me=#{from_me} " \
      "source=#{source} from=#{data['from']} to=#{data['to']} own_id=#{own_id} external_id=#{external_id} waha_id=#{waha_id}"
    )
    broadcast_webhook_debug(project, "accept", {
      session: session_name,
      event: event_name,
      from: data["from"].to_s,
      to: data["to"].to_s,
      participant: data["participant"].to_s,
      info_chat: info_chat,
      from_me: from_me,
      source: source,
      own_id: own_id,
      external_id: external_id.to_s,
      waha_id: waha_id.to_s,
      message_type: message_type,
      has_media: has_media
    })
    Rails.logger.info("[WAHA] webhook waha_id_present=#{waha_id.present?} waha_id_value=#{waha_id}")
    media_filehash = media.is_a?(Hash) ? media["filehash"].to_s : ""
    ts_value = data["t"] || data["timestamp"]
    Rails.logger.info("[WAHA] webhook filehash_present=#{media_filehash.present?} filehash_value=#{media_filehash} timestamp=#{ts_value}")
    if waha_id.present?
      Rails.logger.info("[WAHA] webhook dedupe waha_id=#{waha_id}")
      existing = WhatsappMessage.joins(:chat)
                                .where(whatsapp_chats: { project_id: project.id })
                                .where("whatsapp_messages.metadata->>'waha_id' = ?", waha_id)
                                .order(created_at: :desc)
                                .first
      if existing
        metadata = existing.metadata.is_a?(Hash) ? existing.metadata : {}
        if media.present?
          metadata["remote_url"] ||= media["url"] if media["url"].present?
          metadata["filename"] ||= media["filename"] if media["filename"].present?
          metadata["content_type"] ||= media["mimetype"] if media["mimetype"].present?
          metadata["file_size"] ||= media["file_size"] if media["file_size"].present?
        end
        if message_type == "image"
          caption_text = body.to_s
          if body_source.start_with?("data:image/")
            metadata["data_url"] ||= body_source
            existing.body = caption_text
          elsif body_source.length > 200 && body_source.match?(/\A[a-zA-Z0-9+\/=\s]+\z/)
            mime = media_mime.presence || "image/jpeg"
            metadata["data_url"] ||= "data:#{mime};base64,#{body_source}"
            existing.body = caption_text
          end
        elsif message_type != "text" && body.present?
          existing.body = body
        end
        existing.metadata = metadata
        existing.save!
        touch_chat_last_message_at(existing.chat, ts_value)
        Rails.logger.info("[WAHA] webhook dedupe hit waha_id=#{waha_id}")
        head :ok
        return
      end
    else
      Rails.logger.info("[WAHA] webhook dedupe missing waha_id")
    end

    chat ||= WhatsappChat.find_or_initialize_by(project: project, external_id: external_id)
    if chat.new_record?
      chat.chat_type = external_id.include?("@g.us") ? "group" : "direct"
      chat.title = extract_phone(external_id)
      chat.save!
    end
      profile = WhatsappContactProfile.find_by(project: project, chat: chat)
      if profile.nil? && chat.external_id.present?
        profile = WhatsappContactProfile.find_by(project: project, external_id: chat.external_id)
      end
      if profile&.first_name.present? && chat.title != profile.first_name
        chat.update!(title: profile.first_name)
      end
      sync_contact_profile_from_webhook(project, chat, external_id, info, from_me)

    contact = nil
    if !from_me
      phone = extract_phone(external_id)
      contact = WhatsappContact.find_or_create_by(project: project, phone: phone) do |record|
        record.name = phone
        record.external = true
      end
    end

    # media/body already normalized above

    ts = data["t"] || data["timestamp"]
    if chat
      begin
        time = ts ? Time.at(ts.to_i) : nil
        if waha_id.present?
          existing_waha = chat.messages.where("metadata ->> 'waha_id' = ?", waha_id).order(created_at: :desc).first
          if existing_waha
            meta = existing_waha.metadata.is_a?(Hash) ? existing_waha.metadata : {}
            meta["waha_id"] ||= waha_id
            meta["waha_event"] = event_name
            meta["from_me"] = from_me
            if media.present?
              meta["remote_url"] ||= media["url"] if media["url"].present?
              meta["filename"] ||= media["filename"] if media["filename"].present?
              meta["content_type"] ||= media["mimetype"] if media["mimetype"].present?
              meta["file_size"] ||= media["file_size"] if media["file_size"].present?
              meta["filehash"] ||= media["filehash"] if media["filehash"].present?
            end
            if message_type == "image"
              caption_text = body.to_s
              if body_source.start_with?("data:image/")
                meta["data_url"] ||= body_source
                existing_waha.body = caption_text if caption_text.present?
              elsif body_source.length > 200 && body_source.match?(/\A[a-zA-Z0-9+\/=\s]+\z/)
                mime = media_mime.presence || "image/jpeg"
                meta["data_url"] ||= "data:#{mime};base64,#{body_source}"
                existing_waha.body = caption_text if caption_text.present?
              elsif caption_text.present?
                existing_waha.body = caption_text if existing_waha.body.to_s.start_with?("data:") || existing_waha.body.to_s.length > 200
              end
            elsif message_type != "text" && body.present?
              existing_waha.body = body
            end
            existing_waha.metadata = meta
            existing_waha.save!
            touch_chat_last_message_at(chat, ts)
            Rails.logger.info("[WAHA] webhook dedupe waha_id match chat_id=#{chat.id} message_id=#{existing_waha.id}")
            head :ok
            return
          end
        end
        if waha_id.blank?
          recent_scope = chat.messages.where(message_type: message_type)
          recent_scope = recent_scope.where("created_at >= ?", 10.seconds.ago)
          recent = recent_scope.order(created_at: :desc).first
          if recent
            time_match = time ? (recent.created_at.to_i - time.to_i).abs <= 10 : false
            body_match = message_type == "image" ? true : recent.body.to_s == body.to_s
            Rails.logger.info(
              "[WAHA] webhook dedupe check chat_id=#{chat.id} from_me=#{from_me} recent_id=#{recent.id} time=#{time} time_match=#{time_match} body_match=#{body_match}"
            )
            same_direction = from_me ? recent.sender_user_id.present? : recent.sender_contact_id.present?
            if same_direction && time_match && body_match
              meta = recent.metadata.is_a?(Hash) ? recent.metadata : {}
              meta["waha_event"] = event_name
              meta["from_me"] = from_me
              if media.present?
                meta["remote_url"] ||= media["url"] if media["url"].present?
                meta["filename"] ||= media["filename"] if media["filename"].present?
                meta["content_type"] ||= media["mimetype"] if media["mimetype"].present?
                meta["file_size"] ||= media["file_size"] if media["file_size"].present?
                meta["filehash"] ||= media["filehash"] if media["filehash"].present?
              end
              if message_type == "image"
                caption_text = body.to_s
                if body_source.start_with?("data:image/")
                  meta["data_url"] ||= body_source
                  recent.body = caption_text
                elsif body_source.length > 200 && body_source.match?(/\A[a-zA-Z0-9+\/=\s]+\z/)
                  mime = media_mime.presence || "image/jpeg"
                  meta["data_url"] ||= "data:#{mime};base64,#{body_source}"
                  recent.body = caption_text
                elsif caption_text.present?
                  recent.body = caption_text if recent.body.to_s.start_with?("data:") || recent.body.to_s.length > 200
                end
              elsif message_type != "text" && body.present?
                recent.body = body
              end
              recent.metadata = meta
              recent.save!
              touch_chat_last_message_at(chat, time)
              head :ok
              return
            end
          end
        end
      rescue StandardError
      end
    end

    reply_to_id = nil
    reply_to_label = nil
    if data["replyTo"].is_a?(Hash)
      reply_to_id = data["replyTo"]["id"].to_s.presence
      reply_to_label = data["replyTo"]["body"].to_s.presence
    end
    reply_to_id ||= data.dig("_data", "Message", "extendedTextMessage", "contextInfo", "stanzaID").to_s.presence
    reply_to_label ||= data.dig("_data", "Message", "extendedTextMessage", "contextInfo", "quotedMessage", "conversation").to_s.presence

    metadata = {
      "waha_id" => waha_id,
      "waha_event" => event_name,
      "from_me" => from_me
    }
    metadata["reply_to"] = reply_to_id if reply_to_id.present?
    metadata["reply_to_label"] = reply_to_label if reply_to_label.present?

    if media.present?
      metadata["remote_url"] = media["url"] if media["url"].present?
      metadata["filename"] = media["filename"] if media["filename"].present?
      metadata["content_type"] = media["mimetype"] if media["mimetype"].present?
      metadata["file_size"] = media["file_size"] if media["file_size"].present?
      metadata["filehash"] = media["filehash"] if media["filehash"].present?
    end

    if message_type == "image"
      caption_text = body.to_s
      body_source = data["body"].to_s
      if body_source.blank?
        body_source = data.dig("_data", "body").to_s
      end
      if body_source.start_with?("data:image/")
        metadata["data_url"] ||= body_source
        body = caption_text
      elsif body_source.length > 200 && body_source.match?(/\A[a-zA-Z0-9+\/=\s]+\z/)
        mime = media_mime.presence || "image/jpeg"
        metadata["data_url"] ||= "data:#{mime};base64,#{body_source}"
        body = caption_text
      end
    end

    message = chat.messages.new(body: body)
    message.message_type = message_type
    message.status = "sent"
    message.metadata = metadata
    if from_me
      message.sender_user = User.respond_to?(:system) ? User.system : User.admin.first
    else
      message.sender_contact = contact
    end
    message.save!
    if message_type == "image"
      data_url = metadata["data_url"].to_s
      Rails.logger.info(
        "[WAHA] webhook image stored id=#{message.id} data_url=#{data_url.present?} data_url_len=#{data_url.length} remote_url=#{metadata['remote_url'].present?}"
      )
    end

    chat_meta = chat.metadata.is_a?(Hash) ? chat.metadata : {}
      if !from_me
        chat_meta["unread_count"] = chat_meta.fetch("unread_count", 0).to_i + 1
        chat_meta["conversation_status"] = "started"
      end
      prev_last = chat.last_message_at
      chat.update!(last_message_at: message.created_at, metadata: chat_meta)
      Rails.logger.info(
        "[WAHA] chat_touch chat_id=#{chat.id} msg_id=#{message.id} prev_last=#{prev_last} new_last=#{chat.last_message_at} msg_created=#{message.created_at}"
      )

    broadcast_payload = {
      chat_id: chat.id,
      message: serialize_message_for_broadcast(message, from_me),
      chat: {
        id: chat.id,
        external_id: chat.external_id.to_s,
        title: truncate_chat_title(chat.title.to_s.presence || "Chat"),
        initials: chat_initials(chat),
        time_label: format_time(message.created_at),
        preview: preview_for_message(message),
        unread_count: chat_unread_count(chat),
        conversation_status: chat_conversation_status(chat),
        favorite: chat.favorite,
        ia_flow_id: chat_ia_flow_id(chat)
      }
    }
    begin
      WhatsappChannel.broadcast_to("project:#{project.id}", broadcast_payload)
    rescue StandardError => error
      Rails.logger.error("[WAHA] realtime broadcast failed: #{error.class} #{error.message}")
    end

    if !from_me
      trigger_ia_flow_from_message(project, chat, profile, message)
    end

    head :ok
  end

  def mark_chat_read
    chat = WhatsappChat.find_by!(id: params[:id], project: @project)
    meta = chat.metadata.is_a?(Hash) ? chat.metadata : {}
    meta["unread_count"] = 0
    chat.update!(metadata: meta)
    render json: { chat_id: chat.id, unread_count: 0 }
  end

  private

  def message_params
    params.require(:message).permit(:body)
  end

  def settings_params
    params.require(:settings).permit(:waha_url, :realtime_enabled)
  end

  def visible_chats_scope
    scope = WhatsappChat.where(project: @project)
    return scope if User.current.admin?

    scope.left_joins(:contact_profile).where(whatsapp_contact_profiles: { assigned_to_id: User.current.id })
  end

  def voice_note_file?(content_type, filename)
    ct = content_type.to_s.downcase
    return true if ct.include?("audio/ogg") || ct.include?("audio/opus") || ct.include?("codecs=opus")
    ext = File.extname(filename.to_s).downcase
    %w[.ogg .oga .opus].include?(ext)
  end

  def contact_profile_params
    params.permit(
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
      custom_fields: {}
    )
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

  def chat_ia_flow_id(chat)
    return nil if chat.nil?
    meta = chat.metadata.is_a?(Hash) ? chat.metadata : {}
    meta["ia_flow_id"].to_s.presence
  end

  def trigger_ia_flow_from_message(project, chat, profile, message)
    return if project.nil? || chat.nil? || message.nil?
    flow_id = chat_ia_flow_id(chat)
    return if flow_id.blank?

    flow = FlowDefinition.find_by(id: flow_id, project: project)
    return unless flow

    ia_node = ia_node_for_flow(flow)
    return unless ia_node

    contact_profile = profile
    if contact_profile.nil?
      contact_profile = WhatsappContactProfile.find_by(project: project, chat: chat)
    end
    payload = {
      "chat_id" => chat.id,
      "contact_id" => contact_profile&.id,
      "message_id" => message.id,
      "message_body" => message.body.to_s,
      "message_type" => message.message_type.to_s,
      "waha_id" => message.metadata.is_a?(Hash) ? message.metadata["waha_id"] : nil,
      "from_me" => false
    }.compact

    options = {
      start_node_id: (ia_node["id"] || ia_node[:id]).to_s,
      start_type: "conversation_ai",
      payload: payload,
      source: "whatsapp_incoming",
      allow_without_contact: contact_profile.nil?,
      restrict_to_ids: contact_profile.present?
    }
    options[:contact_ids] = [contact_profile.id] if contact_profile

    Rails.logger.info("[Flows][IA] incoming trigger flow_id=#{flow.id} chat_id=#{chat.id} contact_id=#{contact_profile&.id}")
    FlowRunnerJob.perform_later(flow.id, project.id, nil, options)
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

  def whatsapp_template_params
    params.require(:template).permit(:name, :template_type, :body_text, :media_url, :active)
  end

  def store_whatsapp_template_media(template, upload)
    return unless upload.respond_to?(:original_filename)

    filename = File.basename(upload.original_filename.to_s)
    return if filename.blank?

    storage_dir = Rails.root.join("files", "whatsapp_template_media")
    FileUtils.mkdir_p(storage_dir)
    token = SecureRandom.hex(8)
    path = storage_dir.join("#{Time.current.strftime('%Y%m%d%H%M%S')}_#{token}_#{filename}")
    File.open(path, "wb") { |file| file.write(upload.read) }

    template.update!(
      file_name: filename,
      content_type: upload.content_type.to_s,
      file_size: upload.size.to_i,
      storage_path: path.to_s,
      media_url: nil
    )
  end

  def apply_whatsapp_template_media_url(template)
    media_url = template.media_url.to_s.strip
    return if media_url.blank?
    template.update_columns(storage_path: nil, file_name: nil, content_type: nil, file_size: nil)
  end

  def validate_video_template_size!(template_type, upload, template)
    return true unless upload.respond_to?(:size)
    return true unless video_template_type?(template_type)
    max_bytes = 50.megabytes
    return true if upload.size.to_i <= max_bytes
    template.errors.add(:media_file, "supera el limite de 50MB para video")
    false
  end

  def validate_video_template_url_size!(template_type, media_url, template)
    return true unless video_template_type?(template_type)
    url = media_url.to_s.strip
    return true if url.blank?
    size = fetch_remote_content_length(url)
    return true if size.nil?
    max_bytes = 50.megabytes
    return true if size <= max_bytes
    template.errors.add(:media_url, "supera el limite de 50MB para video")
    false
  end

  def fetch_remote_content_length(url, max_redirects: 3)
    return nil if url.blank?
    uri = URI.parse(url)
    return nil unless uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)

    current_uri = uri
    max_redirects.times do
      http = Net::HTTP.new(current_uri.host, current_uri.port)
      http.use_ssl = current_uri.is_a?(URI::HTTPS)
      http.open_timeout = 5
      http.read_timeout = 5
      response = http.start { |client| client.request_head(current_uri.request_uri) }
      case response
      when Net::HTTPRedirection
        location = response["location"].to_s
        return nil if location.blank?
        next_uri = URI.parse(location)
        current_uri = if next_uri.is_a?(URI::HTTP) || next_uri.is_a?(URI::HTTPS)
                        next_uri
                      else
                        current_uri.merge(location)
                      end
        next
      when Net::HTTPSuccess
        length = response["content-length"].to_s
        return nil if length.blank?
        return length.to_i
      else
        return nil
      end
    end
    nil
  rescue StandardError
    nil
  end

  def video_template_type?(template_type)
    type = template_type.to_s
    type == "video" || type == "text_video"
  end

  def merge_custom_fields(existing, incoming)
    current = existing.is_a?(Hash) ? existing.dup : {}
    payload = incoming.is_a?(ActionController::Parameters) ? incoming.to_unsafe_h : incoming
    payload = payload.is_a?(Hash) ? payload : {}
    payload.each do |key, value|
      if value.is_a?(Array)
        cleaned = value.map(&:to_s).map(&:strip).reject(&:blank?)
        if cleaned.empty?
          current.delete(key)
        else
          current[key] = cleaned
        end
      else
        str = value.to_s.strip
        if str.empty?
          current.delete(key)
        else
          current[key] = value
        end
      end
    end
    current
  end

  def normalize_tags(raw)
    return [] if raw.blank?

    seen = {}
    raw.to_s.split(",").filter_map do |item|
      name = item.to_s.strip
      next if name.blank?

      key = name.downcase
      next if seen[key]

      seen[key] = true
      name
    end
  end

  def extract_waha_id(payload)
    return "" unless payload.is_a?(Hash)
    id = payload["id"]
    return id.to_s if id.is_a?(String)
    if id.is_a?(Hash)
      return id["_serialized"].to_s.presence ||
             id["id"].to_s.presence ||
             id.to_s
    end
    ""
  end

  def extract_external_id(value)
    return "" if value.nil?
    return value if value.is_a?(String)
    if value.is_a?(Hash)
      return value["_serialized"].to_s.presence ||
             value["id"].to_s.presence ||
             value["user"].to_s.presence ||
             value.to_s
    end
    value.to_s
  end

  def resolve_external_chat_id(data, fallback_id)
    candidates = []
    candidates << fallback_id
    candidates << extract_external_id(data["from"])
    candidates << extract_external_id(data["to"])
    candidates << extract_external_id(data["participant"])
    candidates << extract_external_id(data["author"])
    candidates << extract_external_id(data["id"])
    if data["_data"].is_a?(Hash)
      candidates << extract_external_id(data["_data"]["from"])
      candidates << extract_external_id(data["_data"]["to"])
      candidates << extract_external_id(data["_data"]["participant"])
      candidates << extract_external_id(data["_data"]["author"])
      candidates << extract_external_id(data["_data"]["id"])
    end

    candidates = candidates.compact.map { |value| normalize_whatsapp_id(value) }.reject(&:empty?)
    preferred = candidates.find { |value| value.include?("@c.us") }
    return preferred if preferred

    ""
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

  def normalize_chat_external_id(chat)
    return "" if chat.nil?
    current = chat.external_id.to_s
    normalized = normalize_whatsapp_id(current)
    return normalized if normalized.blank? || normalized == current
    existing = WhatsappChat.find_by(project: chat.project, external_id: normalized)
    if existing && existing.id != chat.id
      return normalized
    end
    chat.update_columns(external_id: normalized)
    normalized
  end

  def resolve_external_id(from_id, to_id, own_id)
    from_id = normalize_whatsapp_id(from_id)
    to_id = normalize_whatsapp_id(to_id)
    own_id = normalize_whatsapp_id(own_id)

    if to_id.present? && to_id.include?("@g.us")
      return to_id
    end
    if from_id.present? && from_id.include?("@g.us")
      return from_id
    end
    if own_id.present?
      return from_id if from_id.present? && from_id != own_id
      return to_id if to_id.present? && to_id != own_id
    end
    return from_id if from_id.present?
    to_id.to_s
  end

    def contact_profile_for_chat(chat)
      profile = chat.contact_profile
      return profile if profile
      WhatsappContactProfile.find_by(project: @project, external_id: chat.external_id)
    end

    def ensure_contact_profile_for_chat(chat)
      return [nil, false] if chat.nil?
      profile = WhatsappContactProfile.find_by(project: @project, chat: chat)
      if profile.nil? && chat.external_id.present?
        profile = WhatsappContactProfile.find_by(project: @project, external_id: chat.external_id)
      end
      created = profile.nil?
      profile ||= WhatsappContactProfile.new(project: @project)
      profile.chat ||= chat
      profile.external_id ||= chat.external_id
      profile.last_interaction_at = Time.current
      profile.save!
      [profile, created]
    end

    def hydrate_contact_profile_basics!(profile, chat, fallback_name:, fallback_phone:)
      return if profile.nil?

      updates = {}
      if profile.first_name.to_s.strip.blank?
        candidate_name = fallback_name.to_s.strip
        candidate_name = chat.title.to_s.strip if candidate_name.blank?
        updates[:first_name] = candidate_name if candidate_name.present?
      end

      if profile.phone.to_s.strip.blank?
        candidate_phone = fallback_phone.to_s.strip
        candidate_phone = format_phone_from_external_id(chat&.external_id).to_s if candidate_phone.blank?
        updates[:phone] = candidate_phone if candidate_phone.present?
      end

      return if updates.empty?

      profile.update_columns(updates.merge(updated_at: Time.current))
      if updates[:first_name].present? && chat && chat.title.to_s.strip.blank?
        chat.update_columns(title: updates[:first_name], updated_at: Time.current)
      end
    end

    def sync_contact_profile_from_webhook(project, chat, external_id, info, from_me)
      return if project.nil?
      return if external_id.blank?
      profile = WhatsappContactProfile.find_by(project: project, external_id: external_id)
      if profile.nil? && chat
        profile = WhatsappContactProfile.find_by(project: project, chat: chat)
      end
      now = Time.current
    if profile
      updates = { last_interaction_at: now }
      if profile.deleted_at.present?
        updates[:deleted_at] = nil
      end
      if profile.external_id.blank? && external_id.present?
        updates[:external_id] = external_id
      end
      unless from_me
        updates[:points] = profile.points.to_i + 1
      end
      profile.update_columns(updates)
      return
      end
      name = info.is_a?(Hash) ? info["PushName"].to_s : ""
      name = extract_phone(external_id) if name.blank?
      phone = format_phone_from_external_id(external_id)
      new_profile = WhatsappContactProfile.new(project: project)
      new_profile.chat = chat if chat
      new_profile.external_id = external_id
      new_profile.first_name = name if name.present?
      new_profile.phone = phone if phone.present?
      new_profile.last_interaction_at = now
      new_profile.points = 1 unless from_me
      new_profile.save!
      Whatsapp::AutoWorkPackageService
        .new(project: project, contact_profile: new_profile, chat: chat, user: (User.current || User.system))
        .call(contact_was_new: true)
    end

  def formatted_profile_phone(profile, external_id)
    phone = profile&.phone.to_s.strip
    return phone if phone.present?
    format_phone_from_external_id(external_id)
  end

  def format_phone_from_external_id(external_id)
    value = external_id.to_s
    return "" if value.empty?
    raw = value.split("@").first
    return "" if raw.to_s.empty?
    raw.start_with?("+") ? raw : "+#{raw}"
  end

  def save_project_settings(params)
    settings = WhatsappProjectSetting.find_or_initialize_by(project: @project)
    settings.session_name = params[:session_name].to_s.strip
    settings.admin_name = params[:admin_name].to_s.strip
    settings.admin_email = params[:admin_email].to_s.strip
    settings.time_zone = params[:time_zone].to_s.strip
    settings.save
    settings
  end

  def project_time_zone
    settings = @project_settings || WhatsappProjectSetting.find_by(project: @project)
    @project_settings ||= settings
    settings&.time_zone.to_s.strip
  end

  def time_zone_country_map
    @time_zone_country_map ||= begin
      map = {}
      TZInfo::Country.all.each do |country|
        country.zones.each do |zone|
          map[zone.identifier] = country.code
        end
      end
      map
    end
  rescue StandardError
    {}
  end

  def format_time(value)
    return "" if value.blank?

    zone = project_time_zone
    time = zone.present? ? value.in_time_zone(zone) : value
    time.strftime("%H:%M")
  rescue StandardError
    value.strftime("%H:%M")
  end

  def format_time_full(value)
    return "" if value.blank?

    zone = project_time_zone
    time = zone.present? ? value.in_time_zone(zone) : value
    time.strftime("%d-%m-%y %H:%M")
  rescue StandardError
    value.strftime("%d-%m-%y %H:%M")
  end


  def waha_base_url
    (Setting.plugin_openproject_whatsapp || {})["waha_url"].to_s.strip
  end

  def waha_request(path, method, payload = nil, extra_headers = {})
    base_url = waha_base_url
    if base_url.blank?
      return { status: 422, json: { error: "Configura la URL del servidor WAHA." } }
    end

    base_url = "#{base_url}/" unless base_url.end_with?("/")
    url = URI.join(base_url, path.sub(/\A\//, ""))

    http = Net::HTTP.new(url.host, url.port)
    http.use_ssl = url.scheme == "https"

    request = case method
              when :post
                Net::HTTP::Post.new(url.request_uri)
              when :delete
                Net::HTTP::Delete.new(url.request_uri)
              else
                Net::HTTP::Get.new(url.request_uri)
              end

    headers = { "Accept" => "application/json" }.merge(extra_headers)
    headers.each { |key, value| request[key] = value }

    if payload
      request["Content-Type"] = "application/json"
      request.body = payload.to_json
    end
    safe_payload = sanitize_log_payload(payload)
    Rails.logger.info("[WAHA] #{request.method} #{url} payload=#{safe_payload.inspect}")

    response = http.request(request)
    content_type = response["Content-Type"].to_s.split(";").first
    Rails.logger.info("[WAHA] response status=#{response.code} content_type=#{content_type}")

    if content_type == "image/png"
      return { status: response.code.to_i, body: response.body, content_type: content_type }
    end

    json = begin
      JSON.parse(response.body)
    rescue JSON::ParserError
      { "error" => response.body.to_s }
    end
    safe_json = sanitize_log_payload(json)
    Rails.logger.info("[WAHA] response body=#{safe_json.inspect}")

    { status: response.code.to_i, json: json, content_type: content_type }
  rescue StandardError => error
    Rails.logger.error("[WAHA] request failed: #{error.class} #{error.message}")
    { status: 502, json: { error: error.message } }
  end

  def render_waha_response(response)
    status = response[:status] || 502
    json = response[:json] || { error: "Error al comunicarse con WAHA." }
    render json: json, status: status
  end

  def chat_initials(chat)
    chat.title.to_s.split.map { |word| word[0] }.join[0, 2].to_s.upcase.presence || "CH"
  end

  def sanitize_log_payload(value, max_len: 200, max_array: 30, max_hash: 50)
    case value
    when Hash
      value.to_a.first(max_hash).to_h do |key, val|
        [key, sanitize_log_payload(val, max_len: max_len, max_array: max_array, max_hash: max_hash)]
      end
    when Array
      value.first(max_array).map { |item| sanitize_log_payload(item, max_len: max_len, max_array: max_array, max_hash: max_hash) }
    when String
      return value if value.length <= max_len

      "#{value[0, max_len]}…(#{value.length} chars)"
    else
      value
    end
  end

  def truncate_chat_title(text)
    return "" if text.blank?

    text.length > 15 ? "#{text[0, 15]}..." : text
  end

  def serialize_message(message)
    metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
    outgoing = metadata["from_me"] == true || message.sender_user_id.present?
    Rails.logger.info(
      "[WAHA] serialize_message id=#{message.id} outgoing=#{outgoing} from_me_meta=#{metadata['from_me'].inspect} " \
      "sender_user_id=#{message.sender_user_id.inspect} current_user_id=#{User.current.id.inspect}"
    )
    sender_label = outgoing ? "" : (message.sender_contact&.name || message.sender_user&.name || "Contacto")

    {
      id: message.id,
      body: message.body.to_s,
      created_at: format_time(message.created_at),
      sender_label: sender_label,
      outgoing: outgoing,
      message_type: message.message_type,
      media_id: message.id,
      waha_id: metadata["waha_id"],
      reply_to: metadata["reply_to"],
      reply_to_label: metadata["reply_to_label"],
      thumb_data_url: metadata["thumb_data_url"],
      data_url: metadata["data_url"],
      remote_url: metadata["remote_url"],
      filename: metadata["filename"],
      content_type: metadata["content_type"]
    }
  end

  def truncate_preview(text)
    return "" if text.blank?

    text.length > 15 ? "#{text[0, 15]}..." : text
  end

  def chat_unread_count(chat)
    meta = chat.metadata.is_a?(Hash) ? chat.metadata : {}
    meta["unread_count"].to_i
  end

  def chat_conversation_status(chat)
    meta = chat.metadata.is_a?(Hash) ? chat.metadata : {}
    status = meta["conversation_status"].to_s.strip
    %w[started ended].include?(status) ? status : "started"
  end

  def normalize_conversation_status(value)
    text = value.to_s.strip.downcase
    return "started" if text.in?(%w[started iniciada iniciado conversacion_iniciada conversacion-iniciada conversacioniniciada])
    return "ended" if text.in?(%w[ended terminada terminado conversacion_terminada conversacion-terminada conversacionterminada])
    text
  end

  def chat_media_bytes(chat)
    WhatsappMessage.where(chat_id: chat.id)
                   .sum(Arel.sql("COALESCE((whatsapp_messages.metadata->>'file_size')::bigint, 0)"))
  end

  def media_file_sizes_by_message(message_ids)
    return {} if message_ids.blank?

    rows = WhatsappMessage.where(id: message_ids)
                          .pluck(
                            :id,
                            Arel.sql("COALESCE((whatsapp_messages.metadata->>'file_size')::bigint, 0)")
                          )
    rows.each_with_object({}) do |(message_id, size), memo|
      memo[message_id] = size.to_i
    end
  end

  def media_filename_for(message)
    metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
    value = metadata["filename"].to_s.strip
    return value if value.present?

    ext =
      case message.message_type.to_s
      when "image" then ".jpg"
      when "video" then ".mp4"
      when "audio" then ".ogg"
      else ".bin"
      end
    "#{media_type_label_for(message.message_type).downcase}_#{message.id}#{ext}"
  end

  def media_type_label_for(message_type)
    case message_type.to_s
    when "image" then "Imagen"
    when "video" then "Video"
    when "audio" then "Audio"
    when "file" then "Archivo"
    else "Archivo"
    end
  end

  def infer_media_type_for_message(message)
    raw_type = message.message_type.to_s
    return raw_type if %w[image video audio file].include?(raw_type)

    metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
    content_type = metadata["content_type"].to_s.downcase
    filename = metadata["filename"].to_s.downcase

    return "image" if content_type.start_with?("image/") || filename.match?(/\.(jpg|jpeg|png|gif|webp|bmp|heic)\z/)
    return "video" if content_type.start_with?("video/") || filename.match?(/\.(mp4|mov|avi|mkv|webm)\z/)
    return "audio" if content_type.start_with?("audio/") || filename.match?(/\.(ogg|mp3|wav|m4a|aac|opus)\z/)
    "file"
  end

  def format_media_size(bytes)
    ActionController::Base.helpers.number_to_human_size(bytes, precision: 2)
  end

  def fetch_messages(chat)
    scope = chat.messages.order(created_at: :desc, id: :desc)

    if params[:before_id].present?
      anchor = chat.messages.find_by(id: params[:before_id])
      if anchor
        scope = scope.where(
          "created_at < ? OR (created_at = ? AND id < ?)",
          anchor.created_at,
          anchor.created_at,
          anchor.id
        )
      end
    end

    messages = scope.limit(10).to_a.reverse
    oldest = messages.first

    has_more = if oldest
                 chat.messages.where(
                   "created_at < ? OR (created_at = ? AND id < ?)",
                   oldest.created_at,
                   oldest.created_at,
                   oldest.id
                 ).exists?
               else
                 false
               end

    [messages, has_more, oldest&.id]
  end

  def project_media_bytes
    WhatsappMessage.joins(:chat)
                   .where(whatsapp_chats: { project_id: @project.id })
                   .sum(Arel.sql("COALESCE((whatsapp_messages.metadata->>'file_size')::bigint, 0)"))
  end

  def project_media_bytes_for(project_id)
    WhatsappMessage.joins(:chat)
                   .where(whatsapp_chats: { project_id: project_id })
                   .sum(Arel.sql("COALESCE((whatsapp_messages.metadata->>'file_size')::bigint, 0)"))
  end

  def refresh_chat_last_message_at!(chat)
    return unless chat

    latest_at = chat.messages.maximum(:created_at)
    chat.update_columns(last_message_at: latest_at, updated_at: Time.current)
  end

  def message_media
    message = WhatsappMessage.find_by(id: params[:id])
    if message.nil? || message.chat.nil? || message.chat.project_id != @project.id
      render json: { error: "Sin media." }, status: :not_found
      return
    end
    metadata = message.metadata.is_a?(Hash) ? message.metadata : {}
    data_url = metadata["data_url"].to_s
    thumb_data_url = metadata["thumb_data_url"].to_s
    filename = metadata["filename"].to_s.presence || "archivo"
    content_type = metadata["content_type"].to_s
    remote_url = metadata["remote_url"].to_s
    download = params[:download].to_s == "1"
    Rails.logger.info("[WAHA] message_media id=#{message.id} type=#{message.message_type} data_url=#{data_url.present?} remote_url=#{remote_url.present?} content_type=#{content_type}")

    if download
      if data_url.present?
        begin
          data_header, base64_payload = data_url.split(",", 2)
          header_type = data_header.to_s.split(":", 2)[1].to_s.split(";", 2)[0].to_s
          effective_type = content_type.presence || header_type.presence || "application/octet-stream"
          send_data(
            Base64.decode64(base64_payload.to_s),
            type: effective_type,
            disposition: "inline",
            filename: filename
          )
          return
        rescue StandardError => error
          Rails.logger.error("[WAHA] message_media download decode failed: #{error.class} #{error.message}")
        end
      end
      if remote_url.present?
        begin
          uri = URI.parse(remote_url)
          response = Net::HTTP.get_response(uri)
          Rails.logger.info("[WAHA] message_media download fetch status=#{response.code} content_type=#{response['Content-Type'].to_s}")
          if response.is_a?(Net::HTTPSuccess)
            response_type = response["Content-Type"].to_s
            effective_type = response_type.presence || content_type.presence || "application/octet-stream"
            send_data(
              response.body.to_s,
              type: effective_type,
              disposition: "inline",
              filename: filename
            )
            return
          end
        rescue StandardError => error
          Rails.logger.error("[WAHA] message_media download fetch failed: #{error.class} #{error.message}")
        end
      end
      render json: { error: "Sin media." }, status: :not_found
      return
    end

    if data_url.present? && remote_url.present? && data_url.length < 120_000
      begin
        uri = URI.parse(remote_url)
        response = Net::HTTP.get_response(uri)
        Rails.logger.info("[WAHA] message_media fetch status=#{response.code} content_type=#{response['Content-Type'].to_s}")
        if response.is_a?(Net::HTTPSuccess)
          response_type = response["Content-Type"].to_s
          base64 = Base64.strict_encode64(response.body)
          content_type = content_type.presence || response_type.presence || "application/octet-stream"
          metadata["thumb_data_url"] = data_url if thumb_data_url.blank?
          data_url = "data:#{content_type};base64,#{base64}"
          message.update!(metadata: metadata.merge("data_url" => data_url, "content_type" => content_type))
          Rails.logger.info("[WAHA] message_media data_url upgraded id=#{message.id} bytes=#{response.body.to_s.bytesize}")
        end
      rescue StandardError => error
        Rails.logger.error("[WAHA] message_media fetch failed: #{error.class} #{error.message}")
      end
    elsif data_url.blank? && remote_url.present?
      begin
        uri = URI.parse(remote_url)
        response = Net::HTTP.get_response(uri)
        Rails.logger.info("[WAHA] message_media fetch status=#{response.code} content_type=#{response['Content-Type'].to_s}")
        if response.is_a?(Net::HTTPSuccess)
          response_type = response["Content-Type"].to_s
          base64 = Base64.strict_encode64(response.body)
          content_type = content_type.presence || response_type.presence || "application/octet-stream"
          data_url = "data:#{content_type};base64,#{base64}"
          message.update!(metadata: metadata.merge("data_url" => data_url, "content_type" => content_type))
          Rails.logger.info("[WAHA] message_media data_url saved id=#{message.id} bytes=#{response.body.to_s.bytesize}")
        end
      rescue StandardError => error
        Rails.logger.error("[WAHA] message_media fetch failed: #{error.class} #{error.message}")
      end
    end

    if data_url.present?
      render json: { data_url: data_url, download_url: remote_url.presence, filename: filename }
    elsif remote_url.present?
      render json: { download_url: remote_url, filename: filename }
    else
      render json: { error: "Sin media." }, status: :not_found
    end
  end

  public :message_media

  def extract_phone(external_id)
    external_id.to_s.split("@").first
  end

  def map_message_type(raw_type, has_media, mimetype = "")
    type = raw_type.to_s.downcase
    normalized_mime = mimetype.to_s.downcase
    if normalized_mime.start_with?("image/")
      return "image"
    end
    if normalized_mime.start_with?("video/")
      return "video"
    end
    if normalized_mime.start_with?("audio/")
      return "audio"
    end
    case type
    when "chat", "text"
      "text"
    when "image"
      "image"
    when "video"
      "video"
    when "audio", "ptt", "voice"
      "audio"
    when "document", "file"
      "file"
    else
      has_media ? "file" : "text"
    end
  end

  def serialize_message_for_broadcast(message, outgoing)
    sender_label = outgoing ? "" : (message.sender_contact&.name || message.sender_user&.name || "Contacto")
    metadata = message.metadata.is_a?(Hash) ? message.metadata : {}

    {
      id: message.id,
      body: message.body.to_s,
      created_at: format_time(message.created_at),
      sender_label: sender_label,
      outgoing: outgoing,
      message_type: message.message_type,
      media_id: message.id,
      waha_id: metadata["waha_id"],
      reply_to: metadata["reply_to"],
      reply_to_label: metadata["reply_to_label"],
      thumb_data_url: metadata["thumb_data_url"],
      data_url: metadata["data_url"],
      remote_url: metadata["remote_url"],
      filename: metadata["filename"],
      content_type: metadata["content_type"]
    }
  end

  def preview_for_message(message)
    text = message.body.to_s
    if text.blank?
      return "Imagen" if message.message_type == "image"
      return "Video" if message.message_type == "video"
      return "Nota de voz" if message.message_type == "audio"
      return "Archivo" if message.message_type == "file"
      return "Actividad" if message.message_type == "activity"
    end
    truncate_preview(text)
  end

  def fetch_waha_status(session_name)
    response = waha_request("/api/sessions/#{CGI.escape(session_name)}", :get)
    json = response[:json].is_a?(Hash) ? response[:json] : {}
    json["status"].to_s
  rescue StandardError
    ""
  end

  def broadcast_webhook_debug(project, label, payload)
    WhatsappChannel.broadcast_to(
      "project:#{project.id}",
      { debug: { channel: "webhook", label: label, payload: payload } }
    )
  rescue StandardError => error
    Rails.logger.error("[WAHA] webhook debug broadcast failed: #{error.class} #{error.message}")
  end

  def require_admin!
    return false if User.current&.admin?

    render json: { error: "Acceso denegado." }, status: :forbidden
    true
  end

  def touch_chat_last_message_at(chat, time)
    return if chat.nil?
    ts = time.is_a?(Time) ? time : (time.present? ? Time.at(time.to_i) : nil)
    ts ||= Time.current
    current = chat.last_message_at
    return if current && current >= ts
    chat.update_columns(last_message_at: ts)
  rescue StandardError
  end
end
