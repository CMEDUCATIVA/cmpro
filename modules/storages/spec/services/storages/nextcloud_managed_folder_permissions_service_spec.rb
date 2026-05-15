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

RSpec.describe Storages::NextcloudManagedFolderPermissionsService, :webmock do
  describe "#call" do
    subject(:service_call) { described_class.call(storage:) }

    let(:storage) { create(:nextcloud_storage_with_complete_configuration, :as_automatically_managed) }
    let(:project) { create(:project, members: { project_user => role, user_without_remote_identity => role }) }
    let(:role) { create(:project_role, permissions: %i[read_files]) }
    let(:non_member_permissions) { %i[read_files view_work_packages] }

    # rubocop:disable RSpec/VerifiedDoubles
    let(:set_permissions_service) { double(call: ServiceResult.success) }
    let(:add_user_to_group_service) { double(call: ServiceResult.success) }
    let(:remove_user_from_group_service) { double(call: ServiceResult.success) }
    let(:group_users_service) { double(call: ServiceResult.success(result: ["unrelated-remote-identity"])) }
    let(:auth_strategy) { Object.new }
    # rubocop:enable RSpec/VerifiedDoubles

    let!(:project_storage) { create(:project_storage, :as_automatically_managed, project:, storage:, project_folder_id: "123") }
    let!(:non_project_user) { create(:user) }
    let!(:project_user) { create(:user) }
    let!(:user_without_remote_identity) { create(:user) }
    let!(:admin_user) { create(:admin) }
    let!(:non_project_remote_identity) { create(:remote_identity, integration: storage, user: non_project_user) }
    let!(:project_remote_identity) { create(:remote_identity, integration: storage, user: project_user) }
    let!(:admin_remote_identity) { create(:remote_identity, integration: storage, user: admin_user) }

    before do
      ProjectRole.non_member.update!(permissions: non_member_permissions)

      allow(Storages::Peripherals::Registry).to receive(:resolve)
        .with("nextcloud.commands.set_permissions")
        .and_return(set_permissions_service)
      allow(Storages::Peripherals::Registry).to receive(:resolve)
        .with("nextcloud.commands.add_user_to_group")
        .and_return(add_user_to_group_service)
      allow(Storages::Peripherals::Registry).to receive(:resolve)
        .with("nextcloud.commands.remove_user_from_group")
        .and_return(remove_user_from_group_service)
      allow(Storages::Peripherals::Registry).to receive(:resolve)
        .with("nextcloud.queries.group_users")
        .and_return(group_users_service)
      allow(Storages::Peripherals::Registry).to receive(:resolve)
        .with("nextcloud.authentication.userless")
        .and_return(-> { auth_strategy })
    end

    it { is_expected.to be_success }

    it "has no errors" do
      expect(service_call.errors).to be_empty
    end

    it "adds users with a remote identity to the remote group", :aggregate_failures do
      service_call

      expect(add_user_to_group_service).to have_received(:call).exactly(3).times
      expect(add_user_to_group_service).to have_received(:call)
        .with(storage:, auth_strategy:, group: storage.group, user: project_remote_identity.origin_user_id)
      expect(add_user_to_group_service).to have_received(:call)
        .with(storage:, auth_strategy:, group: storage.group, user: admin_remote_identity.origin_user_id)
      expect(add_user_to_group_service).to have_received(:call)
        .with(storage:, auth_strategy:, group: storage.group, user: non_project_remote_identity.origin_user_id)
    end

    it "removes the unrelated user from the remote group" do
      service_call

      expect(remove_user_from_group_service).to have_received(:call)
        .with(storage:, auth_strategy:, group: storage.group, user: "unrelated-remote-identity")
    end

    it "grants permissions to project users" do
      service_call

      expect(set_permissions_service).to have_received(:call).once
      expect(set_permissions_service).to have_received(:call).with(
        storage:,
        auth_strategy:,
        input_data: having_attributes(
          file_id: "123", user_permissions: array_including(
            { user_id: project_remote_identity.origin_user_id, permissions: [:read_files] }
          )
        )
      )
    end

    it "grants permissions to admin users" do
      service_call

      expect(set_permissions_service).to have_received(:call).once
      expect(set_permissions_service).to have_received(:call).with(
        storage:,
        auth_strategy:,
        input_data: having_attributes(
          file_id: "123", user_permissions: array_including(
            {
              user_id: admin_remote_identity.origin_user_id,
              permissions: %i[read_files write_files create_files delete_files share_files]
            }
          )
        )
      )
    end

    it "grants permissions to the system-level OpenProject user" do
      service_call

      expect(set_permissions_service).to have_received(:call).once
      expect(set_permissions_service).to have_received(:call).with(
        storage:,
        auth_strategy:,
        input_data: having_attributes(
          file_id: "123", user_permissions: array_including(
            { user_id: "OpenProject", permissions: %i[read_files write_files create_files delete_files share_files] }
          )
        )
      )
    end

    it "grants no permissions to non-project users" do
      service_call

      expect(set_permissions_service).to have_received(:call).once
      expect(set_permissions_service).not_to have_received(:call).with(
        storage:,
        auth_strategy:,
        input_data: having_attributes(
          file_id: "123", user_permissions: array_including(hash_including(user_id: non_project_remote_identity.origin_user_id))
        )
      )
    end

    context "when the project storage is not automatic" do
      let!(:project_storage) { create(:project_storage, project:, storage:, project_folder_mode: "manual") }

      it { is_expected.to be_success }

      it "has no errors" do
        expect(service_call.errors).to be_empty
      end

      it "updates the remote group regardless" do
        service_call

        expect(add_user_to_group_service).to have_received(:call).exactly(3).times
      end

      it "does not touch permissions" do
        service_call

        expect(set_permissions_service).not_to have_received(:call)
      end
    end

    context "when the project is public" do
      before do
        project.update!(public: true)
      end

      it "grants permissions to non-project users as well" do
        service_call

        expect(set_permissions_service).to have_received(:call).once
        expect(set_permissions_service).to have_received(:call).with(
          storage:,
          auth_strategy:,
          input_data: having_attributes(
            file_id: "123", user_permissions: array_including(
              { user_id: non_project_remote_identity.origin_user_id, permissions: [:read_files] }
            )
          )
        )
      end

      context "and when the non-member permissions don't include file access" do
        let(:non_member_permissions) { %i[view_work_packages] }

        it "grants no permissions to non-project users" do
          service_call

          expect(set_permissions_service).to have_received(:call).once
          expect(set_permissions_service).not_to have_received(:call).with(
            storage:,
            auth_strategy:,
            input_data: having_attributes(
              file_id: "123",
              user_permissions: array_including(hash_including(user_id: non_project_remote_identity.origin_user_id))
            )
          )
        end
      end
    end

    context "when the project storage's project is not active" do
      before do
        project.update!(active: false)
      end

      it { is_expected.to be_success }

      it "has no errors" do
        expect(service_call.errors).to be_empty
      end

      it "does not touch permissions" do
        service_call

        expect(set_permissions_service).not_to have_received(:call)
      end
    end

    context "when all users are part of the remote group" do
      let(:group_users_service) do
        double(call: ServiceResult.success(result: [ # rubocop:disable RSpec/VerifiedDoubles
                                             non_project_remote_identity.origin_user_id,
                                             project_remote_identity.origin_user_id,
                                             admin_remote_identity.origin_user_id
                                           ]))
      end

      it "does not change the remote group" do
        service_call

        expect(add_user_to_group_service).not_to have_received(:call)
        expect(remove_user_from_group_service).not_to have_received(:call)
      end
    end

    context "when admin was explicitly added to the project with a restricted role" do
      let(:project) { create(:project, members: { admin_user => role }) }

      it "grants the user admin-level permissions" do
        service_call

        expect(set_permissions_service).to have_received(:call).once
        expect(set_permissions_service).to have_received(:call).with(
          storage:,
          auth_strategy:,
          input_data: having_attributes(
            file_id: "123", user_permissions: array_including(
              {
                user_id: admin_remote_identity.origin_user_id,
                permissions: %i[read_files write_files create_files delete_files share_files]
              }
            )
          )
        )
      end
    end

    context "when project folder was not yet created" do
      let!(:project_storage) { create(:project_storage, :as_automatically_managed, project:, storage:, project_folder_id: "") }

      it "does not touch permissions" do
        service_call

        expect(set_permissions_service).not_to have_received(:call)
      end
    end

    context "when there are multiple project storages" do
      let!(:other_project_storage) { create(:project_storage, :as_automatically_managed, storage:, project_folder_id: "456") }
      let!(:manual_project_storage) do
        create(:project_storage, project_folder_mode: "manual", storage:, project_folder_id: "789")
      end

      it "sets permissions for all active, automatically managed project storages" do
        service_call

        expect(set_permissions_service).to have_received(:call).twice
        expect(set_permissions_service).to have_received(:call).with(
          storage:,
          auth_strategy:,
          input_data: having_attributes(file_id: "123")
        )
        expect(set_permissions_service).to have_received(:call).with(
          storage:,
          auth_strategy:,
          input_data: having_attributes(file_id: "456")
        )
      end

      context "and when a project storage scope is passed" do
        subject(:service_call) { described_class.call(storage:, project_storages_scope: project_storage_scope) }

        let(:project_storage_scope) { Storages::ProjectStorage.where(id: [project_storage.id, manual_project_storage.id]) }

        it "only works on project storages from the scope" do
          service_call

          expect(set_permissions_service).to have_received(:call).once
          expect(set_permissions_service).to have_received(:call).with(
            storage:,
            auth_strategy:,
            input_data: having_attributes(file_id: "123")
          )
        end

        it "does not work on inactive or non-automatically managed project storages within the scope" do
          service_call

          expect(set_permissions_service).not_to have_received(:call).with(
            storage:,
            auth_strategy:,
            input_data: having_attributes(file_id: "789")
          )
        end
      end
    end

    context "when project storages exist for other storages" do
      let!(:other_project_storage) { create(:project_storage, :as_automatically_managed, project_folder_id: "456") }

      it "only works on project storages for current storage" do
        service_call

        expect(set_permissions_service).to have_received(:call).once
        expect(set_permissions_service).to have_received(:call).with(
          storage:,
          auth_strategy:,
          input_data: having_attributes(file_id: "123")
        )
      end
    end

    context "when fetching users of remote group fails" do
      let(:group_users_service) { double(call: ServiceResult.failure(errors: Storages::StorageError.new(code: 418))) } # rubocop:disable RSpec/VerifiedDoubles

      it { is_expected.to be_failure }

      it "has errors" do
        expect(service_call.errors).to be_present
      end

      it "does not change users of remote group" do
        service_call

        expect(add_user_to_group_service).not_to have_received(:call)
        expect(remove_user_from_group_service).not_to have_received(:call)
      end

      it "updates permissions" do
        service_call

        expect(set_permissions_service).to have_received(:call)
      end
    end

    context "when adding users to remote group fails" do
      let(:add_user_to_group_service) { double(call: ServiceResult.failure(errors: Storages::StorageError.new(code: 418))) } # rubocop:disable RSpec/VerifiedDoubles

      it { is_expected.to be_success }

      it "has errors" do
        expect(service_call.errors).to be_present
      end

      it "attempts all changes to remote group" do
        service_call

        expect(add_user_to_group_service).to have_received(:call).at_least(:once)
        expect(remove_user_from_group_service).to have_received(:call).at_least(:once)
      end

      it "updates permissions" do
        service_call

        expect(set_permissions_service).to have_received(:call)
      end
    end

    context "when removing users from remote group fails" do
      let(:remove_user_from_group_service) { double(call: ServiceResult.failure(errors: Storages::StorageError.new(code: 418))) } # rubocop:disable RSpec/VerifiedDoubles

      it { is_expected.to be_success }

      it "has errors" do
        expect(service_call.errors).to be_present
      end

      it "attempts all changes to remote group" do
        service_call

        expect(add_user_to_group_service).to have_received(:call).at_least(:once)
        expect(remove_user_from_group_service).to have_received(:call).at_least(:once)
      end

      it "updates permissions" do
        service_call

        expect(set_permissions_service).to have_received(:call)
      end
    end

    context "when setting permissions fails" do
      let(:set_permissions_service) { double(call: ServiceResult.failure(errors: Storages::StorageError.new(code: 418))) } # rubocop:disable RSpec/VerifiedDoubles

      it { is_expected.to be_success }

      it "has errors" do
        expect(service_call.errors).to be_present
      end

      it "applies all changes to remote group" do
        service_call

        expect(add_user_to_group_service).to have_received(:call).at_least(:once)
        expect(remove_user_from_group_service).to have_received(:call).at_least(:once)
      end

      it "attempts to update permissions" do
        service_call

        expect(set_permissions_service).to have_received(:call)
      end
    end
  end
end
