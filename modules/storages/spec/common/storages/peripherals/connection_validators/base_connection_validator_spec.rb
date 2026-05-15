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

require "spec_helper"
require_module_spec_helper

module Storages
  module Peripherals
    module ConnectionValidators
      class TestValidator < BaseConnectionValidator
        def self.reset_groups!
          @validation_groups = nil
        end
      end

      RSpec.describe BaseConnectionValidator, :webmock do
        let(:storage) { create(:nextcloud_storage_configured) }

        subject(:validator) { TestValidator.new(storage) }

        after { TestValidator.reset_groups! }

        it "returns a ValidationResult" do
          expect(validator.call).to be_a(ValidatorResult)
        end

        it "only runs a verification if the precondition evaluates as truthy" do
          test_group = class_spy(Nextcloud::StorageConfigurationValidator)
          TestValidator.register_group test_group, precondition: ->(_, _) { false }

          result = validator.call
          expect(result).to be_empty
          expect(test_group).not_to have_received(:call)
        end

        it "aggregates all the results from the tests", vcr: "nextcloud/capabilities_success" do
          TestValidator.register_group Nextcloud::StorageConfigurationValidator
          TestValidator.register_group Nextcloud::AuthenticationValidator,
                                       precondition: ->(_, result) do
                                         result.group(Nextcloud::StorageConfigurationValidator.key).non_failure?
                                       end

          results = TestValidator.new(create(:nextcloud_storage_with_local_connection)).call

          expect(results).to be_warning
          expect(results.group(Nextcloud::StorageConfigurationValidator.key)).to be_success
          expect(results.group(Nextcloud::AuthenticationValidator.key)).to be_warning
        end
      end
    end
  end
end
