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
      class ValidationGroupResult
        delegate :[], :each_pair, to: :@results

        attr_reader :key

        def initialize(key)
          @key = key
          @results = {}
        end

        def success? = @results.values.all?(&:success?)

        def non_failure? = @results.values.none?(&:failure?)

        def failure? = @results.values.any?(&:failure?)

        def warning? = @results.values.any?(&:warning?)

        def tally
          @results.values.map(&:state).tally
        end

        def register_checks(keys)
          Array(keys).each { register_check(it) }
        end

        def register_check(key)
          warn("Overriding already defined check") if @results.key?(key)

          @results[key] = CheckResult.skipped(key)
        end

        def update_result(key, value)
          raise(ArgumentError, "Check #{key} not registered.") unless @results.key?(key)

          @results[key] = value
        end

        def timestamp
          @results.values.filter_map(&:timestamp).max
        end

        def humanize_title = I18n.t("storages.health.checks.#{key}.header")

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
          @results.transform_values(&:to_h)
        end
      end
    end
  end
end
