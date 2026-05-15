# frozen_string_literal: true

require "securerandom"

module Costos
  module Ifc
    module IfcModelPatch
      def ensure_public_share_token!
        return public_share_token if public_share_token.present?

        token = SecureRandom.urlsafe_base64(32)
        update!(public_share_token: token)
        token
      end

      def enable_public_share!
        ensure_public_share_token!
        return if public_share_enabled?

        update!(public_share_enabled: true)
      end

      def disable_public_share!
        update!(public_share_enabled: false)
      end

      def public_share_active?
        public_share_enabled? && public_share_token.present?
      end
    end
  end
end
