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

module OpenIDConnect
  class Provider < AuthProvider
    include HashBuilder

    has_many :remote_identities, as: :auth_source, dependent: :destroy

    OIDC_PROVIDERS = %w[google microsoft_entra custom].freeze
    DISCOVERABLE_STRING_ATTRIBUTES_MANDATORY = %i[authorization_endpoint
                                                  userinfo_endpoint
                                                  token_endpoint
                                                  issuer].freeze
    DISCOVERABLE_STRING_ATTRIBUTES_OPTIONAL = %i[end_session_endpoint jwks_uri].freeze
    DISCOVERABLE_STRING_ATTRIBUTES_ALL = DISCOVERABLE_STRING_ATTRIBUTES_MANDATORY + DISCOVERABLE_STRING_ATTRIBUTES_OPTIONAL

    MAPPABLE_ATTRIBUTES = %i[login email first_name last_name admin].freeze

    store_attribute :options, :oidc_provider, :string
    store_attribute :options, :metadata_url, :string
    store_attribute :options, :icon, :string

    DISCOVERABLE_STRING_ATTRIBUTES_ALL.each do |attribute|
      store_attribute :options, attribute, :string
    end

    MAPPABLE_ATTRIBUTES.each do |attribute|
      store_attribute :options, "mapping_#{attribute}", :string
    end

    store_attribute :options, :grant_types_supported, :json, default: ["authorization_code", "implicit"]

    store_attribute :options, :client_id, :string
    store_attribute :options, :client_secret, :string
    store_attribute :options, :post_logout_redirect_uri, :string
    store_attribute :options, :tenant, :string
    store_attribute :options, :host, :string
    store_attribute :options, :scheme, :string
    store_attribute :options, :port, :string

    store_attribute :options, :scope, :string, default: "openid email profile"
    store_attribute :options, :claims, :string
    store_attribute :options, :acr_values, :string

    # azure specific option
    store_attribute :options, :use_graph_api, :boolean

    def self.slug_fragment = "oidc"

    def human_type
      "OpenID Connect"
    end

    def seeded_from_env?
      (Setting.seed_oidc_provider || {}).key?(slug)
    end

    def advanced_details_configured?
      client_id.present? && client_secret.present?
    end

    def metadata_configured?
      return true if google? || entra_id?

      DISCOVERABLE_STRING_ATTRIBUTES_MANDATORY.all? do |mandatory_attribute|
        public_send(mandatory_attribute).present?
      end
    end

    def mapping_configured?
      MAPPABLE_ATTRIBUTES.any? do |mandatory_attribute|
        public_send(:"mapping_#{mandatory_attribute}").present?
      end
    end

    def google?
      oidc_provider == "google"
    end

    def entra_id?
      oidc_provider == "microsoft_entra"
    end

    def configured?
      display_name.present? && advanced_details_configured? && metadata_configured?
    end

    def token_exchange_capable?
      return false if grant_types_supported.blank?

      grant_types_supported.include?(OpenProject::OpenIDConnect::TOKEN_EXCHANGE_GRANT_TYPE)
    end

    def icon
      case oidc_provider
      when "google"
        "openid_connect/auth_provider-google.png"
      when "microsoft_entra"
        "openid_connect/auth_provider-azure.png"
      else
        super.presence || "openid_connect/auth_provider-custom.png"
      end
    end

    def scopes
      (scope || "").split
    end
  end
end
