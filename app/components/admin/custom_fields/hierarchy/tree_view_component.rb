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

module Admin
  module CustomFields
    module Hierarchy
      class TreeViewComponent < ApplicationComponent
        def initialize(custom_field:, active_item:)
          super

          @custom_field = custom_field
          @active_item = active_item
          @hierarchy_service = ::CustomFields::Hierarchy::HierarchicalItemService.new
        end

        def hierarchy_items
          hashed_hierarchy = @custom_field.hierarchy_root.hash_tree
          hashed_hierarchy.nil? ? {} : hashed_hierarchy.first[1]
        end

        def add_sub_tree(tree, hierarchy_hash)
          hierarchy_hash.each do |item, child_hash|
            if child_hash.empty?
              tree.with_leaf(**item_options(item))
            else
              expanded = child_hash.any? { |child, _| current?(child) }

              tree.with_sub_tree(expanded: expanded, **item_options(item)) do |sub_tree|
                add_sub_tree(sub_tree, child_hash)
              end
            end
          end
        end

        def item_options(item)
          {
            label: item.label,
            current: current?(item),
            href: custom_field_item_path(@custom_field, item)
          }
        end

        def current?(item)
          item.id == @active_item.id
        end
      end
    end
  end
end
