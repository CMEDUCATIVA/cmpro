class Whatsapp::AutoWorkPackageService
  def initialize(project:, contact_profile:, chat:, user:, work_package_type_id: nil)
    @project = project
    @contact_profile = contact_profile
    @chat = chat
    @user = user
    @work_package_type_id = work_package_type_id.to_s.presence
  end

  def call(contact_was_new: true)
    return if @project.nil?

    relation = find_existing_relation
    if relation
      link_missing_associations(relation)
      update_existing_work_package_type!(relation)
      return relation
    end

    work_package = create_work_package
    return if work_package.nil?

    WhatsappWorkPackageRelation.create!(
      project: @project,
      chat: @chat,
      contact_profile: @contact_profile,
      work_package: work_package,
      created_by: @user
    )
  end

  private

  def find_existing_relation
    return nil if @chat.nil? && @contact_profile.nil?

    scope = WhatsappWorkPackageRelation.where(project: @project)
    if @chat && @contact_profile
      scope = scope.where("chat_id = ? OR contact_profile_id = ?", @chat.id, @contact_profile.id)
    elsif @chat
      scope = scope.where(chat_id: @chat.id)
    elsif @contact_profile
      scope = scope.where(contact_profile_id: @contact_profile.id)
    end
    scope.order(created_at: :desc).first
  end

  def link_missing_associations(relation)
    updates = {}
    if @chat && relation.chat_id.nil?
      updates[:chat_id] = @chat.id
    end
    if @contact_profile && relation.contact_profile_id.nil?
      updates[:contact_profile_id] = @contact_profile.id
    end
    return if updates.empty?

    relation.update_columns(updates.merge(updated_at: Time.current))
  end

  def create_work_package
    type = resolve_type
    return if type.nil?

    subject = resolve_subject
    return if subject.blank?

    call = WorkPackages::CreateService.new(user: @user).call(
      project: @project,
      type_id: type.id,
      subject: subject
    )

    unless call.success?
      Rails.logger.info("[WA] auto_wp.create.failed project_id=#{@project.id} errors=#{call.errors.full_messages.join(', ')}")
      return
    end

    call.result
  end

  def resolve_type
    types = Type.enabled_in(@project)
    preferred = selected_type_from_project(types)
    return preferred if preferred

    return types.find_by("LOWER(types.name) = ?", "tarea") ||
           types.find_by("LOWER(types.name) = ?", "task") ||
           types.first
  end

  def selected_type_from_project(types = nil)
    return nil if @work_package_type_id.blank?

    scope = types || Type.enabled_in(@project)
    scope.find_by(id: @work_package_type_id)
  end

  def update_existing_work_package_type!(relation)
    return if relation.nil? || @work_package_type_id.blank?

    work_package = relation.work_package
    return if work_package.nil?

    selected_type = selected_type_from_project
    return if selected_type.nil?
    return if work_package.type_id.to_i == selected_type.id.to_i

    work_package.update(type_id: selected_type.id)
  rescue StandardError => error
    Rails.logger.info(
      "[WA] auto_wp.update_type.failed project_id=#{@project&.id} relation_id=#{relation&.id} " \
      "type_id=#{@work_package_type_id} error=#{error.message}"
    )
  end

  def resolve_subject
    parts = []
    if @contact_profile
      parts << @contact_profile.first_name.to_s.strip
      parts << @contact_profile.last_name.to_s.strip
    end
    subject = parts.reject(&:blank?).join(" ").strip
    return subject if subject.present?

    return @chat.title.to_s.strip if @chat&.title.to_s.strip.present?
    return @chat.external_id.to_s.strip if @chat&.external_id.to_s.strip.present?

    "Contacto #{@contact_profile&.id}".to_s.strip
  end
end
