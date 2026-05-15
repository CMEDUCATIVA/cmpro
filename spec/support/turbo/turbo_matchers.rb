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

# Adapted for RSpec from turbo-rails
# See: https://github.com/hotwired/turbo-rails/blob/main/lib/turbo/test_assertions.rb
#
RSpec::Matchers.define :have_turbo_stream do |action:, target: nil, targets: nil, count: 1|
  description { "contain a `<turbo-stream>` element" }
  failure_message { rescued_exception.message }
  failure_message_when_negated do
    "Expected no elements matching #{@selector.inspect}, found at least 1."
  end

  match_unless_raises ActiveSupport::TestCase::Assertion do |_|
    @selector =  %(turbo-stream[action="#{action}"])
    @selector << %([target="#{target.respond_to?(:to_key) ? dom_id(target) : target}"]) if target
    @selector << %([targets="#{targets}"]) if targets

    assert_select(@selector, count:, &block_arg)
  end
end
