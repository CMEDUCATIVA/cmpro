module Bim
  module IfcModels
    class RowComponent < ::RowComponent
      property :created_at

      def title
        if still_processing?
          model.title
        else
          link_to model.title,
                  bcf_project_ifc_model_path(model.project, model)
        end
      end

      def default?
        if model.is_default?
          helpers.op_icon "icon icon-checkmark"
        end
      end

      def updated_at
        helpers.format_date(model.updated_at)
      end

      def uploader
        icon = helpers.avatar model.uploader, size: :mini
        icon + model.uploader.name
      end

      def processing
        content_tag(:div, class: "ifc-models--conversion", data: { ifc_progress_row: true, ifc_model_id: model.id }) do
          content = content_tag(:div, class: "ifc-models--conversion-bar-wrap", style: "position:relative;width:100%;max-width:320px;height:24px;border-radius:12px;background:#e5e7eb;overflow:hidden;") do
            bar = content_tag(:div,
                        "",
                        class: "ifc-models--conversion-status",
                        data: { ifc_progress_bar: true },
                        style: "width: #{progress_value}%;height:100%;background:#{progress_color};transition:width .35s ease;")
            text = content_tag(:div,
                               progress_text,
                               data: { ifc_progress_text: true },
                               style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 8px;color:#ffffff;font-size:12px;font-weight:600;white-space:nowrap;text-shadow:0 1px 1px rgba(0,0,0,.45);")
            bar + text
          end

          if model.conversion_error_message.present?
            content << content_tag(:div,
                                   model.conversion_error_message,
                                   class: "ifc-models--conversion-status-error",
                                   data: { ifc_progress_error: true },
                                   style: "margin-top:4px;color:#b91c1c;font-size:12px;",
                                   title: model.conversion_error_message)
          else
            content << content_tag(:div, "", data: { ifc_progress_error: true })
          end

          content
        end
      end

      def still_processing?
        model.xkt_attachment.nil?
      end

      def progress_value
        model.conversion_progress_value
      end

      def progress_label
        model.conversion_step.presence || fallback_step
      end

      def fallback_step
        case model.conversion_status
        when "processing" then "Preparacion"
        when "completed" then "Completado"
        when "error" then "Error"
        else "Pendiente"
        end
      end

      def progress_text
        "#{progress_label} #{progress_value}%"
      end

      def progress_color
        return "#dc2626" if model.conversion_status == "error"
        return "#16a34a" if %w[processing completed].include?(model.conversion_status)

        "#6b7280"
      end

      ###

      def button_links
        links = []
        # Seeded IFC models currently actually only have the XKT and NOT(!) the IFC original seeded
        if model.ifc_attachment
          links << download_link
        end

        if User.current.allowed_in_project?(:manage_ifc_models, model.project)
          links.push(edit_link, delete_link)
        else
          links
        end
      end

      def delete_link
        link_to "",
                bcf_project_ifc_model_path(model.project, model),
                class: "icon icon-delete",
                data: { confirm: I18n.t(:text_are_you_sure) },
                title: I18n.t(:button_delete),
                method: :delete
      end

      def download_link
        link_to "",
                API::V3::Utilities::PathHelper::ApiV3Path.attachment_content(model.ifc_attachment&.id),
                class: "icon icon-download",
                title: I18n.t(:button_download),
                download: true
      end

      def edit_link
        link_to "",
                edit_bcf_project_ifc_model_path(model.project, model),
                class: "icon icon-edit",
                accesskey: helpers.accesskey(:edit),
                title: I18n.t(:button_edit)
      end
    end
  end
end
