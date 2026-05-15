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
    module ConnectionValidators
      module OneDrive
        class StorageConfigurationValidator < BaseValidatorGroup
          using ServiceResultRefinements

          def self.key = :base_configuration

          private

          def validate
            register_checks :storage_configured,
                            :diagnostic_request,
                            :tenant_id,
                            :client_secret,
                            :client_id,
                            :drive_id_format,
                            :drive_id_exists

            storage_configuration_status
            diagnostic_request
            check_tenant_id
            check_client_secret
            check_client_id
            malformed_drive_id
            drive_not_found
          end

          def malformed_drive_id
            return pass_check(:drive_id_format) if query_result.success?

            if error_payload.dig(:error, :code) == "invalidRequest"
              fail_check(:drive_id_format, :od_drive_id_invalid)
            else
              pass_check(:drive_id_format)
            end
          end

          def drive_not_found
            if query_result.result == :not_found
              fail_check(:drive_id_exists, :od_drive_id_not_found)
            else
              pass_check(:drive_id_exists)
            end
          end

          def check_tenant_id
            return pass_check(:tenant_id) if query_result.success?

            tenant_id_regex = /tenant (?:identifier )?'#{@storage.tenant_id}' (?:not found|is neither)/i

            if error_payload[:error] == "invalid_request" && error_payload[:error_description].match?(tenant_id_regex)
              fail_check(:tenant_id, :od_tenant_id_invalid)
            else
              pass_check(:tenant_id)
            end
          end

          def check_client_id
            return pass_check(:client_id) if query_result.success?

            if error_payload[:error] == "unauthorized_client"
              fail_check(:client_id, :client_id_invalid)
            else
              pass_check(:client_id)
            end
          end

          def check_client_secret
            return pass_check(:client_secret) if query_result.success?

            if error_payload[:error] == "invalid_client"
              fail_check(:client_secret, :client_secret_invalid)
            else
              pass_check(:client_secret)
            end
          end

          def diagnostic_request
            if query_result.result == :error
              error "Connection validation failed with unknown error:\n" \
                    "\tstorage: ##{@storage.id} #{@storage.name}\n" \
                    "\tstatus: #{query_result.result}\n" \
                    "\tresponse: #{query_result.error_payload}"

              fail_check(:diagnostic_request, :unknown_error)
            else
              pass_check :diagnostic_request
            end
          end

          def storage_configuration_status
            if @storage.configured?
              pass_check(:storage_configured)
            else
              fail_check(:storage_configured, :not_configured)
            end
          end

          def query_result
            @query_result ||= Registry.resolve("#{@storage}.queries.files")
                                      .call(storage: @storage, auth_strategy:, folder: ParentFolder.root)
          end

          def auth_strategy = Registry.resolve("one_drive.authentication.userless").call

          def error_payload
            return {} if query_result.success?
            return query_result.error_payload if query_result.error_payload.is_a?(Hash)

            @error_payload ||= MultiJson.load(query_result.error_payload, symbolize_keys: true)
          end
        end
      end
    end
  end
end
