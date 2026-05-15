# Prevent load-order problems in case openproject-plugins is listed after a plugin in the core
require 'active_support/dependencies'
require 'open_project/plugins'

module OpenProject::Documentos
  class Engine < ::Rails::Engine
    engine_name :openproject_documentos

    include OpenProject::Plugins::ActsAsOpEngine

    register(
      'openproject-documentos',
      name: 'Documentos',
      author_url: 'https://cmeducativa.es',
      author: 'Vin Francis',
      bundled: false,
      requires_openproject: '>= 13.0.0'
    ) do
      # (Embed page removed) No project module/menu
    end

    # Cargar hooks - NO usar require_dependency
    config.to_prepare do
      ::OpenProject::Documentos::Hooks
    end

    # Registrar assets
    assets %w(
      documentos/main.css
      documentos/button_ajustes.js
      documentos/flujo-boton-seleccionar-ubicacion.js
      documentos/conocimientoia.js
      documentos/wiki_menu_collapse.js
    )
  end
end
