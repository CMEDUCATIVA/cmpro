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

def ee_actions(example)
  return [] unless example.respond_to?(:metadata) && example.metadata[:with_ee]

  example.metadata[:with_ee]
end

def aggregate_parent_array(example, acc)
  # We have to manually check parent groups for with_ee:,
  # since they are being ignored otherwise
  example.example_group.module_parents.each do |parent|
    acc.merge(ee_actions(parent))
  end

  acc
end

RSpec.configure do |config|
  config.before do |example|
    allowed = ee_actions(example)
    if allowed.present?
      allowed = aggregate_parent_array(example, allowed.to_set)

      token_double = instance_double(EnterpriseToken)
      token_object_double = instance_double(OpenProject::Token)
      allow(EnterpriseToken).to receive(:allows_to?).and_call_original
      allow(token_object_double).to receive(:has_feature?).and_return(false)
      allowed.each do |enterprise_feature|
        allow(EnterpriseToken).to receive(:allows_to?).with(enterprise_feature).and_return(true)
        allow(token_object_double).to receive(:has_feature?).with(enterprise_feature).and_return(true)
      end

      # Also signal available features
      allow(EnterpriseToken).to receive(:current).and_return(token_double)
      allow(token_double)
        .to receive_messages(token_object: token_object_double,
                             available_features: allowed.to_a,
                             expired?: false,
                             restrictions: {})
    end
  end
end
