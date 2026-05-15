class EmailEmailSendJob < ApplicationJob
  queue_with_priority :notification

  def perform(delivery_id)
    delivery = EmailDelivery.find_by(id: delivery_id)
    return unless delivery
    return if delivery.status == "sent"

    if delivery.scheduled_at.present? && delivery.scheduled_at > Time.current
      self.class.set(wait_until: delivery.scheduled_at).perform_later(delivery_id)
      return
    end

    settings = EmailProjectSetting.find_by(project: delivery.project)
    if (retry_at = next_rate_limited_time(delivery, settings))
      delivery.update_columns(status: "queued", scheduled_at: retry_at)
      self.class.set(wait_until: retry_at).perform_later(delivery_id)
      return
    end

    delivery.update_columns(status: "sending")

    renderer = EmailEmail::TemplateRenderer.new(
      project: delivery.project,
      sender: delivery.sender,
      recipient: delivery.recipient_user,
      signature: settings&.signature,
      contact: delivery.contact_profile,
      render_tokens: delivery.render_tokens
    )

    subject = renderer.render_text(delivery.subject)
    body = renderer.render_text(delivery.body.to_s)

    if delivery.body_html.present?
      html_body = renderer.render_text(delivery.body_html.to_s)
      text_body = renderer.render_plain_from_html(html_body)
    else
      html_body = renderer.render_html(body)
      text_body = renderer.render_plain_from_html(html_body)
    end

    html_body = inject_open_tracking_pixel(delivery, html_body)

    delivery.update_columns(subject: subject, body: body, body_html: html_body)

    EmailEmailMailer.send_email(delivery.id,
                                subject: subject,
                                html_body: html_body,
                                text_body: text_body).deliver_now

    delivery.update_columns(status: "sent", sent_at: Time.current)
    delivery.log_email_sent_activity!
  rescue StandardError => error
    delivery&.update_columns(status: "failed", error_message: error.message)
    raise
  end

  private

  def next_rate_limited_time(delivery, settings)
    return nil unless settings&.global_rate_limit_active?
    return nil if delivery.bypass_rate_limit?

    limit = settings.global_rate_limit_count.to_i
    period_seconds = settings.global_rate_limit_period_seconds.to_i
    return nil if limit <= 0 || period_seconds <= 0

    now = Time.current
    window_start = now - period_seconds.seconds
    sent_scope = EmailDelivery
                 .where(project_id: delivery.project_id, status: "sent")
                 .where("sent_at > ?", window_start)
                 .order(sent_at: :asc, id: :asc)

    sent_count = sent_scope.count
    return nil if sent_count < limit

    blocking_delivery = sent_scope.offset(sent_count - limit).first
    return nil unless blocking_delivery&.sent_at

    retry_at = blocking_delivery.sent_at + period_seconds.seconds + 1.second
    retry_at > now ? retry_at : nil
  end

  def inject_open_tracking_pixel(delivery, html_body)
    return html_body unless delivery.open_tracking_active?

    tracking_url = Rails.application.routes.url_helpers.whatsapp_plugin_project_email_open_track_url(
      project_id: delivery.project_id,
      token: delivery.open_tracking_token,
      protocol: Setting.protocol,
      host: Setting.host_name
    )
    pixel_tag = %(<img src="#{tracking_url}" alt="" width="1" height="1" style="display:none !important;max-height:0;max-width:0;opacity:0;overflow:hidden;" />)

    value = html_body.to_s
    if value.match?(%r{</body>}i)
      value.sub(%r{</body>}i, "#{pixel_tag}</body>")
    else
      "#{value}#{pixel_tag}"
    end
  rescue StandardError
    html_body
  end
end
