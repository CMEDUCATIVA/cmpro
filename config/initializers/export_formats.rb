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

Rails.application.configure do |application|
  application.config.to_prepare do
    Exports::Register.register do
      list WorkPackage, WorkPackage::Exports::CSV
      list WorkPackage, WorkPackage::PDFExport::WorkPackageListToPdf

      single WorkPackage, WorkPackage::PDFExport::WorkPackageToPdf

      formatter WorkPackage, Exports::Formatters::CustomField
      formatter WorkPackage, Exports::Formatters::CustomFieldPdf
      formatter WorkPackage, WorkPackage::Exports::Formatters::CompoundDoneRatio
      formatter WorkPackage, WorkPackage::Exports::Formatters::CompoundHours
      formatter WorkPackage, WorkPackage::Exports::Formatters::Costs
      formatter WorkPackage, WorkPackage::Exports::Formatters::Currency
      formatter WorkPackage, WorkPackage::Exports::Formatters::Date
      formatter WorkPackage, WorkPackage::Exports::Formatters::Days
      formatter WorkPackage, WorkPackage::Exports::Formatters::DoneRatio
      formatter WorkPackage, WorkPackage::Exports::Formatters::Hours
      formatter WorkPackage, WorkPackage::Exports::Formatters::ProjectPhase
      formatter WorkPackage, WorkPackage::Exports::Formatters::SpentUnits

      list Project, Projects::Exports::CSV
      formatter Project, Exports::Formatters::CustomField
      formatter Project, Exports::Formatters::CustomFieldPdf
      formatter Project, Projects::Exports::Formatters::Status
      formatter Project, Projects::Exports::Formatters::Description
      formatter Project, Projects::Exports::Formatters::Public
      formatter Project, Projects::Exports::Formatters::Active
    end
  end
end
