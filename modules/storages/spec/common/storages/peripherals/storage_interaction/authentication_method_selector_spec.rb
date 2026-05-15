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

RSpec.describe Storages::Peripherals::StorageInteraction::AuthenticationMethodSelector do
  subject { described_class.new(storage:, user:) }

  context "if user is provisioned by an IDP" do
    let(:provider) { create(:oidc_provider) }
    let(:user) { create(:user, authentication_provider: provider) }

    context "if file storage is configured for sso only" do
      let(:storage) { create(:nextcloud_storage, :oidc_sso_enabled) }

      it { is_expected.to be_sso }
      it { is_expected.not_to be_storage_oauth }

      it "indicates an authentication method of :sso" do
        expect(subject.authentication_method).to eq(:sso)
      end
    end

    context "if file storage is configured for sso and oauth" do
      let(:storage) { create(:nextcloud_storage_configured, :oidc_sso_with_fallback) }

      it { is_expected.to be_sso }
      it { is_expected.not_to be_storage_oauth }

      it "indicates an authentication method of :sso" do
        expect(subject.authentication_method).to eq(:sso)
      end
    end

    context "if file storage is configured for oauth only" do
      let(:storage) { create(:nextcloud_storage_configured) }

      it { is_expected.not_to be_sso }
      it { is_expected.to be_storage_oauth }

      it "indicates an authentication method of :storage_oauth" do
        expect(subject.authentication_method).to eq(:storage_oauth)
      end
    end
  end

  context "if user is local" do
    let(:user) { create(:user) }

    context "if file storage is configured for sso only" do
      let(:storage) { create(:nextcloud_storage, :oidc_sso_enabled) }

      it { is_expected.not_to be_sso }
      it { is_expected.not_to be_storage_oauth }

      it "indicates an authentication method of :sso" do
        expect(subject.authentication_method).to be_nil
      end
    end

    context "if file storage is configured for sso and oauth" do
      let(:storage) { create(:nextcloud_storage_configured, :oidc_sso_with_fallback) }

      it { is_expected.not_to be_sso }
      it { is_expected.to be_storage_oauth }

      it "indicates an authentication method of :storage_oauth" do
        expect(subject.authentication_method).to eq(:storage_oauth)
      end
    end

    context "if file storage is configured for oauth only" do
      let(:storage) { create(:nextcloud_storage_configured) }

      it { is_expected.not_to be_sso }
      it { is_expected.to be_storage_oauth }

      it "indicates an authentication method of :storage_oauth" do
        expect(subject.authentication_method).to eq(:storage_oauth)
      end
    end

    context "if file storage is configured for oauth only, but client and app not fully configured" do
      let(:storage) { create(:nextcloud_storage) }

      it { is_expected.not_to be_sso }
      it { is_expected.to be_storage_oauth }

      it "indicates an authentication method of :storage_oauth" do
        expect(subject.authentication_method).to eq(:storage_oauth)
      end
    end
  end
end
