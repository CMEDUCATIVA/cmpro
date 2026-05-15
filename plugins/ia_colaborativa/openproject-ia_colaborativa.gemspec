$:.push File.expand_path("../lib", __FILE__)
$:.push File.expand_path("../../lib", __dir__)

require "open_project/ia_colaborativa/version"

# Describe your gem and declare its dependencies:
Gem::Specification.new do |s|
  s.name        = "openproject-ia_colaborativa"
  s.version     = OpenProject::IaColaborativa::VERSION

  s.authors     = "Vin Francis"
  s.email       = "contacto@cmeducativa.es"
  s.homepage    = "https://cmeducativa.es"
  s.summary     = "Plugin IA Colaborativa para CMPROYECTOS"
  s.description = "Plugin para integrar un sistema de chat IA dentro del entorno colaborativo de OpenProject BIM"
  s.license     = "MIT" # e.g. "MIT" or "GPLv3"

  s.files = Dir["{app,config,db,lib}/**/*"] + %w(CHANGELOG.md README.md)
  s.add_dependency 'dry-monads', '~> 1.6'
  # ruby-openai NO requerido - usamos Net::HTTP directamente
end
