module Documentos
  class NomenclaturaItemsController < ActionController::API
    def index
      scope = ::Documentos::NomenclaturaItem.all
      scope = scope.where(key: params[:key]) if params[:key].present?
      render json: scope.order(created_at: :desc).limit(200).as_json(except: %i[created_at updated_at])
    end

    def create
      record = ::Documentos::NomenclaturaItem.create!(nomenclatura_item_params)
      ::OpenProject::Documentos::CustomFieldSync.sync_for_key(record.key)
      render json: record.as_json(except: %i[created_at updated_at]), status: :created
    rescue StandardError => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def destroy
      record = ::Documentos::NomenclaturaItem.find(params[:id])
      key = record.key
      record.destroy!
      ::OpenProject::Documentos::CustomFieldSync.sync_for_key(key)
      render json: { status: 'ok' }
    rescue ActiveRecord::RecordNotFound
      render json: { error: 'Nomenclatura item no encontrado' }, status: :not_found
    rescue StandardError => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def update
      record = ::Documentos::NomenclaturaItem.find(params[:id])
      record.update!(nomenclatura_item_params)
      ::OpenProject::Documentos::CustomFieldSync.sync_for_key(record.key)
      render json: record.as_json(except: %i[created_at updated_at])
    rescue ActiveRecord::RecordNotFound
      render json: { error: 'Nomenclatura item no encontrado' }, status: :not_found
    rescue StandardError => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    private

    def nomenclatura_item_params
      params.permit(
        :key,
        :value,
        :description,
        :is_for_all,
        :is_filter,
        :is_searchable
      )
    end
  end
end
