# frozen_string_literal: true

# -- copyright
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
# ++
module Filter
  # rubocop:disable OpenProject/AddPreviewForViewComponent
  class FilterComponent < ApplicationComponent
    OPERATORS_WITHOUT_VALUES = %w[* !* t w].freeze

    # rubocop:enable OpenProject/AddPreviewForViewComponent
    options :query
    options always_visible: false

    def show_filters_section?
      always_visible || params[:filters].present?
    end

    # Returns filters, active and inactive.
    # In case a filter is active, the active one will be preferred over the inactive one.
    def each_filter
      allowed_filters.each do |allowed_filter|
        active_filter = query.find_active_filter(allowed_filter.name)
        filter = active_filter || allowed_filter

        yield filter, active_filter.present?, additional_filter_attributes(filter)
      end
    end

    def allowed_filters
      query.available_advanced_filters
    end

    def value_hidden_class(selected_operator)
      operator_without_value?(selected_operator) ? "hidden" : ""
    end

    def operator_without_value?(operator)
      OPERATORS_WITHOUT_VALUES.include?(operator)
    end

    protected

    # With this method we can pass additional options for each type of filter into the frontend. This is especially
    # useful when we want to pass options for the autocompleter components.
    #
    # When the method is overwritten in a subclass, the subclass should call super(filter) to get the default attributes.
    #
    # @param filter [QueryFilter] the filter for which we want to pass additional attributes
    # @return [Hash] the additional attributes for the filter, that will be yielded in the each_filter method
    def additional_filter_attributes(filter)
      case filter
      when Queries::Filters::Shared::ProjectFilter::Required,
           Queries::Filters::Shared::ProjectFilter::Optional
        { autocomplete_options: project_autocomplete_options }
      when Queries::Filters::Shared::CustomFields::User
        { autocomplete_options: user_autocomplete_options }
      when Queries::Filters::Shared::CustomFields::ListOptional
        { autocomplete_options: custom_field_list_autocomplete_options(filter) }
      when Queries::Projects::Filters::ProjectStatusFilter,
           Queries::Projects::Filters::TypeFilter
        { autocomplete_options: list_autocomplete_options(filter) }
      else
        {}
      end
    end

    def custom_field_list_autocomplete_options(filter)
      options = if filter.custom_field.version?
                  {
                    items: filter.allowed_values.map { |name, id, project_name| { name:, id:, project_name: } },
                    groupBy: "project_name"
                  }
                else
                  { items: filter.allowed_values.map { |name, id| { name:, id: } } }
                end
      autocomplete_options.merge(options).merge(model: filter.values)
    end

    def list_autocomplete_options(filter)
      autocomplete_options.merge(
        items: filter.allowed_values.map { |name, id| { name:, id: } },
        model: filter.values
      )
    end

    def autocomplete_options
      {
        component: "opce-autocompleter",
        bindValue: "id",
        bindLabel: "name",
        hideSelected: true
      }
    end

    def project_autocomplete_options
      {
        component: "opce-project-autocompleter",
        resource: "projects",
        filters: [
          { name: "active", operator: "=", values: ["t"] }
        ]
      }
    end

    def user_autocomplete_options
      {
        component: "opce-user-autocompleter",
        hideSelected: true,
        defaultData: false,
        placeholder: I18n.t(:label_user_search),
        resource: "principals",
        url: ::API::V3::Utilities::PathHelper::ApiV3Path.principals,
        filters: [
          { name: "type", operator: "=", values: ["User"] },
          { name: "status", operator: "!", values: [Principal.statuses["locked"].to_s] }
        ],
        searchKey: "any_name_attribute",
        focusDirectly: false
      }
    end
  end
end
