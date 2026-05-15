# frozen_string_literal: true

# -- copyright
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
# ++

module EnterpriseEdition
  # A full page banner for the enterprise edition
  class UpsellPageComponent < ApplicationComponent
    include OpPrimer::ComponentHelpers
    include PlanForFeature

    # @param feature_key [Symbol, NilClass] The key of the feature to show the upsell page for.
    # @param i18n_scope [String] Provide the i18n scope to look for title, description, and features.
    #                            Defaults to "ee.upsell.{feature_key}"
    # @param image [String, NilClass] Path to the image to show on the upsell page, or nil.
    # @param video [String, NilClass] Path to the video to show on the upsell page, or nil.
    def initialize(feature_key, i18n_scope: "ee.upsell.#{feature_key}", image: nil, video: nil)
      super

      self.feature_key = feature_key
      self.i18n_scope = i18n_scope
      @image = image
      @video = video
    end

    def more_info_text
      I18n.t(:more_info, scope: i18n_scope, default: nil)
    end

    private

    def render?
      !EnterpriseToken.hide_banners?
    end
  end
end
