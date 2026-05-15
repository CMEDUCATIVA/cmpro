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
      class ValidatorResult
        private attr_reader :group_results

        delegate :each_pair, :empty?, to: :group_results

        def initialize
          @group_results = {}
        end

        def healthy? = group_results.values.all?(&:success?)

        def unhealthy? = group_results.values.any?(&:failure?)

        def warning? = group_results.values.any?(&:warning?)

        def group(key) = group_results.fetch(key)

        alias_method :fetch, :group

        def add_group_result(key, result)
          Kernel.warn "Overwriting #{key} results" if group_results.key?(key)

          group_results[key] = result
        end

        def tally
          group_results.reduce({}) do |tally, (_, group)|
            tally.merge(group.tally) { |_, v1, v2| v1 + v2 }
          end
        end

        def latest_timestamp
          group_results.values.filter_map(&:timestamp).max
        end

        def humanize_summary
          case tally
          in { failure: 1.. }
            I18n.t("storages.health.checks.failures", count: tally[:failure])
          in { warning: 1.. }
            I18n.t("storages.health.checks.warnings", count: tally[:warning])
          else
            I18n.t("storages.health.checks.success")
          end
        end

        def to_h
          group_results.transform_values(&:to_h)
        end
      end
    end
  end
end
