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
        class AmpfConfigurationValidator < BaseValidatorGroup
          TEST_FOLDER_NAME = "OpenProjectConnectionValidationFolder"

          def self.key = :ampf_configuration

          private

          def validate
            register_checks :client_folder_creation, :client_folder_removal, :drive_contents

            client_permissions
            unexpected_content
          end

          def unexpected_content
            unexpected_files = files_query
                                 .on_failure { fail_check(:drive_contents, :unknown_error) }
                                 .result.files.reject { managed_project_folder_ids.include?(it.id) }

            if unexpected_files.empty?
              pass_check(:drive_contents)
            else
              log_extraneous_files(unexpected_files)
              warn_check(:drive_contents, :od_unexpected_content)
            end
          end

          # Testing setting permissions and checking permission inheritance would be great
          # but there are some challenges to it. We need to figure out a good way to go about this
          # 2025-04-08 @mereghost
          def client_permissions
            folder = create_folder.result
            delete_folder(folder)
          end

          def delete_folder(folder)
            Registry["one_drive.commands.delete_folder"]
              .call(storage: @storage, auth_strategy:, location: folder.id)
              .on_failure { fail_check(:client_folder_removal, :od_client_cant_delete_folder) }
              .on_success { pass_check(:client_folder_removal) }
          end

          def create_folder
            Registry["one_drive.commands.create_folder"]
              .call(storage: @storage, auth_strategy:, folder_name: TEST_FOLDER_NAME, parent_location: ParentFolder.root)
              .on_success { pass_check(:client_folder_creation) }
              .on_failure do
              code = it.result == :already_exists ? :od_test_folder_exists : :od_client_write_permission_missing
              fail_check(:client_folder_creation, code, context: { folder_name: TEST_FOLDER_NAME })
            end
          end

          def log_extraneous_files(unexpected_files)
            file_representation = unexpected_files.map do |file|
              "Name: #{file.name}, ID: #{file.id}, Location: #{file.location}"
            end

            warn "Unexpected files/folder found in group folder:\n\t#{file_representation.join("\n\t")}"
          end

          def managed_project_folder_ids
            @managed_project_folder_ids ||= ProjectStorage.automatic.where(storage: @storage)
                                                          .pluck(:project_folder_id).to_set
          end

          def files_query = Registry["one_drive.queries.files"].call(storage: @storage, auth_strategy:, folder: ParentFolder.root)

          def auth_strategy = Registry["one_drive.authentication.userless"].call
        end
      end
    end
  end
end
