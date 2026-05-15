# frozen_string_literal: true

module Costos
  class IfcProgressController < ApplicationController
    no_authorization_required! :index

    def index
      if !User.current.logged?
        return render json: { models: {} }
      end

      ids = parse_ids(params[:ids])
      return render json: { models: {} } if ids.empty?

      models = ifc_model_scope.where(id: ids).index_by(&:id)

      payload = ids.each_with_object({}) do |id, acc|
        model = models[id]
        persisted = Costos::Ifc::ProgressStore.read(id) || {}

        status = normalize_status(model&.conversion_status) || normalize_status(persisted[:status]) || "pending"
        progress = Integer(persisted[:progress] || 0) rescue 0
        progress = 100 if %w[completed error].include?(status)
        progress = [[progress, 0].max, 100].min

        acc[id.to_s] = {
          status: status,
          progress: progress,
          stage: persisted[:stage],
          step: persisted[:step],
          updated_at: persisted[:updated_at]
        }
      end

      render json: { models: payload }
    end

    private

    def parse_ids(raw)
      String(raw).split(",").map { |v| Integer(v) rescue nil }.compact.uniq.first(200)
    end

    def ifc_model_scope
      if defined?(::Bim::IfcModels::IfcModel)
        ::Bim::IfcModels::IfcModel
      else
        raise ActiveRecord::RecordNotFound
      end
    rescue NameError
      raise ActiveRecord::RecordNotFound
    end

    def normalize_status(raw)
      value = raw.to_s.strip.downcase
      return nil if value.empty?
      return "completed" if value.include?("completed") || value.include?("complete") || value.include?("completado")
      return "processing" if value.include?("processing") || value.include?("procesando")
      return "pending" if value.include?("pending") || value.include?("pendiente")
      return "error" if value.include?("error") || value.include?("failed") || value.include?("fallido")
      nil
    end
  end
end
