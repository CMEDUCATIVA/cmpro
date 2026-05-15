module OpenProject::Documentos
  class Hooks < OpenProject::Hook::ViewListener
    # Hook para cargar los módulos JS independientes del plugin
    render_on :view_layouts_base_html_head, partial: 'documentos/hooks/assets'
  end
end
