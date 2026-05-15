# frozen_string_literal: true

#
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

class RenameCommentPermissions < ActiveRecord::Migration[8.0]
  def change
    rename_permissions("add_work_package_notes", "add_work_package_comments")
    rename_permissions("edit_own_work_package_notes", "edit_own_work_package_comments")
    rename_permissions("edit_work_package_notes", "edit_work_package_comments")

    rename_permissions("view_comments_with_restricted_visibility", "view_internal_comments")
    rename_permissions("add_comments_with_restricted_visibility", "add_internal_comments")
    rename_permissions("edit_own_comments_with_restricted_visibility", "edit_own_internal_comments")
    rename_permissions("edit_others_comments_with_restricted_visibility", "edit_others_internal_comments")
  end

  def rename_permissions(old, new)
    execute <<-SQL.squish
      UPDATE role_permissions
      SET permission = '#{new}'
      WHERE permission = '#{old}'
    SQL
  end
end
