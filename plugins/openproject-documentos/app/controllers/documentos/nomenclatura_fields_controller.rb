module Documentos
  class NomenclaturaFieldsController < ActionController::API
    def show
      record = ::Documentos::NomenclaturaField.for_key(params[:key])
      render json: record.as_json(except: %i[created_at updated_at])
    end

    def update
      record = ::Documentos::NomenclaturaField.for_key(params[:key])
      record.update!(field_params)
      ::OpenProject::Documentos::CustomFieldSync.sync_for_key(record.key)
      render json: record.as_json(except: %i[created_at updated_at])
    rescue StandardError => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    private

    def field_params
      params.permit(:is_for_all, :is_filter, :is_searchable)
    end
  end
end
