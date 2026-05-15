#-- copyright
# OpenProject is an open source project management software.
# Copyright (C) the OpenProject GmbH
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2013 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See COPYRIGHT and LICENSE files for more details.
#++
require "json"

module Bim
  module IfcModels
    class IfcModelsController < BaseController
      before_action :find_project_by_project_id,
                    only: %i[index new create show defaults edit update destroy direct_upload_finished progress]
      before_action :find_ifc_model_object, only: %i[edit update destroy]
      before_action :find_all_ifc_models, only: %i[show defaults index]

      # Callback done by AWS so can't be authenticated. Don't have to be either, though.
      # It only actually does anything if there is a pending upload with the key passed by AWS.
      before_action :authorize, except: %i[direct_upload_finished set_direct_upload_file_name]
      before_action :require_login, only: [:set_direct_upload_file_name]
      skip_before_action :verify_authenticity_token, only: [:set_direct_upload_file_name] # AJAX request in page, so skip authenticity token
      no_authorization_required! :set_direct_upload_file_name,
                                 :direct_upload_finished

      menu_item :ifc_models

      def index
        enqueue_metadata_backfill_for_missing_models(@ifc_models)

        @ifc_models = @ifc_models
                          .includes(:project, :uploader)
      end

      def show
        frontend_redirect params[:id].to_i
      end

      def new
        @ifc_model = @project.ifc_models.build
        prepare_form(@ifc_model)
      end

      def edit
        prepare_form(@ifc_model)
      end

      def defaults
        frontend_redirect @ifc_models.defaults.pluck(:id).uniq
      end

      def set_direct_upload_file_name
        if params[:filesize].to_i > Setting.attachment_max_size.to_i.kilobytes
          render json: { error: I18n.t("activerecord.errors.messages.file_too_large",
                                       count: Setting.attachment_max_size.to_i.kilobytes) },
                 status: :unprocessable_entity
          return
        end

        session[:pending_ifc_model_title] = params[:title]
        session[:pending_ifc_model_is_default] = params[:isDefault]
      end

      def direct_upload_finished
        id = request.params[:key].scan(/\/file\/(\d+)\//).flatten.first
        attachment = Attachment.pending_direct_upload.where(id:).first
        if attachment.nil? # this should not happen
          flash[:error] = "Direct upload failed."
          redirect_to action: :new
          return
        end

        params = {
          title: session[:pending_ifc_model_title],
          project: @project,
          ifc_attachment: attachment,
          is_default: session[:pending_ifc_model_is_default]
        }

        new_model = true
        if session[:pending_ifc_model_ifc_model_id]
          ifc_model = Bim::IfcModels::IfcModel.find_by id: session[:pending_ifc_model_ifc_model_id]
          new_model = false

          service_result = ::Bim::IfcModels::UpdateService
                               .new(user: current_user, model: ifc_model)
                               .call(params.with_indifferent_access)
        else
          service_result = ::Bim::IfcModels::CreateService
                               .new(user: current_user)
                               .call(params.with_indifferent_access)

        end
        @ifc_model = service_result.result

        session.delete :pending_ifc_model_title
        session.delete :pending_ifc_model_is_default
        session.delete :pending_ifc_model_ifc_model_id

        if service_result.success?
          ::Attachments::FinishDirectUploadJob.perform_later attachment.id,
                                                             allowlist: false

          flash[:notice] = if new_model
                             t("ifc_models.flash_messages.upload_successful")
                           else
                             t(:notice_successful_update)
                           end

          redirect_to action: :index
        else
          attachment.destroy

          flash[:error] = service_result.errors.full_messages.join(" ")

          redirect_to action: :new
        end
      end

      def create
        combined_params = permitted_model_params
                              .to_h
                              .reverse_merge(project: @project)

        service_result = ::Bim::IfcModels::CreateService
                             .new(user: current_user)
                             .call(combined_params)

        @ifc_model = service_result.result

        if service_result.success?
          flash[:notice] = t("ifc_models.flash_messages.upload_successful")
          redirect_to action: :index
        else
          render action: :new, status: :unprocessable_entity
        end
      end

      def update
        combined_params = permitted_model_params
                              .to_h
                              .reverse_merge(project: @project)

        service_result = ::Bim::IfcModels::UpdateService
                             .new(user: current_user, model: @ifc_model)
                             .call(combined_params)

        @ifc_model = service_result.result

        if service_result.success?
          flash[:notice] = t(:notice_successful_update)
          redirect_to action: :index
        else
          render action: :edit, status: :unprocessable_entity
        end
      end

      def destroy
        @ifc_model.destroy
        redirect_to action: :index
      end

      def progress
        ids = params[:ids].to_s.split(",").filter_map { |id| Integer(id, exception: false) }.uniq
        scope = @project.ifc_models
        scope = scope.where(id: ids) if ids.present?
        enqueue_metadata_backfill_for_missing_models(scope)

        payload = scope.select(:id, :conversion_status, :conversion_progress, :conversion_step, :conversion_error_message)
                       .map do |record|
          status = record.conversion_status
          if status.blank?
            status = ::Bim::IfcModels::IfcModel.conversion_statuses.key(record[:conversion_status]) || "pending"
          end
          {
            id: record.id,
            status:,
            progress: record.conversion_progress.to_i.clamp(0, 100),
            step: record.conversion_step.presence || default_step_for_status(status),
            error_message: record.conversion_error_message
          }
        end

        Rails.logger.info("[BIM::IFC][PROGRESS] project=#{@project.identifier} ids=#{ids.inspect} count=#{payload.length} statuses=#{payload.map { |m| "#{m[:id]}:#{m[:status]}:#{m[:progress]}" }.join(',')}")

        render json: { models: payload }
      end

      private

      def prepare_form(ifc_model)
        return unless OpenProject::Configuration.direct_uploads?

        call = ::Attachments::PrepareUploadService
                 .bypass_allowlist(user: current_user)
                 .call(filename: "model.ifc", filesize: 0)

        call.on_failure { flash[:error] = call.message }

        @pending_upload = call.result
        @form = DirectFogUploader.direct_fog_hash(
          attachment: @pending_upload,
          success_action_redirect: direct_upload_finished_bcf_project_ifc_models_url
        )
        session[:pending_ifc_model_ifc_model_id] = ifc_model.id unless ifc_model.new_record?
      end

      def frontend_redirect(model_ids)
        props = Bim::Menus::DefaultQueryGeneratorService.new.call
        redirect_to bcf_project_frontend_path(models: JSON.dump(Array(model_ids)),
                                              query_props: props[:query_props],
                                              name: props[:name])
      end

      def find_all_ifc_models
        @ifc_models = @project
                          .ifc_models
                          .includes(:attachments)
                          .order("#{IfcModels::IfcModel.table_name}.created_at ASC")
      end

      def permitted_model_params
        params
            .require(:bim_ifc_models_ifc_model)
            .permit("title", "ifc_attachment", "is_default")
      end

      def find_ifc_model_object
        @ifc_model = Bim::IfcModels::IfcModel.find_by(id: params[:id])
      end

      def default_step_for_status(status)
        case status
        when "processing" then "Preparacion"
        when "completed" then "Completado"
        when "error" then "Error"
        else "Pendiente"
        end
      end

      def enqueue_metadata_backfill_for_missing_models(scope)
        models = scope.includes(:attachments).select do |model|
          model.xkt_attachment.present? &&
            model.ifc_attachment.present? &&
            metadata_needs_backfill?(model) &&
            (model.completed? || model.error?)
        end

        return if models.empty?

        models.each do |model|
          model.update_columns(
            conversion_status: ::Bim::IfcModels::IfcModel.conversion_statuses[:pending],
            conversion_progress: 0,
            conversion_step: "Preparacion",
            conversion_error_message: nil,
            updated_at: Time.current
          )

          ::Bim::IfcModels::IfcConversionJob.perform_later(model)
        end

        Rails.logger.warn(
          "[BIM::IFC] metadata_backfill_enqueued project=#{@project.identifier} model_ids=#{models.map(&:id).inspect}"
        )
      end

      def metadata_needs_backfill?(model)
        return true if model.metadata_attachment.blank?

        !metadata_attachment_usable?(model)
      end

      def metadata_attachment_usable?(model)
        path = model.metadata_attachment&.diskfile&.path
        return false if path.blank? || !File.file?(path)

        parsed = JSON.parse(File.read(path))
        extractor = parsed["extractor"].to_s
        property_sets = parsed["propertySets"]

        extractor == "ifcopenshell" && property_sets.is_a?(Array)
      rescue StandardError => e
        Rails.logger.warn(
          "[BIM::IFC] metadata_attachment_invalid ifc_model_id=#{model.id} error=#{e.class}: #{e.message}"
        )
        false
      end
    end
  end
end
