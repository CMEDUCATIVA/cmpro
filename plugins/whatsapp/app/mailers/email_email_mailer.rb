class EmailEmailMailer < ApplicationMailer
  layout false

  def send_email(delivery_id, subject:, html_body:, text_body:)
    delivery = EmailDelivery.find(delivery_id)
    project = delivery.project
    settings = EmailProjectSetting.find_by(project: project)

    @html_body = html_body
    @text_body = text_body

    Rails.logger.info(
      "[EmailEmailMailer] delivery_id=#{delivery.id} project_id=#{project&.id} " \
      "smtp_source=#{delivery.smtp_source} sender_name=#{delivery.sender_name.to_s.inspect}"
    )

    headers = {
      to: delivery.recipient_email,
      subject: subject,
      from: resolve_from(delivery, settings),
      reply_to: resolve_reply_to(delivery, settings),
      delivery_method_options: smtp_options_for(delivery, settings)
    }

    use_layout = false

    add_attachments(delivery)

    mail(headers) do |format|
      if use_layout
        Rails.logger.info("[EmailEmailMailer] render with mailer layout for smtp=#{delivery.smtp_source}")
        format.html { render html: html_body.html_safe, layout: "mailer" }
        format.text { render plain: text_body, layout: "mailer" }
      else
        Rails.logger.info("[EmailEmailMailer] render without layout for smtp=#{delivery.smtp_source}")
        format.html { render html: html_body.html_safe, layout: false }
        format.text { render plain: text_body, layout: false }
      end
    end
  end

  private

  def mail(headers = {}, &block)
    to = headers[:to]
    if to.is_a?(User)
      return super
    end

    base_mail = ActionMailer::Base.instance_method(:mail).bind(self)
    base_mail.call(headers.merge(to: to.to_s), &block)
  end

  def resolve_layout(delivery)
    custom_smtp_source?(delivery.smtp_source) ? false : "mailer"
  end

  def resolve_from(delivery, settings)
    smtp_source = normalize_smtp_source(delivery.smtp_source)
    base = if custom_smtp_source?(smtp_source)
             settings&.mail_from_for(smtp_source) || Setting.mail_from
           else
             Setting.mail_from
           end
    name = delivery.sender_name.to_s.strip
    return base if name.blank?

    email = extract_email_address(base)
    return base if email.blank?

    "#{name} <#{email}>"
  end

  def resolve_reply_to(delivery, settings)
    smtp_source = normalize_smtp_source(delivery.smtp_source)
    return nil unless custom_smtp_source?(smtp_source)

    settings&.reply_to_for(smtp_source)
  end

  def smtp_options_for(delivery, settings)
    smtp_source = normalize_smtp_source(delivery.smtp_source)
    return {} unless custom_smtp_source?(smtp_source)
    return {} unless settings

    return settings.smtp_settings_for(smtp_source) if settings.custom_smtp_configured?(smtp_source)

    raise "SMTP #{smtp_source.upcase} no configurado"
  end

  def custom_smtp_source?(source)
    EmailProjectSetting::CUSTOM_SMTP_SOURCES.include?(normalize_smtp_source(source))
  end

  def normalize_smtp_source(source)
    value = source.to_s
    value = "smtp2" if value == "plugin"
    EmailProjectSetting::SMTP_SOURCES.include?(value) ? value : "openproject"
  end

  def extract_email_address(raw)
    value = raw.to_s
    match = value.match(/<([^>]+)>/)
    return match[1] if match
    value
  end

  def add_attachments(delivery)
    delivery.email_attachments.find_each do |attachment|
      path = attachment.storage_path.to_s
      unless File.exist?(path)
        Rails.logger.warn("[EmailEmailMailer] attachment missing id=#{attachment.id} path=#{path}")
        next
      end
      attachments[attachment.file_name.to_s] = {
        mime_type: attachment.content_type.to_s.presence || "application/octet-stream",
        content: File.binread(path)
      }
    end
  end
end
