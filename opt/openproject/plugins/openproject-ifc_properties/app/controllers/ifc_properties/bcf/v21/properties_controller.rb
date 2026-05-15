class IfcProperties::Bcf::V21::PropertiesController < ActionController::API
  
  # GET /api/bcf/2.1/projects/:project_id/ifc_models/:ifc_model_id/ifc-properties/ping
  def ping
    render json: { 
      ok: true, 
      message: "IFC Properties BCF endpoint vivo",
      project_id: params[:project_id], 
      ifc_model_id: params[:ifc_model_id],
      timestamp: Time.current.iso8601
    }
  end

  # GET /api/bcf/2.1/projects/:project_id/ifc_models/:ifc_model_id/ifc-properties
  def index
    elements = IfcProperties::ElementProperty
                 .where(ifc_model_id: params[:ifc_model_id])
                 .order(:element_type, :element_name)
    
    render json: {
      total: elements.count,
      project_id: params[:project_id],
      ifc_model_id: params[:ifc_model_id],
      elements: elements.as_json(only: %i[element_guid element_type element_name properties quantities])
    }
  end
end
