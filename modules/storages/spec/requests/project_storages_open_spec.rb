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

RSpec.describe "projects/:project_id/project_storages/:id/open" do
  subject(:request) do
    get path, {}, { "HTTP_ACCEPT" => "text/html" }
  end

  current_user { create(:user, member_with_permissions: { project => permissions }) }
  let(:permissions) { %i[view_file_links read_files] }
  let(:project_storage) { create(:project_storage, storage:, project_folder_id: "123", project_folder_mode:) }
  let(:project) { project_storage.project }
  let(:storage) { create(:nextcloud_storage_configured) }
  let(:project_folder_mode) { "automatic" }
  let(:authorization_state) { :connected }
  let(:path) { "projects/#{project.identifier}/project_storages/#{project_storage.id}/open" }
  let(:auth_method_selector) do
    instance_double(
      Storages::Peripherals::StorageInteraction::AuthenticationMethodSelector,
      storage_oauth?: authentication_method != :sso,
      sso?: authentication_method == :sso,
      authentication_method:
    )
  end
  let(:authentication_method) { :storage_oauth }
  let(:folder_create_service) { class_double(Storages::NextcloudManagedFolderCreateService) }
  let(:folder_permissions_service) { class_double(Storages::NextcloudManagedFolderPermissionsService) }
  let(:file_info_result) { ServiceResult.success }

  before do
    Storages::Peripherals::Registry.stub("nextcloud.queries.file_info", ->(_) { file_info_result })
    Storages::Peripherals::Registry.stub("nextcloud.services.folder_create", folder_create_service)
    Storages::Peripherals::Registry.stub("nextcloud.services.folder_permissions", folder_permissions_service)
    allow(Storages::Peripherals::StorageInteraction::Authentication).to receive(:authorization_state)
      .and_return(authorization_state)
    allow(Storages::Peripherals::StorageInteraction::AuthenticationMethodSelector).to receive(:new)
      .and_return(auth_method_selector)
  end

  it "redirects to the project folder in the storage" do
    request
    expect(last_response).to have_http_status(:found)
    expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/f/123?openfile=1")
  end

  context "when the user has no access to file links configured" do
    let(:permissions) { %i[] }

    it "prevents access" do
      request
      expect(last_response).to have_http_status(:forbidden)
    end
  end

  context "when the user has no access to files configured" do
    let(:permissions) { %i[view_file_links] }

    it "redirects to the storage's file root" do
      request
      expect(last_response).to have_http_status(:found)
      expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/apps/files")
    end
  end

  context "when the project folder is inactive" do
    let(:project_folder_mode) { "inactive" }

    it "redirects to the storage's file root" do
      request
      expect(last_response).to have_http_status(:found)
      expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/apps/files")
    end
  end

  context "when an error occurs in determining the target location" do
    before do
      Storages::Peripherals::Registry.stub("nextcloud.queries.open_file_link", ->(_) do
        ServiceResult.failure(
          errors: Storages::StorageError.new(code: 400, log_message: "Request made outside opening hours.")
        )
      end)
    end

    it "renders an error message", :aggregate_failures do
      request
      expect(last_response).to have_http_status(:found)
      expect(last_response.headers["Location"]).to eq("http://test.host/projects/#{project.id}")

      flash = Sessions::UserSession.last.data.dig("flash", "flashes")
      expect(flash["error"]).to eq("400 | Request made outside opening hours.")
    end
  end

  context "when the user has no remote identity yet" do
    let(:authorization_state) { :not_connected }

    context "and the user authenticates through OAuth 2.0 at the storage" do
      it "ensures creation of a remote identity" do
        request
        destination = CGI.escape("http://test.host/#{path}")
        expect(last_response).to have_http_status(:found)
        expect(last_response.headers["Location"]).to eq(
          "http://test.host/oauth_clients/#{storage.oauth_client.client_id}/ensure_connection?" \
          "destination_url=#{destination}&storage_id=#{storage.id}"
        )
      end
    end

    context "and the user authenticates through a common SSO IDP" do
      let(:authentication_method) { :sso }

      it "redirects to the project folder in the storage" do
        request
        expect(last_response).to have_http_status(:found)
        expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/f/123?openfile=1")
      end
    end
  end

  context "when we can't determine the user's remote identity" do
    let(:authorization_state) { :error }

    context "and the user authenticates through OAuth 2.0 at the storage" do
      it "renders an error message", :aggregate_failures do
        request

        expect(last_response).to have_http_status(:found)
        expect(last_response.headers["Location"]).to eq("http://test.host/projects/#{project.id}")
        flash = Sessions::UserSession.last.data.dig("flash", "flashes")
        expect(flash["error"]).to be_present
      end
    end

    context "and the user authenticates through a common SSO IDP" do
      let(:authentication_method) { :sso }

      it "redirects to the project folder in the storage (the check is never performed)" do
        request
        expect(last_response).to have_http_status(:found)
        expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/f/123?openfile=1")
      end
    end
  end

  context "when project folders are not managed automatically" do
    let(:project_folder_mode) { "manual" }

    it "redirects to the project folder in the storage" do
      request
      expect(last_response).to have_http_status(:found)
      expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/f/123?openfile=1")
    end
  end

  context "when the project folder has not been created yet" do
    let(:project_storage) { create(:project_storage, storage:, project_folder_id: "", project_folder_mode:) }

    before do
      allow(folder_create_service).to receive(:call) do
        project_storage.update!(project_folder_id: "456")
        ServiceResult.success
      end
    end

    it "creates the project folder in the storage" do
      request
      expect(folder_create_service).to have_received(:call)
    end

    it "redirects to the project folder in the storage" do
      request
      expect(last_response).to have_http_status(:found)
      expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/f/456?openfile=1")
    end

    context "and when creation of the folder fails" do
      before do
        allow(folder_create_service).to receive(:call).and_return(
          ServiceResult.failure(errors: instance_double(ActiveModel::Errors, full_messages: ["Nope, sorry!"]))
        )
      end

      it "renders an error message", :aggregate_failures do
        request
        expect(last_response).to have_http_status(:found)
        expect(last_response.headers["Location"]).to eq("http://test.host/projects/#{project.id}")

        flash = Sessions::UserSession.last.data.dig("flash", "flashes")
        expect(flash["error"]).to eq(["Nope, sorry!"])
      end
    end

    context "and when project folders are not managed automatically" do
      let(:project_folder_mode) { "manual" }

      it "does not try to create the folder" do
        request
        expect(folder_create_service).not_to have_received(:call)
      end

      it "redirects to the storage's file root" do
        request
        expect(last_response).to have_http_status(:found)
        expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/apps/files")
      end
    end
  end

  context "when the user has no permission to access the project folder in the storage" do
    let(:file_info_result) { ServiceResult.failure(errors: instance_double(Storages::StorageError, code: :forbidden)) }

    before do
      allow(folder_permissions_service).to receive(:call).and_return(ServiceResult.success)
    end

    it "updates the user's permissions on the remote folder" do
      request
      expect(folder_permissions_service).to have_received(:call)
    end

    it "redirects to the project folder in the storage" do
      request
      expect(last_response).to have_http_status(:found)
      expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/f/123?openfile=1")
    end

    context "and when project folders are not managed automatically" do
      let(:project_folder_mode) { "manual" }

      it "does not try to update the permissions" do
        request
        expect(folder_permissions_service).not_to have_received(:call)
      end

      it "redirects to the project folder in the storage (leaving final authorization to the storage)" do
        request
        expect(last_response).to have_http_status(:found)
        expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/f/123?openfile=1")
      end
    end

    context "and when the user should not have permissions to read the folder" do
      let(:permissions) { %i[view_file_links] }

      # TODO: or should we avoid doing that?
      it "tries updating the user's permissions on the remote folder (ineffectively)" do
        request
        expect(folder_permissions_service).to have_received(:call)
      end

      it "redirects to the storage's file root" do
        request
        expect(last_response).to have_http_status(:found)
        expect(last_response.headers["Location"]).to eq("#{storage.host}index.php/apps/files")
      end
    end
  end
end
