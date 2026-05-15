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

RSpec.describe WorkPackageCustomField, :model do
  let(:feature) { create(:type_feature) }
  let(:task) { create(:type_task) }
  let(:project) { create(:project, types: [feature, task]) }
  let(:project_without_user) { create(:project, types: [feature, task]) }

  describe "scopes" do
    describe "manageable_by_user" do
      let!(:bool_cf) { create(:boolean_wp_custom_field) }
      let!(:text_cf) { create(:text_wp_custom_field) }
      let!(:hierarchy_cf) { create(:hierarchy_wp_custom_field) }

      before do
        project.work_package_custom_fields << text_cf
        feature.custom_fields << text_cf
        project_without_user.work_package_custom_fields << bool_cf
        task.custom_fields << bool_cf
        # hierarchy_cf is not enabled in any project
      end

      context "if user has permission to select custom fields" do
        let(:user) { create(:user, member_with_permissions: { project => [:select_custom_fields] }) }

        it "returns all custom fields" do
          expect(described_class.manageable_by_user(user)).to contain_exactly(bool_cf, text_cf, hierarchy_cf)
        end
      end

      context "if user does not have permission to select custom fields" do
        let(:user) { create(:user) }
        let(:role) { create(:project_role, permissions: []) }
        let(:project) { create(:project, members: { user => role }, types: [feature, task]) }

        it "returns only custom fields that are enabled in projects the user has access to" do
          expect(described_class.manageable_by_user(user)).to contain_exactly(text_cf)
        end
      end

      it "returns custom fields that are usable as custom action" do
        expect(described_class.usable_as_custom_action).to contain_exactly(bool_cf, text_cf)
      end
    end
  end

  describe "visible_by_user" do
    let(:user) { create(:user, member_with_permissions: { project => [] }) }

    it "returns an empty array" do
      expect(described_class.visible_by_user(user)).to be_empty
    end

    context "with custom fields and types added to the project" do
      # User cannot see this field as its type is not enabled in the project:
      let!(:text_cf) { create(:text_wp_custom_field, projects: [project, project_without_user], types: []) }
      # User cannot see this field as they are not a member:
      let!(:hierarchy_cf) { create(:hierarchy_wp_custom_field, projects: [project_without_user], types: [feature, task]) }
      # User can see this field:
      let!(:bool_cf) { create(:boolean_wp_custom_field, projects: [project], types: [feature]) }

      it "returns custom fields with types that are enabled in the project" do
        expect(described_class.visible_by_user(user)).to contain_exactly(bool_cf)
      end
    end
  end
end
