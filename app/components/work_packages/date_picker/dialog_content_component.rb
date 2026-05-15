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

# frozen_string_literal: true

module WorkPackages
  module DatePicker
    class DialogContentComponent < ApplicationComponent
      include OpPrimer::ComponentHelpers
      include OpTurbo::Streamable

      DIALOG_FORM_ID = "datepicker-form"

      # Used for the three tabs for predecessors, successors and children in the date picker modal.
      Tab = Data.define(:key, :relation_group)

      attr_reader :work_package, :schedule_manually, :focused_field, :triggering_field, :touched_field_map, :date_mode

      def initialize(work_package:,
                     schedule_manually: true,
                     focused_field: :start_date,
                     triggering_field: nil,
                     touched_field_map: {},
                     live_region_message: "",
                     date_mode: nil)
        super

        @work_package = work_package
        @schedule_manually = ActiveModel::Type::Boolean.new.cast(schedule_manually)
        @focused_field = focused_field
        @triggering_field = triggering_field
        @touched_field_map = touched_field_map
        @date_mode = date_mode
        @live_region_message = live_region_message
      end

      private

      def schedule_manually?
        @schedule_manually
      end

      def has_children_or_predecessors?
        children.any? || follows_relations_used_for_scheduling.any?
      end

      def follows_relations_used_for_scheduling
        @follows_relations_used_for_scheduling ||= Relation.used_for_scheduling_of(work_package)
      end

      def precedes_relations
        @precedes_relations ||= work_package.precedes_relations
      end

      def children
        @children ||= work_package.children
      end

      def additional_tabs
        mediator = WorkPackageRelationsTab::RelationsMediator.new(work_package:)
        [
          Tab.new("predecessors", mediator.relation_group(Relation::TYPE_FOLLOWS)),
          Tab.new("successors", mediator.relation_group(Relation::TYPE_PRECEDES)),
          Tab.new("children", mediator.relation_group(Relation::TYPE_CHILD))
        ]
      end

      # Returns true if dates can be set and saved: if the work package is
      # scheduled manually or if it is scheduled automatically with children or
      # predecessors.
      def can_set_dates?
        schedule_manually? || has_children_or_predecessors?
      end

      def show_banner?
        follows_relations_used_for_scheduling.any? ||
          children.any? ||
          (@schedule_manually && (precedes_relations.any? || work_package.parent_id.present?))
      end
    end
  end
end
