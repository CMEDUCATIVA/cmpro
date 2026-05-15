# frozen_string_literal: true

module Costos
  class IfcMetaController < ApplicationController
    before_action :require_login, unless: :embed_request?
    no_authorization_required! :show

    def show
      xkt_attachment_id = params[:xkt_attachment_id].to_i
      if xkt_attachment_id <= 0
        return render json: { error: "missing_xkt_attachment_id" }, status: :bad_request
      end

      xkt_attachment = Attachment.find_by(id: xkt_attachment_id)
      unless xkt_attachment&.visible?(User.current)
        return render json: { error: "xkt_attachment_not_visible" }, status: :forbidden
      end

      container = xkt_attachment.container
      unless container && container.respond_to?(:attachments)
        return render json: { error: "no_container" }, status: :not_found
      end

      meta_attachment = find_meta_attachment(container)
      unless meta_attachment&.visible?(User.current)
        return render json: { error: "meta_attachment_not_visible" }, status: :not_found
      end

      render json: {
        meta_attachment_id: meta_attachment.id,
        content_url: "/api/v3/attachments/#{meta_attachment.id}/content"
      }
    end

    private

    def find_meta_attachment(container)
      container.attachments
               .where(description: "ifc_meta_ifcopenshell")
               .order(created_at: :desc)
               .first ||
        container.attachments
                 .where("LOWER(attachments.file) LIKE ?", "%model_ifcopenshell.json")
                 .order(created_at: :desc)
                 .first
    end

    def embed_request?
      value = params[:embed].to_s
      value == "true" || value == "1"
    end
  end
end
