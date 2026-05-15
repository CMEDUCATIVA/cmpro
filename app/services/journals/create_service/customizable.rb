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

class Journals::CreateService
  class Customizable < Association
    def associated?
      journable.respond_to?(:customizable?)
    end

    def cleanup_predecessor(predecessor)
      cleanup_predecessor_for(predecessor,
                              "customizable_journals",
                              :journal_id,
                              :id)
    end

    def insert_sql
      sanitize(<<~SQL.squish, journable_id:, journable_class_name:)
        INSERT INTO
          customizable_journals (
            journal_id,
            custom_field_id,
            value
          )
        SELECT
          #{id_from_inserted_journal_sql},
          custom_values.custom_field_id,
          #{normalize_newlines_sql('custom_values.value')}
        FROM custom_values
        WHERE
          #{only_if_created_sql}
          AND custom_values.customized_id = :journable_id
          AND custom_values.customized_type = :journable_class_name
          AND custom_values.value IS NOT NULL
          AND custom_values.value != ''
      SQL
    end

    def changes_sql
      sanitize(<<~SQL.squish, journable_id:, customized_type: journable_class_name)
        SELECT
          max_journals.journable_id
        FROM
          max_journals
        LEFT OUTER JOIN
          customizable_journals
        ON
          customizable_journals.journal_id = max_journals.id
        FULL JOIN
          (SELECT *
           FROM custom_values
           WHERE custom_values.customized_id = :journable_id AND custom_values.customized_type = :customized_type) custom_values
        ON
          custom_values.custom_field_id = customizable_journals.custom_field_id
        WHERE
          (custom_values.value IS NULL AND customizable_journals.value IS NOT NULL)
          OR (customizable_journals.value IS NULL AND custom_values.value IS NOT NULL AND custom_values.value != '')
          OR (#{normalize_newlines_sql('customizable_journals.value')} !=
              #{normalize_newlines_sql('custom_values.value')})
      SQL
    end
  end
end
