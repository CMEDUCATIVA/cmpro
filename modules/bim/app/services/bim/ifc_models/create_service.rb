#-- copyright
# OpenProject is a project management system.
# Copyright (C) the OpenProject GmbH
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2017 Jean-Philippe Lang
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
# +

module Bim
  module IfcModels
    class CreateService < ::BaseServices::Create
      protected

      def after_perform(call)
        if call.success?
          deactivate_other_defaults(call.result)
          IfcConversionJob.perform_later(call.result)
        end

        call
      end

      def instance(_params)
        ::Bim::IfcModels::IfcModel.new
      end

      def deactivate_other_defaults(ifc_model)
        return unless ifc_model.is_default?

        ifc_model
          .project
          .ifc_models
          .where(is_default: true)
          .where.not(id: ifc_model.id)
          .update_all(is_default: false)
      end
    end
  end
end
