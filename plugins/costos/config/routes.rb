Rails.application.routes.draw do
  scope '', as: 'costos_plugin' do
    post 'costos/ifc_log', to: 'costos/ifc_logs#create', as: 'costos_ifc_log'
    get 'costos/ifc_progress', to: 'costos/ifc_progress#index', as: 'costos_ifc_progress'
    get 'costos/ifc_meta', to: 'costos/ifc_meta#show', as: 'costos_ifc_meta'
    get 'costos/ifc_public/:token', to: 'costos/ifc_public#show', as: 'costos_ifc_public'
    post 'costos/ifc_public_link', to: 'costos/ifc_public#create_link', as: 'costos_ifc_public_link'
    scope 'projects/:project_id', as: 'project' do
      get 'costos', to: 'costos#index', as: 'costos'
    end
  end
end
