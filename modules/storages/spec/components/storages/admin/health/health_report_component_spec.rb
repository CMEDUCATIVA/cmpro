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

require "rails_helper"

RSpec.describe Storages::Admin::Health::HealthReportComponent, type: :component do
  let(:storage) { create(:nextcloud_storage_configured) }

  subject(:health_report_component) { described_class.new(storage:, report:) }

  before do
    render_inline(health_report_component)
  end

  context "if report is not available" do
    let(:report) { nil }

    it "renders a placeholder blankslate" do
      expect(page).to have_text("No report available")
      expect(page).to have_link("Run checks now")
    end
  end

  context "if report is available" do
    let(:report) do
      # rubocop:disable Naming/VariableNumber
      generate_test_report(
        group_1: %i[success success],
        group_2: %i[skipped skipped],
        group_3: %i[success success warning warning],
        group_4: %i[success failure failure],
        group_5: %i[success failure warning]
      )
      # rubocop:enable Naming/VariableNumber
    end

    it "renders a summary" do
      expect(page).to have_text("3 checks failed")
      expect(page).to have_text("Some checks failed and the system does not work as expected.")
    end

    it "renders each group separately" do
      expect(page).to have_test_selector("op-storages--health-report-group", count: 5)

      summaries = {
        0 => "All checks passed",
        1 => "All checks passed",
        2 => "2 checks returned a warning",
        3 => "2 checks failed",
        4 => "1 check failed"
      }

      page.all(test_selector("op-storages--health-report-group")).each_with_index do |group, idx|
        expect(group).to have_text("Group #{idx + 1}")
        expect(group).to have_text(summaries[idx])
      end
    end
  end

  private

  def generate_test_group(group_key, checks)
    group = Storages::Peripherals::ConnectionValidators::ValidationGroupResult.new(group_key)

    checks.each_with_index do |check, idx|
      key = :"check_#{idx + 1}"
      result = case check
               when :success
                 Storages::Peripherals::ConnectionValidators::CheckResult.success(key)
               when :warning
                 Storages::Peripherals::ConnectionValidators::CheckResult.warning(key, :"#{key}_warning", nil)
               when :failure
                 Storages::Peripherals::ConnectionValidators::CheckResult.failure(key, :"#{key}_failure", nil)
               else
                 Storages::Peripherals::ConnectionValidators::CheckResult.skipped(key)
               end

      group.register_check(key)
      group.update_result(key, result)
      allow(I18n).to receive(:t).with("storages.health.checks.#{group_key}.#{key}").and_return(key.to_s.humanize)
      if result.code.present?
        allow(I18n).to receive(:t).with("storages.health.connection_validation.#{result.code}")
                                  .and_return(result.code.to_s.humanize)
      end
    end

    group
  end

  def generate_test_report(map)
    allow(I18n).to receive(:t).and_call_original
    report = Storages::Peripherals::ConnectionValidators::ValidatorResult.new

    map.each_pair do |key, values|
      result = generate_test_group(key, values)
      report.add_group_result(key, result)
      allow(I18n).to receive(:t).with("storages.health.checks.#{key}.header").and_return(key.to_s.humanize)
    end

    report
  end
end
