require 'csv'

module Documentos
  class NomenclaturasController < ActionController::API
    def index
      wp_id = params[:work_package_id].presence
      scope = ::Documentos::Nomenclatura.all
      scope = scope.where(work_package_id: wp_id) if wp_id
      render json: scope.order(created_at: :desc).limit(50).as_json(except: [:created_at, :updated_at])
    end

    def create
      record = ::Documentos::Nomenclatura.create!(nomenclatura_params)
      render json: record.as_json(except: [:created_at, :updated_at]), status: :created
    rescue StandardError => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def destroy
      record = ::Documentos::Nomenclatura.find(params[:id])
      record.destroy!
      render json: { status: 'ok' }
    rescue ActiveRecord::RecordNotFound
      render json: { error: 'Nomenclatura no encontrada' }, status: :not_found
    rescue StandardError => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def export
      wp_id = params[:work_package_id].presence
      scope = ::Documentos::Nomenclatura.all
      scope = scope.where(work_package_id: wp_id) if wp_id
      csv = CSV.generate(force_quotes: true) do |rows|
        rows << [
          'Proyecto / Código de Inversión',
          'Creador / Autor',
          'Volumen/Sistema',
          'Nivel o Localización',
          'Tipo / Tipo de documento',
          'Disciplina',
          'Número',
          'Descripción',
          'Estado / Código de estado',
          'Revisión'
        ]
        scope.order(:id).find_each do |record|
          rows << [
            record.proyecto,
            record.creador,
            record.volumen_sistema,
            record.nivel_localizacion,
            record.tipo,
            record.disciplina,
            record.numero,
            record.descripcion,
            record.estado,
            record.revision
          ]
        end
      end

      send_data csv, filename: 'nomenclaturas.csv', type: 'text/csv'
    end

    private

    def nomenclatura_params
      params.permit(
        :work_package_id,
        :proyecto,
        :proyecto_desc,
        :creador,
        :creador_desc,
        :volumen_sistema,
        :volumen_sistema_desc,
        :nivel_localizacion,
        :nivel_localizacion_desc,
        :tipo,
        :tipo_desc,
        :disciplina,
        :disciplina_desc,
        :numero,
        :numero_desc,
        :descripcion,
        :descripcion_desc,
        :estado,
        :estado_desc,
        :revision,
        :revision_desc
      )
    end
  end
end
