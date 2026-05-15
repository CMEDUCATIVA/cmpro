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

module Storages
  module Admin
    module Health
      class CheckResultComponent < ApplicationComponent
        include OpPrimer::ComponentHelpers

        def initialize(group:, result:)
          super(result)
          @group = group
        end

        private

        def data
          @data ||= {
            text: model.humanize_title(@group),
            status_color:,
            status_text:,
            error_code:,
            error_text: model.humanize_error_message,
            docs_href: ::OpenProject::Static::Links.url_for(:storage_docs, :health_status)
          }
        end

        def error_code
          if model.failure?
            "ERR_#{model.code.upcase}"
          elsif model.warning?
            "WRN_#{model.code.upcase}"
          end
        end

        def status_color
          if model.success?
            :success
          elsif model.failure?
            :danger
          elsif model.warning? || model.skipped?
            :attention
          else
            raise ArgumentError, "invalid check result state"
          end
        end

        def status_text
          if model.success?
            I18n.t("storages.health.label_passed")
          elsif model.failure?
            I18n.t("storages.health.label_failed")
          elsif model.warning?
            I18n.t("storages.health.label_warning")
          elsif model.skipped?
            I18n.t("storages.health.label_skipped")
          else
            raise ArgumentError, "invalid check result state"
          end
        end
      end
    end
  end
end
