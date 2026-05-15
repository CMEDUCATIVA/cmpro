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

module WorkPackages
  module ActivitiesTab
    module CommentAttachmentsClaims
      class SetAttributesService < ::BaseServices::SetAttributes
        include ::Attachments::SetReplacements

        ATTACHMENT_CSS_SELECTOR = "img.op-uc-image"

        def perform(params = {})
          super(
            params.reverse_merge(
              attachment_ids: collect_attachment_ids_from_notes
            )
          )
        end

        private

        def collect_attachment_ids_from_notes
          return [] if model.notes.blank?

          parser.css(ATTACHMENT_CSS_SELECTOR).filter_map do |img|
            src = img["src"]
            next if src.blank?

            # Extract the attachment ID from the src URL
            # Example: "/api/v3/attachments/30381/content" -> "30381"
            match = src.match(%r{/attachments/(\d+)/content})
            match[1] if match
          end
        end

        def parser
          @parser ||= Nokogiri::HTML.fragment(model.notes)
        end
      end
    end
  end
end
