# Prevent load-order problems in case openproject-plugins is listed after a plugin in the core
require "open_project/plugins"

module OpenProject::IaColaborativa
  class Engine < ::Rails::Engine
    engine_name :ia_colaborativa

    include OpenProject::Plugins::ActsAsOpEngine

    register "openproject-ia_colaborativa",
             author_url: "https://cmeducativa.es",
             bundled: false,
             requires_openproject: ">= 13.0.0",
             name: "IA Colaborativa",
             description: "Plugin para chat de IA" do
      project_module :ia_colaborativa_menu do
        permission :view_ia_colaborativa_menu,
                   { "ia_colaborativa_menu/ia_colaborativa_menu" => [:index] },
                   permissible_on: [:project]
      end

      menu :project_menu,
           :ia_colaborativa_menu,
           { controller: "/ia_colaborativa_menu/ia_colaborativa_menu", action: "index" },
           after: :overview,
           param: :project_id,
           caption: "IA colaborativa",
           icon: "comment-discussion"
    end

    # ============================================================================
    # CONFIGURACIÓN DE VARIABLES DE ENTORNO
    # ============================================================================
    # Estas variables se cargan antes de que el plugin inicie
    # ||= significa "asignar solo si no existe", permite sobrescribir externamente
    
    config.before_configuration do
      # LightRAG - Base de conocimiento semántica
      ENV['LIGHTRAG_URL'] ||= 'http://192.168.1.45:8092'
      ENV['LIGHTRAG_API_KEY'] ||= 'Vinfrancis230189@1'
      
      # MCP Server - Datos en tiempo real de OpenProject
      ENV['MCP_SERVER_URL'] ||= 'http://192.168.1.55:8000'
      
      # Gemini/OpenRouter - IA para procesar respuestas
      ENV['OPENAI_API_BASE'] ||= 'https://openrouter.ai/api/v1'
      ENV['OPENAI_API_KEY'] ||= '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'
      ENV['OPENAI_MODEL'] ||= 'google/gemini-2.5-flash-lite'
    end

    # Aquí registramos el hook
    config.to_prepare do
      require_dependency 'open_project/ia_colaborativa/hooks'
    end

    # Registrar assets
    assets %w(
      ia_colaborativa/chat.js
      ia_colaborativa/chat.css
      ia_colaborativa/drag_drop_automation.js
      ia_colaborativa/automation.js
      ia_colaborativa/ckeditor/debug_button.js
      ia_colaborativa/ckeditor/ai_button.js
      ia_colaborativa/ckeditor/ai_magic_commands.js
      ia_colaborativa/ckeditor/magic_button.js
      ia_colaborativa/ckeditor/ai_button.css
      ia_colaborativa/boton_auto_chat.js
    )

    # Asegurar que los servicios se carguen
    config.autoload_paths += %W(
      #{root}/app/models
      #{root}/app/services
    )
  end
end
