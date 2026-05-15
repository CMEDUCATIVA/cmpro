Rails.application.routes.draw do
  namespace :ia_colaborativa do
    post 'chat', to: 'chat#create'
    get 'chat_turns/:turn_id/events', to: 'chat#turn_events'
    get 'agent_turns', to: 'chat#agent_turns'
    get 'agent_turns/:turn_id', to: 'chat#agent_turn'
    post 'lightrag', to: 'chat#lightrag'
    resource :peb_auto, only: [:show, :create], controller: 'peb_auto'

    post 'kpi_report', to: 'chat#kpi_report'
    post 'mindmap_report', to: 'chat#mindmap_report'
    # Search projects endpoint
    get 'search_projects', to: 'chat#search_projects'
    post 'automation_flow', to: 'chat#automation_flow'

    # Debug endpoints
    get 'debug', to: 'chat#debug'
    get 'debug/logs', to: 'chat#debug_logs'
    get 'debug/conversations', to: 'chat#debug_conversations'
    post 'debug/clear', to: 'chat#clear_debug'

    resource :provider_settings, only: [:show, :create, :update], controller: 'settings'
    resource :mcp_settings, only: [:show, :create, :update], controller: 'mcp_settings'
  end

  scope "projects/:project_id", as: "project" do
    get "ia_colaborativa_menu",
        to: "ia_colaborativa_menu/ia_colaborativa_menu#index",
        as: "ia_colaborativa_menu"
  end
end
