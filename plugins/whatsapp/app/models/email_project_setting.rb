class EmailProjectSetting < ApplicationRecord
  belongs_to :project

  CUSTOM_SMTP_SOURCES = %w[smtp2 smtp3 smtp4].freeze
  SMTP_SOURCES = (["openproject"] + CUSTOM_SMTP_SOURCES).freeze
  RATE_UNITS = %w[second minute hour].freeze

  validates :project_id, presence: true
  validates :throttle_per_minute,
            numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: 600 }
  validates :global_rate_limit_count,
            numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: 10_000 }
  validates :global_rate_limit_period_value,
            numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: 10_000 }
  validates :global_rate_limit_period_unit, inclusion: { in: RATE_UNITS }
  validate :smtp_required_if_enabled

  def smtp_settings
    smtp_settings_for("smtp2")
  end

  def smtp_settings_for(source)
    source_key = normalize_smtp_source(source)
    return {} unless CUSTOM_SMTP_SOURCES.include?(source_key)

    prefix = source_key == "smtp2" ? "" : "#{source_key}_"
    {
      address: read_attr("#{prefix}address"),
      port: read_attr("#{prefix}port"),
      domain: read_attr("#{prefix}domain"),
      user_name: read_attr("#{prefix}user_name"),
      password: read_attr("#{prefix}password"),
      authentication: read_attr("#{prefix}authentication").to_s.presence&.to_sym,
      enable_starttls_auto: !!read_attr("#{prefix}enable_starttls_auto"),
      ssl: !!read_attr("#{prefix}ssl"),
      openssl_verify_mode: read_attr("#{prefix}openssl_verify_mode"),
      read_timeout: read_attr("#{prefix}timeout"),
      open_timeout: read_attr("#{prefix}timeout")
    }.compact
  end

  def custom_smtp_configured?(source)
    source_key = normalize_smtp_source(source)
    return false unless CUSTOM_SMTP_SOURCES.include?(source_key)
    settings = smtp_settings_for(source_key)
    settings[:address].to_s.strip.present? && settings[:port].to_i > 0
  end

  def mail_from_for(source)
    source_key = normalize_smtp_source(source)
    case source_key
    when "smtp2"
      mail_from.to_s.presence
    when "smtp3"
      smtp3_mail_from.to_s.presence
    when "smtp4"
      smtp4_mail_from.to_s.presence
    else
      nil
    end
  end

  def reply_to_for(source)
    source_key = normalize_smtp_source(source)
    case source_key
    when "smtp2"
      reply_to.to_s.presence
    when "smtp3"
      smtp3_reply_to.to_s.presence
    when "smtp4"
      smtp4_reply_to.to_s.presence
    else
      nil
    end
  end

  def sender_name_list
    sender_names.to_s
                .split(/[\r\n,]+/)
                .map(&:strip)
                .reject(&:blank?)
                .uniq
  end

  def use_layout_for?(smtp_source)
    if CUSTOM_SMTP_SOURCES.include?(normalize_smtp_source(smtp_source))
      use_layout_plugin?
    else
      use_layout_default?
    end
  end

  def global_rate_limit_active?
    global_rate_limit_enabled? && global_rate_limit_count.to_i > 0 && global_rate_limit_period_seconds.to_i > 0
  end

  def global_rate_limit_period_seconds
    value = global_rate_limit_period_value.to_i
    return 0 if value <= 0

    multiplier = case global_rate_limit_period_unit.to_s
                 when "second" then 1
                 when "minute" then 60
                 when "hour" then 3600
                 else 0
                 end
    value * multiplier
  end

  private

  def normalize_smtp_source(value)
    source = value.to_s
    source = "smtp2" if source == "plugin"
    SMTP_SOURCES.include?(source) ? source : "openproject"
  end

  def read_attr(name)
    self[name]
  end

  def smtp_required_if_enabled
    return unless use_plugin_smtp

    errors.add(:smtp_address, "no puede estar vacio") if smtp_address.to_s.strip.empty?
    errors.add(:smtp_port, "no puede estar vacio") if smtp_port.to_i <= 0
  end
end
