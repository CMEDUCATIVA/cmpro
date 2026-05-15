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

RSpec.describe(Storages::Peripherals::StorageInteraction::Nextcloud::Util) do
  describe ".origin_user_id" do
    it "responds with appropriate origin_user_id when user has two remote identities" \
       "for one integration within two different auth_sources" do
      oauth_client = create(:oauth_client)
      oidc_provider = create(:oidc_provider)
      integration = create(:nextcloud_storage, oauth_client:)
      user = create(:user, authentication_provider: oidc_provider)
      create(:remote_identity, user:, auth_source: oauth_client, integration:, origin_user_id: "456")
      create(:remote_identity, user:, auth_source: oidc_provider, integration:, origin_user_id: "123")
      sso_strategy = Storages::Peripherals::StorageInteraction::AuthenticationStrategies::SsoUserToken
                       .strategy
                       .with_user(user)
      oauth_strategy = Storages::Peripherals::StorageInteraction::AuthenticationStrategies::OAuthUserToken
                         .strategy
                         .with_user(user)

      expect(described_class.origin_user_id(caller: self.class, storage: integration,
                                            auth_strategy: sso_strategy).result).to eq("123")
      expect(described_class.origin_user_id(caller: self.class, storage: integration,
                                            auth_strategy: oauth_strategy).result).to eq("456")
    end
  end
end
