# Prevent load-order problems in case openproject-plugins is listed after a plugin in the core
require 'active_support/dependencies'
require 'open_project/plugins'

module OpenProject::Costos
  class Engine < ::Rails::Engine
    engine_name :openproject_costos

    include OpenProject::Plugins::ActsAsOpEngine

    register(
      'openproject-costos',
      author_url: 'https://cmeducativa.es',
      author: 'Vin Francis',
      bundled: false,
      requires_openproject: '>= 13.0.0'
    ) do
      # Definir módulo del proyecto y permisos
      project_module :costos do
        permission :view_costos,
                   {
                     costos: [:index]
                   },
                   permissible_on: [:project]
      end
     
      # Agregar menú de proyecto
      menu :project_menu,
           :costos,
           { controller: '/costos', action: 'index' },
           after: :overview,
           param: :project_id,
           caption: :label_costos,
           html: { id: "costos-menu-item" },
           if: ->(project) { true }
    end

    # Cargar parches - NO usar require_dependency
    config.to_prepare do
      require_dependency 'admin/cost_types_controller'
      require_dependency 'cost_type'
      require_dependency 'cost_rate'
      require_dependency 'permitted_params'
      require_dependency 'attachment'
      begin
        require_dependency 'bim/ifc_models/view_converter_service'
      rescue LoadError
        # BIM module not available; IFC conversion logging will be skipped.
      end
      begin
        require_dependency 'bim/ifc_models/ifc_model'
      rescue LoadError
        # BIM module not available; IFC model sharing will be skipped.
      end

      require 'costos/patches/cost_types_controller_patch'
      require 'costos/patches/cost_type_patch'
      require 'costos/patches/cost_rate_patch'
      require 'costos/patches/permitted_params_patch'
      require 'costos/ifc/logger'
      require 'costos/ifc/progress_store'
      require 'costos/ifc/attachment_patch'
      require 'costos/ifc/view_converter_service_patch'
      require 'costos/ifc/ifc_model_patch'

      Admin::CostTypesController.prepend_view_path OpenProject::Costos::Engine.root.join('app', 'views')
      Admin::CostTypesController.prepend ::Costos::Patches::CostTypesControllerPatch
      CostType.include ::Costos::Patches::CostTypePatch unless CostType < ::Costos::Patches::CostTypePatch
      CostRate.include ::Costos::Patches::CostRatePatch unless CostRate < ::Costos::Patches::CostRatePatch
      Costs::Patches::PermittedParamsPatch::InstanceMethods.prepend ::Costos::Patches::PermittedParamsPatch

      Attachment.include ::Costos::Ifc::AttachmentPatch unless Attachment < ::Costos::Ifc::AttachmentPatch
      if defined?(::Bim::IfcModels::ViewConverterService) &&
         !::Bim::IfcModels::ViewConverterService.ancestors.include?(::Costos::Ifc::ViewConverterServicePatch)
        ::Bim::IfcModels::ViewConverterService.prepend ::Costos::Ifc::ViewConverterServicePatch
      end
      if defined?(::Bim::IfcModels::IfcModel) &&
         !::Bim::IfcModels::IfcModel.ancestors.include?(::Costos::Ifc::IfcModelPatch)
        ::Bim::IfcModels::IfcModel.include ::Costos::Ifc::IfcModelPatch
      end
    end

    # Registrar assets
    assets %w(costos/main.css
              costos/entries.css
              costos/ifc_status_progress.css
              entries.js
              costos/ifc.js
              costos/ifc_status_progress.js
              costos/parche_ifc_viewer.js
              costos/xeokit_config.js
              costos/embed.js
              costos/cost_types.js
              costos/costs_by_type.js)

    config.to_prepare do
      require_dependency 'application_helper'
      require_relative 'hooks'
    end

    rake_tasks do
      Dir[root.join('lib/tasks/**/*.rake')].sort.each do |task_file|
        load task_file
      end
    end
  end
end
