$:.push File.expand_path("../lib", __FILE__)
$:.push File.expand_path("../../lib", __dir__)

require "open_project/documentos/version"

# Describe your gem and declare its dependencies:
Gem::Specification.new do |s|
  s.name        = "openproject-documentos"
  s.version     = OpenProject::Documentos::VERSION

  s.authors     = "Vin Francis"
  s.email       = "contacto@cmeducativa.es"
  s.homepage    = "https://cmeducativa.es"
  s.summary     = "Plugin Documentos para CMPROYECTOS"
  s.description = "Plugin para visualizar documentos embebidos dentro del entorno colaborativo de OpenProject BIM"
  s.license     = "MIT" # e.g. "MIT" or "GPLv3"

  s.files = Dir["{app,config,lib}/**/*"] + %w(CHANGELOG.md README.md)
  s.metadata = {
    "plugin_type" => "OpenProject"
  }
end
