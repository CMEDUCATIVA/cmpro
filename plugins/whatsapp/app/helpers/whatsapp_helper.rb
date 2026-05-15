module WhatsappHelper
  def wa_linkify(text)
    return "" if text.blank?

    escaped = ERB::Util.html_escape(text.to_s)
    pattern = /((https?:\/\/|www\.)[^\s<]+|[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})/i

    linked = escaped.gsub(pattern) do |match|
      clean = match
      trailing = ""
      while /[).,!?:;]$/.match?(clean)
        trailing = clean[-1] + trailing
        clean = clean[0..-2]
      end

      href = if clean.include?("@") && !clean.start_with?("http") && !clean.start_with?("www.")
               "mailto:#{clean}"
             else
               clean.start_with?("http") ? clean : "https://#{clean}"
             end

      %(<a href="#{href}" target="_blank" rel="noopener noreferrer">#{clean}</a>#{trailing})
    end

    linked.html_safe
  end
end
