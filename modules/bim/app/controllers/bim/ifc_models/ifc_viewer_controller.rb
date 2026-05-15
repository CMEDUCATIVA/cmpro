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
    class IfcViewerController < BaseController
      before_action :find_project_by_project_id
      before_action :authorize
      before_action :find_all_ifc_models
      before_action :enqueue_metadata_backfill_for_missing_models
      before_action :set_default_models
      before_action :parse_showing_models

      menu_item :ifc_models

      def show; end

      private

      def parse_showing_models
        @shown_model_ids =
          if params[:models]
            Array(JSON.parse(params[:models])).filter_map do |id|
              value = id.to_i
              value if value.positive?
            end
          else
            []
          end

        @shown_ifc_models = @ifc_models.select { |model| @shown_model_ids.include?(model.id) }
      end

      def find_all_ifc_models
        @ifc_models = @project
          .ifc_models
          .includes(:attachments)
          .order("created_at ASC")
      end

      def enqueue_metadata_backfill_for_missing_models
        models = @ifc_models.select do |model|
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
            conversion_step: ::Bim::IfcModels::ViewConverterService::PROCESSING_STEPS[:preparation],
            conversion_error_message: nil,
            updated_at: Time.current
          )

          ::Bim::IfcModels::IfcConversionJob.perform_later(model)
        end

        Rails.logger.warn(
          "[BIM::IFC] metadata_backfill_enqueued project=#{@project.identifier} " \
          "model_ids=#{models.map(&:id).inspect}"
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

      def set_default_models
        @default_ifc_models = @ifc_models.where(is_default: true)
      end
    end
  end
end
