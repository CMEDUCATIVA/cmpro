begin
  require 'open_project/storages'
rescue LoadError => e
  Rails.logger.error("[Documentos] No se pudo cargar open_project/storages: #{e.class} #{e.message}")
end

module Documentos
  class FileLinksController < ActionController::API
    Rails.logger.info("[Documentos] FileLinksController loaded from #{__FILE__}")
    before_action :set_debug_headers
    before_action :log_controller_entry
    before_action :find_file_link

    # Renombra un file_link tanto en el storage remoto como en la etiqueta local
    def rename
      Rails.logger.info("[Documentos] rename start id=#{@file_link&.id} project=#{file_link_project_id} user=#{User.current&.id}")
      storage = @file_link.storage

      input_data = Storages::Adapters::Input::RenameFile
        .build(location: @file_link.origin_id, new_name: new_name_param)
        .value_or { |error| return render json: { error: error.to_h }, status: :unprocessable_entity }

      auth_strategy = Storages::Adapters::Registry.resolve("#{storage}.authentication.user_bound").call(User.current, storage)
      result = Storages::Adapters::Registry.resolve("#{storage.short_provider_type}.commands.rename_file")
        .call(storage:, auth_strategy:, input_data:)

      result.value_or do |error|
        return render json: { error: error.to_h }, status: :bad_gateway
      end

      @file_link.update!(origin_name: new_name_param)
      render json: { id: @file_link.id, name: @file_link.origin_name }
    rescue StandardError => e
      Rails.logger.error("[Documentos] Rename fallo: #{e.class} #{e.message}")
      render json: { error: 'No se pudo renombrar el archivo', detail: e.message }, status: :internal_server_error
    end

    private

    def set_debug_headers
      response.set_header('X-Documentos-FileLinks', __FILE__)
      response.set_header('X-Documentos-FileLinks-Loaded', '1')
    end

    def log_controller_entry
      Rails.logger.info("[Documentos] controller entry action=#{action_name} id=#{params[:id]} user=#{User.current&.id}")
    end

    def find_file_link
      Rails.logger.info("[Documentos] find_file_link id=#{params[:id]}")
      @file_link = ::Storages::FileLink.find(params[:id])
    rescue ActiveRecord::RecordNotFound
      no_authorization_required!
      render json: { error: 'FileLink no encontrado' }, status: :not_found
    end

    def new_name_param
      params.require(:new_name).to_s.strip
    end

    def file_link_project_id
      return @file_link.project_id if @file_link.respond_to?(:project_id)
      return @file_link.project&.id if @file_link.respond_to?(:project)
      nil
    end
  end
end
