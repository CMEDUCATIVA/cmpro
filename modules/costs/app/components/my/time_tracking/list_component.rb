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

module My
  module TimeTracking
    class ListComponent < ApplicationComponent
      include OpTurbo::Streamable
      include OpPrimer::ComponentHelpers

      options time_entries: [],
              mode: :week,
              date: Date.current

      private

      def wrapper_data
        {
          "controller" => "my--time-tracking",
          "application-target" => "dynamic",
          "my--time-tracking-mode-value" => mode,
          "my--time-tracking-view-mode-value" => "list"
        }
      end

      def range
        case mode
        when :day then [date]
        when :week then date.all_week(week_start_day)
        when :workweek then workweek_days
        when :month then month_days
        end
      end

      def grouped_time_entries
        @grouped_time_entries ||= time_entries
          .group_by { |entry| mode == :month ? entry.spent_on.beginning_of_week(week_start_day) : entry.spent_on }
          .tap do |hash|
            hash.default_proc = ->(h, k) { h[k] = [] }
          end
      end

      def date_title(date)
        if mode == :month
          I18n.t(:label_specific_week, week: week_number(date))
        else
          I18n.l(date, format: "%A %d")
        end
      end

      def workweek_days
        workdays_normalized = Setting.working_days.map { |day| day % 7 }.sort
        date.all_week(week_start_day).select { |d| workdays_normalized.include?(d.wday) }
      end

      def month_days
        date.all_month.map(&:beginning_of_week).uniq
      end

      def week_number(date)
        if Setting.start_of_week == 1 # monday
          I18n.l(date, format: "%W")
        else # 6 saturday, 7 sunday
          I18n.l(date, format: "%U")
        end
      end

      def week_start_day
        case Setting.start_of_week
        when 6 then :saturday
        when 7 then :sunday
        else :monday
        end
      end

      def collapsed?(date)
        return false if mode == :day

        date.past?
      end

      def date_caption(date)
        if mode == :month
          if Date.current.beginning_of_week(week_start_day) == date
            t(:label_this_week)
          elsif 1.week.ago.beginning_of_week(week_start_day) == date
            t(:label_last_week)
          end
        elsif date.today?
          t(:label_today)
        elsif date.yesterday?
          t(:label_yesterday)
        end
      end
    end
  end
end
