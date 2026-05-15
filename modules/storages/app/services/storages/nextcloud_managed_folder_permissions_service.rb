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
  class NextcloudManagedFolderPermissionsService < BaseService
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
      @project_storages = project_storages_scope || storage.project_storages
    end

    def call
      with_tagged_logger([self.class.name, "storage-#{@storage.id}"]) do
        apply_permissions_to_folders
        epilogue
      end
    end

    private

    def epilogue
      @result
    end

    def apply_permissions_to_folders
      info "Setting permissions to project folders"
      remote_admins = admin_remote_identities.pluck(:origin_user_id)

      @project_storages
        .active
        .automatic
        .with_project_folder
        .order(:project_folder_id)
        .find_each do |project_storage|
          set_folder_permissions(remote_admins, project_storage)
        end

      info "Updating user access on automatically managed project folders"
      add_remove_users_to_group(@storage.group, @storage.username)

      ServiceResult.success
    end

    def add_remove_users_to_group(group, username)
      remote_users = remote_group_users.result_or do |error|
        log_storage_error(error, group:)
        return add_error(:remote_group_users, error, options: { group: }).fail!
      end

      local_users = remote_identities.order(:id).pluck(:origin_user_id)

      remove_users_from_remote_group(remote_users - local_users - [username])
      add_users_to_remote_group(local_users - remote_users - [username])
    end

    def add_users_to_remote_group(users_to_add)
      group = @storage.group

      users_to_add.each do |user|
        add_user_to_group.call(storage: @storage, auth_strategy:, user:, group:).error_and do |error|
          add_error(:add_user_to_group, error, options: { user:, group:, reason: error.log_message })
          log_storage_error(error, group:, user:, reason: error.log_message)
        end
      end
    end

    def remove_users_from_remote_group(users_to_remove)
      group = @storage.group

      users_to_remove.each do |user|
        remove_user_from_group.call(storage: @storage, auth_strategy:, user:, group:).error_and do |error|
          add_error(:remove_user_from_group, error, options: { user:, group:, reason: error.log_message })
          log_storage_error(error, group:, user:, reason: error.log_message)
        end
      end
    end

    # rubocop:disable Metrics/AbcSize
    def set_folder_permissions(remote_admins, project_storage)
      system_user = [{ user_id: @storage.username, permissions: FILE_PERMISSIONS }]

      admin_permissions = remote_admins.to_set.map { |username| { user_id: username, permissions: FILE_PERMISSIONS } }

      users_permissions = project_remote_identities(project_storage).map do |identity|
        permissions = identity.user.all_permissions_for(project_storage.project) & FILE_PERMISSIONS
        { user_id: identity.origin_user_id, permissions: }
      end

      group_permissions = [{ group_id: @storage.group, permissions: [] }]

      permissions = system_user + admin_permissions + users_permissions + group_permissions
      project_folder_id = project_storage.project_folder_id

      input_data = build_set_permissions_input_data(project_folder_id, permissions).value_or do |failure|
        log_validation_error(failure, project_folder_id:, permissions:)
        return # rubocop:disable Lint/NonLocalExitFromIterator
      end

      set_permissions.call(storage: @storage, auth_strategy:, input_data:).on_failure do |service_result|
        log_storage_error(service_result.errors, folder: project_folder_id)
        add_error(:set_folder_permission, service_result.errors, options: { folder: project_folder_id })
      end
    end

    # rubocop:enable Metrics/AbcSize

    def project_remote_identities(project_storage)
      user_remote_identities = remote_identities.where.not(id: admin_remote_identities).order(:id)

      if project_storage.project.public? && ProjectRole.non_member.permissions.intersect?(FILE_PERMISSIONS)
        user_remote_identities
      else
        user_remote_identities.where(user: project_storage.project.users)
      end
    end

    def build_set_permissions_input_data(file_id, user_permissions)
      Peripherals::StorageInteraction::Inputs::SetPermissions.build(file_id:, user_permissions:)
    end

    def remote_group_users
      info "Retrieving users that are part of the #{@storage.group} group"
      group_users.call(storage: @storage, auth_strategy:, group: @storage.group)
    end

    ### Model Scopes

    def remote_identities
      RemoteIdentity.includes(:user).where(integration: @storage)
    end

    def admin_remote_identities
      remote_identities.where(user: User.admin.active)
    end

    def set_permissions = Peripherals::Registry.resolve("nextcloud.commands.set_permissions")

    def add_user_to_group = Peripherals::Registry.resolve("nextcloud.commands.add_user_to_group")

    def remove_user_from_group = Peripherals::Registry.resolve("nextcloud.commands.remove_user_from_group")

    def group_users = Peripherals::Registry.resolve("nextcloud.queries.group_users")

    def userless = Peripherals::Registry.resolve("nextcloud.authentication.userless")

    def auth_strategy
      @auth_strategy ||= userless.call
    end
  end
end
