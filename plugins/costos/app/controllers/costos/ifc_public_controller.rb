# frozen_string_literal: true

module Costos
  class IfcPublicController < ApplicationController
    before_action :require_login, only: [:create_link]
    skip_before_action :require_login, only: [:show], raise: false
    skip_before_action :check_if_login_required, only: [:show], raise: false
    no_authorization_required! :show, :create_link

    def show
      Rails.logger.info("[IFC_PUBLIC] show token=#{params[:token].to_s[0, 8]} share_token=#{params[:share_token].to_s[0, 8]} ip=#{request.remote_ip}")
      model = find_public_model
      Rails.logger.info("[IFC_PUBLIC] model_found=#{!!model} project_id=#{model&.project_id} ifc_model_id=#{model&.id}")
      return render status: :not_found, plain: "Not Found" unless model

      cookies[:ifc_share_token] = {
        value: model.public_share_token,
        path: "/",
        same_site: :lax,
        secure: request.ssl?,
        expires: 2.hours.from_now
      }

      opts = {
        models: JSON.dump([model.id]),
        embed: "true",
        share_token: model.public_share_token
      }
      %w[hidecontrols hideselectioninfo noscroll transparent].each do |key|
        value = params[key].to_s
        opts[key.to_sym] = value if value.present?
      end

      base = bcf_project_frontend_path(model.project.identifier)
      query = Rack::Utils.build_query(opts)
      url = "#{base}?#{query}"
      Rails.logger.info("[IFC_PUBLIC] redirect_to=#{url}")
      redirect_to url
    end

    def create_link
      model = Bim::IfcModels::IfcModel.find_by(id: params[:id])
      return render status: :not_found, json: { error: "ifc_model_not_found" } unless model
      return render status: :forbidden, json: { error: "forbidden" } unless can_share?(model)

      model.enable_public_share!

      render json: {
        token: model.public_share_token,
        url: "/costos/ifc_public/#{model.public_share_token}"
      }
    end

    private

    def can_share?(model)
      User.current.allowed_in_project?(:manage_ifc_models, model.project)
    end

    def find_public_model
      token = params[:token].to_s
      return nil if token.empty?

      Bim::IfcModels::IfcModel.find_by(public_share_token: token, public_share_enabled: true)
    end
  end
end
