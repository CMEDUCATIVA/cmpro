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
  class OneDriveManagedFolderCreateService < BaseService
    using Peripherals::ServiceResultRefinements

    def self.i18n_key = "one_drive_sync_service"

    class << self
      def call(storage:, project_storages_scope: nil)
        new(storage:, project_storages_scope:).call
      end
    end

    def initialize(storage:, project_storages_scope: nil)
      super()
      @storage = storage
      @hide_missing_folders = project_storages_scope.nil?
      @project_storages = (project_storages_scope || @storage.project_storages).active.automatic
    end

    def call
      with_tagged_logger([self.class.name, "storage-#{@storage.id}"]) do
        existing_remote_folders = remote_folders_map(@storage.drive_id).on_failure { return @result }.result

        ensure_folders_exist(existing_remote_folders).on_success do
          hide_inactive_folders(existing_remote_folders) if @hide_missing_folders
        end

        @result
      end
    end

    private

    def ensure_folders_exist(folder_map)
      info "Ensuring that automatically managed project folders exist and are correctly named."
      @project_storages.includes(:project).find_each do |project_storage|
        unless folder_map.key?(project_storage.project_folder_id)
          info "#{project_storage.managed_project_folder_path} does not exist. Creating..."
          next create_remote_folder(project_storage.managed_project_folder_path, project_storage.id)
        end

        rename_project_folder(folder_map[project_storage.project_folder_id], project_storage)
      end

      ServiceResult.success(result: "folders processed")
    end

    def hide_inactive_folders(folder_map)
      info "Hiding folders related to inactive projects"

      inactive_folder_ids(folder_map).each { |item_id| hide_folder(item_id) }
    end

    def hide_folder(item_id)
      info "Hiding folder with ID #{item_id} as it does not belong to any active project"

      build_permissions_input_data(item_id, [])
        .either(
          ->(input_data) do
            set_permissions.call(storage: @storage, auth_strategy:, input_data:)
                           .on_failure do |service_result|
              log_storage_error(service_result.errors, item_id:, context: "hide_folder")
              add_error(:hide_inactive_folders, service_result.errors, options: { path: folder_map[item_id] })
            end
          end,
          ->(failure) { log_validation_error(failure, item_id:, context: "hide_folder") }
        )
    end

    def inactive_folder_ids(folder_map)
      folder_map.keys - @project_storages.pluck(:project_folder_id).compact
    end

    def rename_project_folder(current_folder_name, project_storage)
      actual_path = project_storage.managed_project_folder_path
      return if current_folder_name == actual_path

      info "#{current_folder_name} is misnamed. Renaming to #{actual_path}"
      folder_id = project_storage.project_folder_id
      rename_file.call(storage: @storage, auth_strategy:, file_id: folder_id, name: actual_path)
                 .on_failure do |service_result|
        log_storage_error(service_result.errors, folder_id:, folder_name: actual_path)

        add_error(
          :rename_project_folder, service_result.errors,
          options: { current_path: current_folder_name, project_folder_name: actual_path, project_folder_id: folder_id }
        )
      end
    end

    def create_remote_folder(folder_name, project_storage_id)
      folder_info = create_folder.call(storage: @storage, auth_strategy:, folder_name:, parent_location: root_folder)
                                 .on_failure do |service_result|
        log_storage_error(service_result.errors, folder_name:)
        return add_error(:create_folder, service_result.errors, options: { folder_name:, parent_location: root_folder })
      end.result

      last_project_folder = ::Storages::LastProjectFolder.find_by(project_storage_id:, mode: :automatic)

      audit_last_project_folder(last_project_folder, folder_info.id)
    end

    def audit_last_project_folder(last_project_folder, project_folder_id)
      ApplicationRecord.transaction do
        success =
          last_project_folder.update(origin_folder_id: project_folder_id) &&
            last_project_folder.project_storage.update(project_folder_id:)

        raise ActiveRecord::Rollback unless success
      end
    end

    def remote_folders_map(drive_id)
      info "Retrieving already existing folders under #{drive_id}"

      file_list = files.call(storage: @storage, auth_strategy:, folder: root_folder).on_failure do |failed|
        log_storage_error(failed.errors, { drive_id: })
        return add_error(:remote_folders, failed.errors, options: { drive_id: }).fail!
      end.result

      ServiceResult.success(result: filter_folders_from(file_list.files))
    end

    # @param files [Array<Storages::StorageFile>]
    # @return Hash{String => String} a hash of item ID and item name.
    def filter_folders_from(files)
      folders = files.each_with_object({}) do |file, hash|
        next unless file.folder?

        hash[file.id] = file.name
      end

      info "Found #{folders.size} folders. #{folders}"

      folders
    end

    def root_folder = Peripherals::ParentFolder.new("/")

    def create_folder = Peripherals::Registry.resolve("one_drive.commands.create_folder")

    def rename_file = Peripherals::Registry.resolve("one_drive.commands.rename_file")

    def set_permissions = Peripherals::Registry.resolve("one_drive.commands.set_permissions")

    def files = Peripherals::Registry.resolve("one_drive.queries.files")

    def userless = Peripherals::Registry.resolve("one_drive.authentication.userless")

    def auth_strategy = userless.call

    def build_permissions_input_data(file_id, user_permissions)
      Peripherals::StorageInteraction::Inputs::SetPermissions.build(file_id:, user_permissions:)
    end
  end
end
