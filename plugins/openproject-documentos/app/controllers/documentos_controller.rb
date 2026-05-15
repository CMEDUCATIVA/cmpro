class DocumentosController < ApplicationController
  before_action :find_project_by_project_id
  before_action :authorize

  def index
    # Accion principal que muestra el documento embebido
    render layout: true

    # Remove CSP header after rendering to allow embedded iframes
    response.headers.delete('Content-Security-Policy')
    response.headers.delete('Content-Security-Policy-Report-Only')
  end

  private

  def default_breadcrumb
    t(:label_documentos)
  end

  def show_local_breadcrumb
    true
  end
end
