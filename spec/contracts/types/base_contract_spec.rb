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

RSpec.describe Types::BaseContract do
  let(:current_user) { build_stubbed(:user) }
  let(:work_package_type) { Type.new }

  subject(:contract) { described_class.new(work_package_type, current_user) }

  describe "#validation" do
    context "if subject generation patterns contains invalid tokens" do
      let(:valid_tokens) { [Types::Patterns::AttributeToken.new(:assignee, nil, nil)] }
      let(:work_package_type) do
        Type.new(patterns: { subject: { blueprint: "Vacation {{vaders_toy}}", enabled: true } })
      end

      before do
        token_mapper_double = instance_double(Types::Patterns::TokenPropertyMapper)
        allow(token_mapper_double).to receive(:tokens_for_type).and_return(valid_tokens)
        allow(Types::Patterns::TokenPropertyMapper).to receive(:new).and_return(token_mapper_double)
      end

      it "is invalid" do
        contract.validate
        expect(subject.errors.symbols_for(:patterns)).to contain_exactly(:invalid_tokens)
      end
    end
  end
end
