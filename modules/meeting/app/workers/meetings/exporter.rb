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

module Meetings
  class Exporter < ::Exports::Exporter
    include WorkPackage::PDFExport::Common::Common
    include WorkPackage::PDFExport::Common::Logo
    include WorkPackage::PDFExport::Export::Page
    include WorkPackage::PDFExport::Export::Cover
    include WorkPackage::PDFExport::Export::Markdown
    include WorkPackage::PDFExport::Common::Attachments
    include WorkPackage::PDFExport::Common::Badge
    include WorkPackage::PDFExport::Common::Macro
    include WorkPackage::PDFExport::Export::Meetings::Styles
    include Meetings::PDF::PageHead
    include Meetings::PDF::Participants
    include Meetings::PDF::Agenda
    include Meetings::PDF::Attachments

    attr_accessor :pdf

    self.model = Meeting

    alias :meeting :object

    def self.key
      :pdf
    end

    def initialize(meeting, options = {})
      super(meeting, options[:options] || options)
      @total_page_nr = nil
      @page_count = 0

      setup_page!
    end

    def setup_page!
      self.pdf = get_pdf
      pdf.title = heading
      configure_page_size!(:portrait)
    end

    def export!
      render_doc
      success(pdf.render)
    rescue StandardError => e
      Rails.logger.error "Failed to generate PDF export:  #{e.message}:\n#{e.backtrace.join("\n")}"
      error(I18n.t(:error_pdf_failed_to_export, error: e.message))
    end

    def render_doc
      write_cover_page! if with_cover?
      render_meeting!
    end

    def render_meeting!
      write_page_head
      write_participants if with_participants?
      write_agenda
      write_attachments_list if with_attachments_list?
      write_backlog if with_backlog?
      write_headers!
      write_footers!
    end

    def write_heading(text)
      pdf.formatted_text([styles.heading.merge({ text: })])
      pdf.move_down(10)
    end

    def write_hr
      hr_style = styles.heading_hr
      with_vertical_margin(styles.heading_hr_margins) do
        write_horizontal_line(pdf.cursor, hr_style[:height], hr_style[:color])
      end
    end

    def cover_page_title
      project_title
    end

    def cover_page_heading
      meeting.title
    end

    def cover_page_dates
      [
        "#{meeting_mode},",
        "#{format_date(meeting.start_time)},",
        format_time(meeting.start_time, include_date: false),
        "–",
        format_time(meeting.end_time, include_date: false)
      ].join(" ")
    end

    def meeting_mode
      meeting.state == "open" ? I18n.t("label_meeting_agenda") : I18n.t("label_meeting_minutes")
    end

    def cover_page_subheading
      meeting.location
    end

    def heading
      meeting.title
    end

    def project_title
      meeting.project&.name || ""
    end

    def footer_title
      options[:footer_text_right] || project_title
    end

    def title_datetime
      meeting.start_time.strftime("%Y-%m-%d")
    end

    def title
      build_pdf_filename(meeting.title)
    end

    def with_participants?
      ActiveModel::Type::Boolean.new.cast(options[:participants])
    end

    def with_attachments_list?
      ActiveModel::Type::Boolean.new.cast(options[:attachments])
    end

    def with_backlog?
      ActiveModel::Type::Boolean.new.cast(options[:backlog])
    end

    def with_outcomes?
      ActiveModel::Type::Boolean.new.cast(options[:outcomes])
    end

    def with_cover?
      true
    end

    def with_images?
      true
    end
  end
end
