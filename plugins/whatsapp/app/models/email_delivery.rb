class EmailDelivery < ApplicationRecord
  require "securerandom"

  belongs_to :contact_profile, class_name: "WhatsappContactProfile", optional: true
  STATUSES = %w[queued sending sent failed].freeze
  SMTP_SOURCES = EmailProjectSetting::SMTP_SOURCES.freeze

  belongs_to :project
  belongs_to :email_template, optional: true
  belongs_to :sender, class_name: "User", optional: true
  belongs_to :recipient_user, class_name: "User", optional: true
  has_many :email_attachments, dependent: :destroy

  validates :subject, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :smtp_source, inclusion: { in: SMTP_SOURCES }
  validates :recipient_email, presence: true

  before_validation :prepare_open_tracking_token

  def open_tracking_active?
    open_tracking_token.to_s.present?
  end

  def register_open!
    now = Time.current
    attrs = {
      open_count: open_count.to_i + 1,
      last_opened_at: now
    }
    attrs[:opened_at] = now if opened_at.blank?
    update_columns(attrs)
  end

  def log_email_sent_activity!
    note = [
      "**ENVIADO**",
      "Asunto: #{subject.to_s}",
      "Destinatario: #{recipient_email.to_s}",
      "Fecha y hora: #{format_activity_time(sent_at || Time.current)}"
    ].join("\n")
    append_work_package_note!(note)
  end

  def log_email_opened_activity!
    opened_time = last_opened_at || opened_at || Time.current
    note = [
      "**ABIERTO**",
      "Asunto: #{subject.to_s}",
      "Destinatario: #{recipient_email.to_s}",
      "Primera apertura: #{format_activity_time(opened_at || opened_time)}",
      "Aperturas acumuladas: #{open_count.to_i}"
    ].join("\n")
    append_work_package_note!(note)
  end

  private

  def prepare_open_tracking_token
    return if open_tracking_token.present?
    return unless email_template&.open_tracking_enabled?

    self.open_tracking_token = loop do
      token = SecureRandom.hex(20)
      break token unless self.class.exists?(open_tracking_token: token)
    end
  end

  def append_work_package_note!(note)
    user = activity_user
    return if user.nil?

    related_work_packages.each do |work_package|
      next unless user.allowed_in_project?(:add_work_package_comments, work_package.project)

      AddWorkPackageNoteService
        .new(user: user, work_package: work_package)
        .call(note, send_notifications: true, internal: false)
    rescue StandardError => error
      Rails.logger.warn(
        "[EmailActivity] failed work_package_id=#{work_package&.id} delivery_id=#{id} error=#{error.class}: #{error.message}"
      )
    end
  end

  def related_work_packages
    return [] unless contact_profile_id.present?

    scope = WhatsappWorkPackageRelation.where(project_id: project_id)
    chat_id = contact_profile&.chat_id
    scope = if chat_id.present?
              scope.where("contact_profile_id = ? OR chat_id = ?", contact_profile_id, chat_id)
            else
              scope.where(contact_profile_id: contact_profile_id)
            end
    scope.includes(:work_package).map(&:work_package).compact.uniq(&:id)
  end

  def activity_user
    sender.presence || project.users.active.order(:id).first
  rescue StandardError
    sender
  end

  def format_activity_time(value)
    return "" if value.blank?

    value.in_time_zone.strftime("%Y-%m-%d %H:%M:%S")
  rescue StandardError
    value.to_s
  end
end
