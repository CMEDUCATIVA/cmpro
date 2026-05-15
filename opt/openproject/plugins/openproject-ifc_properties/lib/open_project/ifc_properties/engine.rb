# Prevent load-order problems in case openproject-plugins is listed after a plugin in the Gemfile
# or not at all
require "open_project/plugins"

module OpenProject::IfcProperties
  class Engine < ::Rails::Engine
    engine_name :openproject_ifc_properties

    include OpenProject::Plugins::ActsAsOpEngine

    register "openproject-ifc_properties",
             author_url: "https://cmeducativa.es",
             bundled: false,
             requires_openproject: ">= 16.0.0",
             name: "OpenProject IFC Properties",
             description: "Plugin para visualización de propiedades IFC en OpenProject BIM"

    assets %w(
      ifc_properties/application.css
      ifc_properties/application.js
    )
  end
end
