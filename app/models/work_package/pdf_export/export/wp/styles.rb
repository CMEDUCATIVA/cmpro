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

module WorkPackage::PDFExport::Export::Wp::Styles
  class PDFStyles
    include MarkdownToPDF::Common
    include MarkdownToPDF::StyleHelper
    include WorkPackage::PDFExport::Common::Styles
    include WorkPackage::PDFExport::Common::StylesPage
    include WorkPackage::PDFExport::Common::StylesMarkdown
    include WorkPackage::PDFExport::Common::StylesWpTable
    include WorkPackage::PDFExport::Common::StylesAttributesTable

    def wp_margins
      resolve_margin(@styles[:work_package])
    end

    def wp_subject(level)
      resolve_font(@styles.dig(:work_package, :subject)).merge(
        resolve_font(@styles.dig(:work_package, :"subject_level_#{level}"))
      )
    end

    def wp_detail_subject_margins
      resolve_margin(@styles.dig(:work_package, :subject))
    end

    def inline_error
      resolve_font(@styles[:inline_error])
    end

    def inline_hint
      resolve_font(@styles[:inline_hint])
    end
  end

  def styles
    @styles ||= PDFStyles.new(styles_asset_path)
  end

  private

  def styles_asset_path
    File.dirname(File.expand_path(__FILE__))
  end
end
