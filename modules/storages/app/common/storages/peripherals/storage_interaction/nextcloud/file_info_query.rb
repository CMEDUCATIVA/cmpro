# frozen_string_literal: true

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

module Storages
  module Peripherals
    module StorageInteraction
      module Nextcloud
        class FileInfoQuery
          using ServiceResultRefinements

          FILE_INFO_PATH = "ocs/v1.php/apps/integration_openproject/fileinfo"
          VERSIONADO_LABELS_PATH = "apps/versionado/api/v1/version-labels"

          def self.call(storage:, auth_strategy:, file_id:)
            new(storage).call(auth_strategy:, file_id:)
          end

          def initialize(storage)
            @storage = storage
          end

          def call(auth_strategy:, file_id:)
            validation = validate_input(file_id)
            return validation if validation.failure?

            http_options = Util.ocs_api_request.deep_merge(Util.accept_json)
            Authentication[auth_strategy].call(storage: @storage, http_options:) do |http|
              versionado_label = versionado_label_for(http, file_id)
              file_info(http, file_id).map(&parse_json) >> handle_failure >> create_storage_file_info(versionado_label)
            end
          end

          private

          def validate_input(file_id)
            if file_id.nil?
              ServiceResult.failure(
                result: :error,
                errors: StorageError.new(code: :error,
                                         data: StorageErrorData.new(source: self.class),
                                         log_message: "File ID can not be nil")
              )
            else
              ServiceResult.success
            end
          end

          def file_info(http, file_id)
            response = http.get(UrlBuilder.url(@storage.uri, FILE_INFO_PATH, file_id))
            error_data = StorageErrorData.new(source: self.class, payload: response)

            case response
            in { status: 200..299 }
              ServiceResult.success(result: response.body)
            in { status: 404 }
              Util.error(:not_found, "Outbound request destination not found!", error_data)
            in { status: 401 }
              Util.error(:unauthorized, "Outbound request not authorized!", error_data)
            else
              Util.error(:error, "Outbound request failed!", error_data)
            end
          end

          def parse_json
            ->(response_body) do
              JSON.parse(response_body, object_class: OpenStruct) # rubocop:disable Style/OpenStructUse
            end
          end

          def handle_failure
            ->(response_object) do
              error_data = StorageErrorData.new(source: self.class, payload: response_object)

              case response_object.ocs.data.statuscode
              when 200..299
                ServiceResult.success(result: response_object)
              when 403
                Util.error(:forbidden, "Access to storage file forbidden!", error_data)
              when 404
                Util.error(:not_found, "Storage file not found!", error_data)
              else
                Util.error(:error, "Outbound request failed!", error_data)
              end
            end
          end

          def versionado_label_for(http, file_id)
            response = http.post(
              UrlBuilder.url(@storage.uri, VERSIONADO_LABELS_PATH),
              json: { fileIds: [file_id.to_i] }
            )

            case response
            in { status: 200..299 }
              payload = response.json.dig("data", file_id.to_s) || response.json.dig(:data, file_id.to_s) || {}
              current = payload&.dig("versions")&.find { |v| v["is_current"] }
              label = current&.dig("version_label") || current&.dig("label") ||
                payload&.dig("versions")&.last&.dig("version_label") ||
                payload&.dig("versions")&.last&.dig("label")

              Rails.logger.info(
                "[storages][nextcloud][file_info_query] versionado label loaded " \
                "file_id=#{file_id} label=#{label.inspect} status=#{response.status}"
              )
              label
            else
              Rails.logger.warn(
                "[storages][nextcloud][file_info_query] versionado label request failed " \
                "file_id=#{file_id} status=#{response.status}"
              )
              nil
            end
          rescue StandardError => e
            Rails.logger.warn(
              "[storages][nextcloud][file_info_query] versionado label exception " \
              "file_id=#{file_id} error=#{e.class}: #{e.message}"
            )
            nil
          end

          def create_storage_file_info(versionado_label) # rubocop:disable Metrics/AbcSize
            ->(response_object) do
              data = response_object.ocs.data
              resolved_version_label = versionado_label || data.version_label || data.label || "V"

              Rails.logger.info(
                "[storages][nextcloud][file_info_query] resolved file version label file_id=#{data.id} " \
                "version_label=#{resolved_version_label.inspect} source_fields=" \
                "{versionado=#{versionado_label.inspect}, version_label=#{data.version_label.inspect}, label=#{data.label.inspect}}"
              )

              ServiceResult.success(
                result: StorageFileInfo.new(
                  status: data.status.downcase,
                  status_code: data.statuscode,
                  id: data.id.to_s,
                  name: data.name,
                  last_modified_at: Time.zone.at(data.mtime),
                  created_at: Time.zone.at(data.ctime),
                  mime_type: data.mimetype,
                  size: data.size,
                  owner_name: data.owner_name,
                  owner_id: data.owner_id,
                  last_modified_by_name: data.modifier_name,
                  last_modified_by_id: data.modifier_id,
                  version_label: resolved_version_label,
                  permissions: data.dav_permissions,
                  location: location(data.path)
                )
              )
            end
          end

          def location(file_path)
            prefix = "files/"
            idx = file_path.index(prefix)
            return "/" if idx == nil

            idx += prefix.length - 1

            UrlBuilder.path(file_path[idx..])
          end
        end
      end
    end
  end
end
