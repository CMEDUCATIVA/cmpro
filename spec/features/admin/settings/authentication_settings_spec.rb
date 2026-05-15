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

require "spec_helper"

RSpec.describe "Authentication Settings" do
  shared_let(:admin) { create(:admin) }

  let(:registration_page) { Pages::Admin::Authentication::Registration.new }

  before do
    login_as(admin)
  end

  describe "self registration settings" do
    it "allows changing self registration options", :js do
      registration_page.visit!

      choose I18n.t(:setting_self_registration_disabled)
      registration_page.expect_hidden_unsupervised_self_registration_warning
      registration_page.save
      Setting.clear_cache
      expect(Setting::SelfRegistration.disabled?).to be(true)
      registration_page.expect_self_registration_selected(:disabled)
      registration_page.expect_hidden_unsupervised_self_registration_warning

      choose I18n.t(:setting_self_registration_activation_by_email)
      registration_page.expect_visible_unsupervised_self_registration_warning
      registration_page.save
      Setting.clear_cache
      expect(Setting::SelfRegistration.by_email?).to be(true)
      registration_page.expect_self_registration_selected(:activation_by_email)
      registration_page.expect_visible_unsupervised_self_registration_warning

      choose I18n.t(:setting_self_registration_manual_activation)
      registration_page.expect_hidden_unsupervised_self_registration_warning
      registration_page.save
      Setting.clear_cache
      expect(Setting::SelfRegistration.manual?).to be(true)
      registration_page.expect_self_registration_selected(:manual_activation)
      registration_page.expect_hidden_unsupervised_self_registration_warning

      choose I18n.t(:setting_self_registration_automatic_activation)
      registration_page.expect_visible_unsupervised_self_registration_warning
      registration_page.save
      Setting.clear_cache
      expect(Setting::SelfRegistration.automatic?).to be(true)
      registration_page.expect_self_registration_selected(:automatic_activation)
      registration_page.expect_visible_unsupervised_self_registration_warning
    end
  end
end
