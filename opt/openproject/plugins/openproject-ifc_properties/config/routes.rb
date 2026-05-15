Rails.application.routes.draw do
  scope "/api/bcf/2.1" do
    scope "/projects/:project_id/ifc_models/:ifc_model_id" do
      get "ifc-properties/ping", to: "ifc_properties/bcf/v21/properties#ping"
      get "ifc-properties",      to: "ifc_properties/bcf/v21/properties#index"
    end
  end
end
