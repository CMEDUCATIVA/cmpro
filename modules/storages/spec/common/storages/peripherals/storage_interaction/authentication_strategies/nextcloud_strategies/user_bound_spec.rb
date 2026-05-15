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

RSpec.describe Storages::Peripherals::StorageInteraction::AuthenticationStrategies::NextcloudStrategies::UserBound do
  context "if user is provisioned by an IDP" do
    let(:provider) { create(:oidc_provider) }
    let(:user) { create(:user, authentication_provider: provider) }

    context "if file storage is configured for sso only" do
      let(:storage) { create(:nextcloud_storage, :oidc_sso_enabled) }

      it "must use an SsoUserToken strategy" do
        strategy = described_class.call(user:, storage:)
        expect(strategy.key).to eq(:sso_user_token)
      end
    end

    context "if file storage is configured for sso and oauth" do
      let(:storage) { create(:nextcloud_storage_configured, :oidc_sso_with_fallback) }

      it "must use an SsoUserToken strategy" do
        strategy = described_class.call(user:, storage:)
        expect(strategy.key).to eq(:sso_user_token)
      end
    end

    context "if file storage is configured for oauth only" do
      let(:storage) { create(:nextcloud_storage_configured) }

      it "must use an OAuthUserToken strategy" do
        strategy = described_class.call(user:, storage:)
        expect(strategy.key).to eq(:oauth_user_token)
      end
    end
  end

  context "if user is local" do
    let(:user) { create(:user) }

    context "if file storage is configured for sso only" do
      let(:storage) { create(:nextcloud_storage, :oidc_sso_enabled) }

      it "must return the failure strategy" do
        strategy = described_class.call(user:, storage:)
        expect(strategy.key).to eq(:failure)
      end
    end

    context "if file storage is configured for sso and oauth" do
      let(:storage) { create(:nextcloud_storage_configured, :oidc_sso_with_fallback) }

      it "must use an OAuthUserToken strategy" do
        strategy = described_class.call(user:, storage:)
        expect(strategy.key).to eq(:oauth_user_token)
      end
    end

    context "if file storage is configured for oauth only" do
      let(:storage) { create(:nextcloud_storage_configured) }

      it "must use an OAuthUserToken strategy" do
        strategy = described_class.call(user:, storage:)
        expect(strategy.key).to eq(:oauth_user_token)
      end
    end

    context "if file storage is configured for oauth only, but client and app not fully configured" do
      let(:storage) { create(:nextcloud_storage) }

      it "returns the configured strategy" do
        strategy = described_class.call(user:, storage:)
        expect(strategy.key).to eq(:oauth_user_token)
      end
    end
  end
end
