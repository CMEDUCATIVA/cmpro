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
      CheckResult = Data.define(:key, :state, :code, :timestamp, :context) do
        private_class_method :new

        def self.skipped(key)
          new(key:, state: :skipped, code: nil, timestamp: nil, context: nil)
        end

        def self.failure(key, code, context)
          new(key:, state: :failure, code:, timestamp: Time.zone.now, context:)
        end

        def self.success(key)
          new(key:, state: :success, code: nil, timestamp: Time.zone.now, context: nil)
        end

        def self.warning(key, code, context)
          new(key:, state: :warning, code:, timestamp: Time.zone.now, context:)
        end

        def success? = state == :success

        def failure? = state == :failure

        def warning? = state == :warning

        def skipped? = state == :skipped

        def humanize_title(group) = I18n.t("storages.health.checks.#{group}.#{key}")

        def humanize_error_message
          return nil if code.nil?

          I18n.t("storages.health.connection_validation.#{code}", **context)
        end

        def to_h
          { state: state.to_s, code:, context:, timestamp: timestamp&.iso8601 }
        end
      end
    end
  end
end
