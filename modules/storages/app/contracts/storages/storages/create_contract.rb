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

module Storages::Storages
  class CreateContract < ::Storages::Storages::BaseContract
    attribute :creator
    validate :creator_must_be_user
    validate :require_ee_token_for_one_drive

    private

    def creator_must_be_user
      unless creator == user
        errors.add(:creator, :invalid)
      end
    end

    def require_ee_token_for_one_drive
      if ::Storages::Storage.one_drive_without_ee_token?(provider_type)
        errors.add(:base, I18n.t("api_v3.errors.code_500_missing_enterprise_token"))
      end
    end
  end
end
