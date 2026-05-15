$:.push File.expand_path("../lib", __FILE__)
$:.push File.expand_path("../../lib", __dir__)

require "open_project/whatsapp/version"

# Describe your gem and declare its dependencies:
Gem::Specification.new do |s|
  s.name        = "openproject-whatsapp"
  s.version     = OpenProject::Whatsapp::VERSION

  s.authors     = "Vin Francis"
  s.email       = "contacto@cmeducativa.es"
  s.homepage    = "https://cmeducativa.es"
  s.summary     = "Plugin WhatsApp para CMPROYECTOS"
  s.description = "Plugin para integrar WhatsApp dentro del entorno colaborativo de OpenProject BIM"
  s.license     = "MIT" # e.g. "MIT" or "GPLv3"

  s.files = Dir["{app,config,lib}/**/*"] + %w(CHANGELOG.md README.md)
  s.metadata = {
    "plugin_type" => "OpenProject"
  }
end
