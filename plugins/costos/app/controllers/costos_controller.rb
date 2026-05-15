class CostosController < ApplicationController
  before_action :find_project_by_project_id
  before_action :authorize

  def index
    # Acción principal que muestra el mensaje de bienvenida
    render layout: true

    # Remove CSP header after rendering to allow Costos iframes
    response.headers.delete('Content-Security-Policy')
    response.headers.delete('Content-Security-Policy-Report-Only')
  end

  private

  def default_breadcrumb
    t(:label_costos)
  end

  def show_local_breadcrumb
    true
  end
end
