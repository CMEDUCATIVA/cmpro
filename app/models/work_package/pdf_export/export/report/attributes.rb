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

module WorkPackage::PDFExport::Export::Report::Attributes
  def write_attributes_tables!(work_package)
    rows = attribute_table_rows(work_package)
    return if rows.empty?

    with_margin(styles.wp_attributes_table_margins) do
      pdf.table(
        rows,
        column_widths: attributes_table_column_widths,
        cell_style: styles.wp_attributes_table_cell.merge({ inline_format: true })
      )
    end
  end

  private

  def attributes_table_column_widths
    # calculate fixed work package attribute table columns width
    widths = [1.5, 2.0, 1.5, 2.0] # label | value | label | value
    ratio = pdf.bounds.width / widths.sum
    widths.map { |w| w * ratio }
  end

  def attribute_table_rows(work_package)
    list = attribute_data_list(work_package)
    0.step(list.length - 1, 2).map do |i|
      build_columns_table_cells(list[i]) +
        build_columns_table_cells(list[i + 1])
    end
  end

  def attribute_data_list(work_package)
    attributes_data_by_columns
      .map { |entry| entry.merge({ value: get_column_value_cell(work_package, entry[:name]) }) }
  end

  def attributes_data_by_columns
    column_objects
      .reject { |column| column.name == :subject }
      .map do |column|
      { label: column.caption || "", name: column.name }
    end
  end

  def build_columns_table_cells(attribute_data)
    return ["", ""] if attribute_data.nil?

    # get work package attribute table cell data: [label, value]
    [
      pdf.make_cell(attribute_data[:label], styles.wp_attributes_table_label_cell),
      attribute_data[:value]
    ]
  end
end
