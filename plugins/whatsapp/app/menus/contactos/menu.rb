module Contactos
  class Menu < ::Submenu
    SORT_OPTIONS = [
      { title: "Registro reciente", sort: "registration_date_desc" },
      { title: "Registro antiguo", sort: "registration_date_asc" },
      { title: "Actualización reciente", sort: "last_interaction_desc" },
      { title: "Actualización antigua", sort: "last_interaction_asc" },
      { title: "Open email ↑", sort: "open_email_asc" },
      { title: "Open email ↓", sort: "open_email_desc" }
    ].freeze

    def initialize(params:, project: nil)
      super(view_type: nil, project:, params:)
    end

    def menu_items
      [
        OpenProject::Menu::MenuGroup.new(header: "Ordenar contactos", children: sort_sidebar_menu_items)
      ]
    end

    def query_path(query_params)
      base_params = params.permit(:q, :assigned_to_id, :filters_json, :per_page, :page).to_h.symbolize_keys
      merged_params = base_params.merge(query_params).compact
      merged_params.delete(:sort) if merged_params[:sort].blank?

      whatsapp_plugin_project_contactos_path(project, merged_params)
    end

    private

    def sort_sidebar_menu_items
      SORT_OPTIONS.map do |option|
        menu_item(
          title: option[:title],
          query_params: { sort: option[:sort] },
          selected: selected_sort?(option[:sort])
        )
      end
    end

    def selected_sort?(sort_value)
      current_sort = params[:sort].to_s

      case sort_value
      when "registration_date_desc"
        current_sort.blank? || current_sort == "registration_date_desc" || current_sort == "registration_date"
      when "last_interaction_desc"
        current_sort == "last_interaction_desc" || current_sort == "last_interaction"
      else
        current_sort == sort_value
      end
    end
  end
end
