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

module Types
  module Patterns
    class TokenPropertyMapper
      # rubocop:disable Layout/LineLength
      BASE_ATTRIBUTE_TOKENS = [
        AttributeToken.new(:id, -> { WorkPackage.human_attribute_name(:id) }, ->(wp) { wp.id }),
        AttributeToken.new(:accountable, -> { WorkPackage.human_attribute_name(:responsible) }, ->(wp) { wp.responsible&.name }),
        AttributeToken.new(:assignee, -> { WorkPackage.human_attribute_name(:assigned_to) }, ->(wp) { wp.assigned_to&.name }),
        AttributeToken.new(:author, -> { WorkPackage.human_attribute_name(:author) }, ->(wp) { wp.author&.name }),
        AttributeToken.new(:category, -> { WorkPackage.human_attribute_name(:category) }, ->(wp) { wp.category&.name }),
        AttributeToken.new(:creation_date, -> { WorkPackage.human_attribute_name(:created_at) }, ->(wp) { wp.created_at }),
        AttributeToken.new(:estimated_time, -> { WorkPackage.human_attribute_name(:estimated_hours) }, ->(wp) { wp.estimated_hours }),
        AttributeToken.new(:remaining_time, -> { WorkPackage.human_attribute_name(:remaining_hours) }, ->(wp) { wp.remaining_hours }),
        AttributeToken.new(:finish_date, -> { WorkPackage.human_attribute_name(:due_date) }, ->(wp) { wp.due_date }),
        AttributeToken.new(:parent_id, -> { WorkPackage.human_attribute_name(:id) }, ->(parent) { parent.id }),
        AttributeToken.new(:parent_assignee, -> { WorkPackage.human_attribute_name(:assigned_to) }, ->(parent) { parent.assigned_to&.name }),
        AttributeToken.new(:parent_author, -> { WorkPackage.human_attribute_name(:author) }, ->(parent) { parent.author&.name }),
        AttributeToken.new(:parent_category, -> { WorkPackage.human_attribute_name(:category) }, ->(parent) { parent.category&.name }),
        AttributeToken.new(:parent_creation_date, -> { WorkPackage.human_attribute_name(:created_at) }, ->(parent) { parent.created_at }),
        AttributeToken.new(:parent_estimated_time, -> { WorkPackage.human_attribute_name(:estimated_hours) }, ->(parent) { parent.estimated_hours }),
        AttributeToken.new(:parent_remaining_time, -> { WorkPackage.human_attribute_name(:remaining_hours) }, ->(parent) { parent.remaining_hours }),
        AttributeToken.new(:parent_finish_date, -> { WorkPackage.human_attribute_name(:due_date) }, ->(parent) { parent.due_date }),
        AttributeToken.new(:parent_priority, -> { WorkPackage.human_attribute_name(:priority) }, ->(parent) { parent.priority }),
        AttributeToken.new(:parent_subject, -> { WorkPackage.human_attribute_name(:subject) }, ->(parent) { parent.subject }),
        AttributeToken.new(:parent_status, -> { WorkPackage.human_attribute_name(:status) }, ->(parent) { parent.status&.name }),
        AttributeToken.new(:parent_type, -> { WorkPackage.human_attribute_name(:type) }, ->(parent) { parent.type&.name }),
        AttributeToken.new(:parent_version, -> { WorkPackage.human_attribute_name(:version) }, ->(parent) { parent.version&.name }),
        AttributeToken.new(:priority, -> { WorkPackage.human_attribute_name(:priority) }, ->(wp) { wp.priority }),
        AttributeToken.new(:project_id, -> { Project.human_attribute_name(:id) }, ->(project) { project.id }),
        AttributeToken.new(:project_active, -> { Project.human_attribute_name(:active) }, ->(project) { project.active? }),
        AttributeToken.new(:project_name, -> { Project.human_attribute_name(:name) }, ->(project) { project.name }),
        AttributeToken.new(:project_status, -> { Project.human_attribute_name(:status_code) }, ->(project) { project.status_code && I18n.t("activerecord.attributes.project.status_codes.#{project.status_code}") }),
        AttributeToken.new(:project_parent, -> { Project.human_attribute_name(:parent) }, ->(project) { project.parent_id }),
        AttributeToken.new(:project_public, -> { Project.human_attribute_name(:public) }, ->(project) { project.public? }),
        AttributeToken.new(:start_date, -> { WorkPackage.human_attribute_name(:start_date) }, ->(wp) { wp.start_date }),
        AttributeToken.new(:status, -> { WorkPackage.human_attribute_name(:status) }, ->(wp) { wp.status&.name }),
        AttributeToken.new(:type, -> { WorkPackage.human_attribute_name(:type) }, ->(wp) { wp.type&.name }),
        AttributeToken.new(:version, -> { WorkPackage.human_attribute_name(:version) }, ->(wp) { wp.version&.name })
      ].freeze
      # rubocop:enable Layout/LineLength

      def tokens_for_type(type)
        [
          *BASE_ATTRIBUTE_TOKENS,
          *tokenize(work_package_cfs_for(type)),
          *tokenize(project_cfs, "project_"),
          *tokenize(all_work_package_cfs, "parent_")
        ]
      end

      private

      def default_tokens
        BASE_ATTRIBUTE_TOKENS.each_with_object({ work_package: {}, project: {}, parent: {} }) do |token, obj|
          case token.key.to_s
          when /^project_/
            obj[:project][token.key] = token
          when /^parent_/
            obj[:parent][token.key] = token
          else
            obj[:work_package][token.key] = token
          end
        end
      end

      def prefixed_label(context, attribute_label)
        attribute_context = I18n.t("types.edit.subject_configuration.token.context.#{context}")
        I18n.t("types.edit.subject_configuration.token.label_with_context", attribute_context:, attribute_label:)
      end

      def tokenize(custom_field_scope, prefix = nil)
        custom_field_scope.pluck(:name, :id).map do |name, id|
          AttributeToken.new(
            :"#{prefix}custom_field_#{id}",
            -> { name },
            ->(context) do
              key = :"custom_field_#{id}"
              return :attribute_not_available unless context.respond_to?(key)

              context.public_send(key)
            end
          )
        end
      end

      def work_package_cfs_for(type)
        all_work_package_cfs.merge(type.custom_fields)
      end

      def all_work_package_cfs
        WorkPackageCustomField.where.not(field_format: %w[text link empty]).order(:name)
      end

      def project_cfs
        ProjectCustomField.where.not(field_format: %w[text link empty]).where(admin_only: false, multi_value: false).order(:name)
      end
    end
  end
end
