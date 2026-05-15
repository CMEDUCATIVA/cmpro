$:.push File.expand_path("../lib", __FILE__)
$:.push File.expand_path("../../lib", __dir__)

require "open_project/ifc_properties/version"

# Describe your gem and declare its dependencies:
Gem::Specification.new do |s|
  s.name        = "openproject-ifc_properties"
  s.version     = OpenProject::IfcProperties::VERSION

  s.authors     = "Vin Francis"
  s.email       = "contacto@cmeducativa.es"
  s.homepage    = "https://cmeducativa.es"  # TODO check this URL
  s.summary     = "Plugin IFC Properties para CMPROYECTOS"
  s.description = "Plugin para visualización de propiedades y cuantificaciones IFC en OpenProject BIM"
  s.license     = "MIT" # e.g. "MIT" or "GPLv3"

  s.files = Dir["{app,config,db,lib}/**/*"] + %w(CHANGELOG.md README.md)
  s.add_dependency 'dry-monads', '~> 1.6'
end
