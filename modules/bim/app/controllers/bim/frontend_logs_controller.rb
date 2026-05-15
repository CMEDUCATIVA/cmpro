# -- copyright
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
# ++

module Bim
  class FrontendLogsController < ApplicationController
    before_action :find_project_by_project_id,
                  :authorize

    def create
      source = params[:source].presence || "unknown"
      event = params[:event].presence || "unknown"
      data = params[:data].to_s

      Rails.logger.info("[BIM::IFC][FRONTEND_LOG] project=#{@project.identifier} source=#{source} event=#{event} data=#{data}")
      log_selection_diagnostics(event, data) if source == "bim_ifc_selection"
      log_section_diagnostics(event, data) if source == "bim_ifc_section"

      render json: { ok: true }
    end

    private

    def log_selection_diagnostics(event, data)
      payload = extract_embedded_json(data)
      return unless payload.is_a?(Hash)

      case event
      when "shown_models"
        Rails.cache.write(selection_debug_cache_key, payload, expires_in: 10.minutes)
      when "metadata_aggregate"
        total_sets = payload["totalPropertySets"].to_i
        return unless total_sets.zero?

        selected_ids = Array(payload["perSelectedObject"]).filter_map { |entry| entry.is_a?(Hash) ? entry["id"] : nil }
        return if selected_ids.empty?

        shown_state = Rails.cache.read(selection_debug_cache_key) || {}
        hits = selected_ids.to_h { |id| [id, find_models_containing_object(id)] }

        Rails.logger.warn(
          "[BIM::IFC][SEL_DEBUG] project=#{@project.identifier} event=metadata_aggregate_zero " \
          "selected_ids=#{selected_ids.inspect} shown_state=#{shown_state.inspect} hits=#{hits.inspect}"
        )
      end
    rescue StandardError => e
      Rails.logger.warn("[BIM::IFC][SEL_DEBUG] diagnostics_failed error=#{e.class}: #{e.message}")
    end

    def extract_embedded_json(data)
      idx = data.index("{")
      return nil unless idx

      JSON.parse(data[idx..])
    rescue JSON::ParserError
      nil
    end

    def selection_debug_cache_key
      "bim:ifc:sel_debug:#{@project.id}:#{User.current.id}"
    end

    def log_section_diagnostics(event, data)
      payload = extract_embedded_json(data)
      return unless payload.is_a?(Hash)

      case event
      when "initialized_from_scene", "viewpoint_applied", "controls_delta"
        Rails.cache.write(section_debug_cache_key, payload, expires_in: 10.minutes)
      when "enable_failed", "viewpoint_apply_failed", "viewpoint_clear_failed"
        last_state = Rails.cache.read(section_debug_cache_key) || {}
        Rails.logger.warn(
          "[BIM::IFC][SECTION_DEBUG] project=#{@project.identifier} event=#{event} " \
          "payload=#{payload.inspect} last_state=#{last_state.inspect}"
        )
      end
    rescue StandardError => e
      Rails.logger.warn("[BIM::IFC][SECTION_DEBUG] diagnostics_failed error=#{e.class}: #{e.message}")
    end

    def section_debug_cache_key
      "bim:ifc:section_debug:#{@project.id}:#{User.current.id}"
    end

    def find_models_containing_object(object_id)
      @project.ifc_models.includes(:attachments).filter_map do |model|
        metadata = load_metadata_for(model)
        next if metadata.blank?

        property_hit = Array(metadata["propertySets"]).any? { |ps| ps.is_a?(Hash) && ps["metaObjectId"] == object_id }
        meta_object_hit = Array(metadata["metaObjects"]).any? { |mo| mo.is_a?(Hash) && mo["id"] == object_id }
        next unless property_hit || meta_object_hit

        {
          model_id: model.id,
          default: model.is_default,
          property_hit: property_hit,
          meta_object_hit: meta_object_hit
        }
      end
    end

    def load_metadata_for(model)
      path = model.metadata_attachment&.diskfile&.path
      return nil if path.blank? || !File.file?(path)

      JSON.parse(File.read(path))
    rescue StandardError
      nil
    end
  end
end
