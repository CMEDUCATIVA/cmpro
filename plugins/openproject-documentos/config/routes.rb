Rails.application.routes.draw do
  scope '', as: 'documentos_plugin' do
    post 'documentos/upload_lightrag', to: 'documentos/uploads#create'
    get  'documentos/config', to: 'documentos/uploads#show_config'
    post 'documentos/config', to: 'documentos/uploads#update_config'
    post 'documentos/log', to: 'documentos/uploads#log'
    post 'documentos/direct_upload_proxy', to: 'documentos/uploads#direct_upload_proxy'
    get  'documentos/lightrag_documents', to: 'documentos/lightrag_documents#index'
    post 'documentos/lightrag_documents', to: 'documentos/lightrag_documents#create'
    delete 'documentos/lightrag_documents/:id', to: 'documentos/lightrag_documents#destroy'
    get  'documentos/lightrag_track_status/:track_id', to: 'documentos/lightrag_documents#track_status'
    get  'documentos/nomenclaturas', to: 'documentos/nomenclaturas#index'
    get  'documentos/nomenclaturas/export', to: 'documentos/nomenclaturas#export'
    post 'documentos/nomenclaturas', to: 'documentos/nomenclaturas#create'
    delete 'documentos/nomenclaturas/:id', to: 'documentos/nomenclaturas#destroy'
    get  'documentos/nomenclatura_items', to: 'documentos/nomenclatura_items#index'
    post 'documentos/nomenclatura_items', to: 'documentos/nomenclatura_items#create'
    delete 'documentos/nomenclatura_items/:id', to: 'documentos/nomenclatura_items#destroy'
    patch 'documentos/nomenclatura_items/:id', to: 'documentos/nomenclatura_items#update'
    get  'documentos/nomenclatura_fields/:key', to: 'documentos/nomenclatura_fields#show'
    patch 'documentos/nomenclatura_fields/:key', to: 'documentos/nomenclatura_fields#update'
    post 'documentos/file_links/:id/rename', to: 'documentos/file_links#rename'
  end
end
