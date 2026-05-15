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

module Migration
  module MigrationUtils
    module PermissionAdder
      module_function

      # Adds a permission to all roles that have the filter permission.
      # E.g. this can be used to add a new permission to all roles having the :view_work_packages permission.
      # It is possible to force adding the permission. This might be necessary for older migrations
      # where the permission has been removed/renamed in the meantime.
      # @param [Symbol] having The permission to filter the roles by
      # @param [Symbol] add The permission to add
      # @param [FalseClass, TrueClass] force Whether to force adding the permission even if it is not a valid permission.
      def add(having, add, force: false) # rubocop:disable Metrics/AbcSize, Metrics/PerceivedComplexity
        added_permission = OpenProject::AccessControl.permission(add)

        if added_permission.blank? && !force
          OpenProject.logger.warn("Permission #{add} is not a valid permission in use. Skipping...")
          return
        end

        role_scope = Role
          .joins(:role_permissions)
          .where(role_permissions: { permission: having.to_s })
          .references(:role_permissions)

        role_scope.find_each do |role|
          # Check if the add-permission already exists before adding
          next if RolePermission.exists?(role_id: role.id, permission: add.to_s)

          # we cannot add permissions that require a member to a non-member role
          next if !force && added_permission.require_member? && role.builtin == Role::BUILTIN_NON_MEMBER

          # we cannot add permissions that require a logged in user to an anonymous role
          next if !force && added_permission.require_loggedin? && role.builtin == Role::BUILTIN_ANONYMOUS

          role.add_permission! add
        end
      end
    end
  end
end
