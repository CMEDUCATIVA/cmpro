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
  class NextcloudManagedFolderCreateService < BaseService
    using Peripherals::ServiceResultRefinements

    FILE_PERMISSIONS = OpenProject::Storages::Engine.external_file_permissions

    def self.i18n_key = "nextcloud_sync_service"

    class << self
      def call(storage:, project_storages_scope: nil)
        new(storage:, project_storages_scope:).call
      end
    end

    def initialize(storage:, project_storages_scope: nil)
      super()
      @storage = storage

      @hide_missing_folders = project_storages_scope.nil?
      @project_storages = (project_storages_scope || storage.project_storages).active.automatic
    end

    def call
      with_tagged_logger([self.class.name, "storage-#{@storage.id}"]) do
        prepare_remote_folders.on_failure { return epilogue }
        epilogue
      end
    end

    private

    def epilogue
      @result
    end

    # @return [ServiceResult]
    def prepare_remote_folders
      info "Preparing the remote group folder #{@storage.group_folder}"

      remote_folders = remote_root_folder_map(@storage.group_folder).on_failure { return it }.result
      info "Found #{remote_folders.count} remote folders"

      ensure_root_folder_permissions(remote_folders["/#{@storage.group_folder}"].id).on_failure { return it }

      ensure_folders_exist(remote_folders).on_success do
        hide_inactive_folders(remote_folders) if @hide_missing_folders
      end
    end

    # rubocop:disable Metrics/AbcSize
    def hide_inactive_folders(remote_folders)
      info "Hiding folders related to inactive projects"
      project_folder_ids = @project_storages.pluck(:project_folder_id).compact

      remote_folders.except("/#{@storage.group_folder}").each do |(path, file)|
        folder_id = file.id

        next if project_folder_ids.include?(folder_id)

        info "Hiding folder #{folder_id} (#{path}) as it does not belong to any active project"
        permissions = [
          { user_id: @storage.username, permissions: FILE_PERMISSIONS },
          { group_id: @storage.group, permissions: [] }
        ]

        input_data = build_set_permissions_input_data(folder_id, permissions).value_or do |failure|
          log_validation_error(failure, folder_id:, permissions:)
          return # rubocop:disable Lint/NonLocalExitFromIterator
        end

        set_permissions.call(storage: @storage, auth_strategy:, input_data:).on_failure do |service_result|
          log_storage_error(service_result.errors, folder_id:, context: "hide_folder")
          add_error(:hide_inactive_folders, service_result.errors, options: { folder_id: })
        end
      end
    end

    # rubocop:enable Metrics/AbcSize

    def ensure_folders_exist(remote_folders)
      info "Ensuring that automatically managed project folders exist and are correctly named."
      id_folder_map = remote_folders.to_h { |path, file| [file.id, path] }

      @project_storages.includes(:project).map do |project_storage|
        unless id_folder_map.key?(project_storage.project_folder_id)
          info "#{project_storage.managed_project_folder_path} does not exist. Creating..."
          next create_remote_folder(project_storage)
        end

        rename_folder(project_storage, id_folder_map[project_storage.project_folder_id])&.on_failure { return it }
      end

      # We processed every folder successfully
      ServiceResult.success
    end

    # @param project_storage [Storages::ProjectStorage] Storages::ProjectStorage that the remote folder might need renaming
    # @param current_path [String] current name of the remote project storage folder
    # @return [ServiceResult, nil]
    def rename_folder(project_storage, current_path)
      return if UrlBuilder.path(current_path) == UrlBuilder.path(project_storage.managed_project_folder_path)

      name = project_storage.managed_project_folder_name
      file_id = project_storage.project_folder_id

      info "#{current_path} is misnamed. Renaming to #{name}"
      rename_file.call(storage: @storage, auth_strategy:, file_id:, name:).on_failure do |service_result|
        log_storage_error(service_result.errors, folder_id: file_id, folder_name: name)

        add_error(:rename_project_folder, service_result.errors,
                  options: { current_path:, project_folder_name: name, project_folder_id: file_id }).fail!
      end
    end

    def create_remote_folder(project_storage)
      folder_name = project_storage.managed_project_folder_path
      parent_location = Peripherals::ParentFolder.new("/")

      created_folder = create_folder.call(storage: @storage, auth_strategy:, folder_name:, parent_location:)
                                    .on_failure do |service_result|
        log_storage_error(service_result.errors, folder_name:)

        return add_error(:create_folder, service_result.errors, options: { folder_name:, parent_location: })
      end.result

      last_project_folder = LastProjectFolder.find_or_initialize_by(
        project_storage_id: project_storage.id, mode: project_storage.project_folder_mode
      )

      audit_last_project_folder(last_project_folder, created_folder.id)
    end

    def audit_last_project_folder(last_project_folder, project_folder_id)
      ApplicationRecord.transaction do
        success = last_project_folder.update(origin_folder_id: project_folder_id) &&
          last_project_folder.project_storage.update(project_folder_id:)

        raise ActiveRecord::Rollback unless success
      end
    end

    # rubocop:disable Metrics/AbcSize
    # @param root_folder_id [String] the id of the root folder
    # @return [ServiceResult]
    def ensure_root_folder_permissions(root_folder_id)
      username = @storage.username
      group = @storage.group
      info "Setting needed permissions for user #{username} and group #{group} on the root group folder."
      permissions = [
        { user_id: username, permissions: FILE_PERMISSIONS },
        { group_id: group, permissions: [:read_files] }
      ]

      input_data = build_set_permissions_input_data(root_folder_id, permissions).value_or do |failure|
        log_validation_error(failure, root_folder_id:, permissions:)
        return ServiceResult.failure(result: failure.errors.to_h) # rubocop:disable Rails/DeprecatedActiveModelErrorsMethods
      end

      set_permissions.call(storage: @storage, auth_strategy:, input_data:).on_failure do |service_result|
        log_storage_error(service_result.errors, folder: "root", root_folder_id:)
        add_error(:ensure_root_folder_permissions, service_result.errors, options: { group:, username: }).fail!
      end
    end

    # rubocop:enable Metrics/AbcSize

    def remote_root_folder_map(group_folder)
      info "Retrieving already existing folders under #{group_folder}"
      file_path_to_id_map.call(storage: @storage,
                               auth_strategy:,
                               folder: Peripherals::ParentFolder.new(group_folder),
                               depth: 1)
                         .on_failure do |service_result|
        log_storage_error(service_result.errors, { folder: group_folder })
        add_error(:remote_folders, service_result.errors, options: { group_folder:, username: @storage.username }).fail!
      end
    end

    def build_set_permissions_input_data(file_id, user_permissions)
      Peripherals::StorageInteraction::Inputs::SetPermissions.build(file_id:, user_permissions:)
    end

    def create_folder = Peripherals::Registry.resolve("nextcloud.commands.create_folder")

    def rename_file = Peripherals::Registry.resolve("nextcloud.commands.rename_file")

    def set_permissions = Peripherals::Registry.resolve("nextcloud.commands.set_permissions")

    def file_path_to_id_map = Peripherals::Registry.resolve("nextcloud.queries.file_path_to_id_map")

    def userless = Peripherals::Registry.resolve("nextcloud.authentication.userless")

    def auth_strategy
      @auth_strategy ||= userless.call
    end
  end
end
