# frozen_string_literal: true

module Costos
  class IfcLogsController < ApplicationController
    skip_forgery_protection only: :create
    no_authorization_required! :create

    def create
      payload = params.permit(:event, :url, :status, :message, :category, :detail, :phase)

      Costos::Ifc::Logger.log("ifc_client_log",
                              {
                                user_id: User.current.logged? ? User.current.id : nil,
                                ip: request.remote_ip
                              }.merge(payload.to_h.symbolize_keys))

      render json: { ok: true }
    end
  end
end
