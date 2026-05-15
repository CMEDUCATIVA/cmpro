require "open_project/plugins"

module OpenProject
  module Whatsapp
    class Engine < ::Rails::Engine
      engine_name :openproject_whatsapp

      include OpenProject::Plugins::ActsAsOpEngine

      initializer "openproject_whatsapp.add_migrations" do |app|
        next if app.root.to_s.match?(root.to_s)

        app.config.paths["db/migrate"].concat(config.paths["db/migrate"].expanded)
      end

      initializer "openproject_whatsapp.assets.precompile" do |app|
        app.config.assets.precompile += %w[
          chat.js
          openproject-whatsapp.js
          responsable_wa_chat_card.js
          conversation_selector.js
          openproject-whatsapp-countries.js
          wa-debug.js
          contacto.js
          click_edit.js
          contacto_delete.js
          contacto_historial_dashboard.js
          contacto_grabado.js
          nextcloud_contacto.js
          contacto.css
          whatsapp_relaciones.js
          whatsapp_relaciones.css
          email/email_email.js
          email/email_email.css
          email/flows_builder.js
          email/flows_builder_history.js
          email/flows_builder_webhook_input.js
          email/flows_builder_transform_json.js
          email/flows_builder_rate_limit.js
          email/flows_builder.css
          whatsapp_board_inject.js
          whatsapp_board_inject.css
        ]
      end

      initializer "openproject_whatsapp.hooks" do
        config.to_prepare do
          require_dependency "open_project/whatsapp/hooks"
        end
      end

      register(
        "openproject-whatsapp",
        author_url: "https://cmeducativa.es",
        author: "Vin Francis",
        bundled: false,
        requires_openproject: ">= 13.0.0",
        settings: {
          default: {
            "waha_url" => ""
          }
        }
      ) do
        project_module :whatsapp do
          permission :view_whatsapp, { whatsapp: [:index, :search_chats, :work_package_types, :boards, :board_lists, :board_cards, :related_work_packages, :work_package_details, :work_package_chat, :work_package_statuses, :media_files] }, permissible_on: [:project]
          permission :send_whatsapp_message, { whatsapp: [:create_message, :create_image_message, :create_video_message, :create_file_message, :message_media, :start_typing, :stop_typing, :create_chat, :destroy_chat, :contact_profile, :upsert_contact_profile, :toggle_favorite, :mark_chat_read, :update_chat_status, :debug_log, :create_related_work_package, :destroy_related_work_package, :unlink_related_work_package, :board_add_card, :destroy_board_card, :create_activity_note, :update_ai_flow, :destroy_media_file, :bulk_destroy_media_files] }, permissible_on: [:project]
          permission :manage_whatsapp_settings, { whatsapp: [:update_settings, :create_waha_session, :start_waha_session, :waha_session_status, :qr_waha_session, :delete_waha_session, :admin_connections, :update_admin_connection_limit, :create_template, :update_template, :destroy_template, :template_media] }, permissible_on: [:project]
          permission :manage_whatsapp_contacts, { contactos: [:index, :history, :show, :new, :create, :update, :bulk_assign, :destroy, :duplicates, :export, :import, :create_field, :update_field, :destroy_field, :fields_panel, :update_fields_order, :update_form_order, :table_settings, :update_table_settings, :edit_panel, :tags_index, :tags_upsert, :tags_color, :tags_rename, :tags_destroy, :files_index, :files_create, :files_destroy, :call_activity, :pause_activity, :call_history_index, :call_history_audio, :call_history_destroy, :recorder_log, :recorder_preview_create, :recorder_preview_show], "contactos/menus": [:show] }, permissible_on: [:project]
        end

        project_module :email do
          permission :view_email, { email_email: [:index, :settings, :templates, :send_form, :history, :destroy_history_delivery, :destroy_history_pending, :destroy_history_bulk, :flows, :flows_history, :flow_history_data, :flow_data, :flow_list, :recent_deliveries] }, permissible_on: [:project]
          permission :manage_email_settings, { email_email: [:update_settings] }, permissible_on: [:project]
          permission :manage_email_templates, { email_email: [:new_template, :create_template, :edit_template, :update_template, :destroy_template] }, permissible_on: [:project]
          permission :send_email_messages, { email_email: [:send_email, :preview] }, permissible_on: [:project]
          permission :manage_email_flows, { email_email: [:save_flow, :run_flow, :delete_flow, :ia_agents] }, permissible_on: [:project]
        end

        menu :project_menu,
             :whatsapp,
             { controller: "/whatsapp", action: "index" },
             after: :overview,
             param: :project_id,
             caption: "WhatsApp",
             icon: "comment-discussion"

        menu :project_menu,
             :contactos,
             { controller: "/contactos", action: "index" },
             after: :whatsapp,
             param: :project_id,
             caption: "Contactos",
             icon: "person"

        menu :project_menu,
             :contactos_sort_select,
             { controller: "/contactos", action: "index" },
             parent: :contactos,
             param: :project_id,
             partial: "contactos/menus/menu",
             last: true,
             caption: "Ordenar contactos"

        menu :project_menu,
             :email,
             { controller: "/email_email", action: "index" },
             after: :contactos,
             param: :project_id,
             caption: "Email",
             icon: "mail"
      end
    end
  end
end
