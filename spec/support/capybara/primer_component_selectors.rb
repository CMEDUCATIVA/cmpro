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

Capybara.add_selector :primer_label, locator_type: [String, Symbol] do
  label "Primer Label"

  css do |*|
    ".Label"
  end

  locator_filter skip_if: nil do |node, locator, exact:, **|
    text = if node[:"aria-labelledby"]
             CapybaraAccessibleSelectors::Helpers.element_labelledby(node)
           elsif node[:"aria-label"]
             node[:"aria-label"]
           else
             node.text
           end
    text.public_send(exact ? :eql? : :include?, locator.to_s)
  end

  expression_filter :scheme do |expr, scheme|
    builder(expr).add_attribute_conditions(class: "Label--#{scheme.downcase}")
  end

  describe_expression_filters do |scheme: nil, **|
    " with scheme #{scheme.inspect}" if scheme
  end
end

Capybara.add_selector :octicon, locator_type: [String, Symbol] do
  label "Octicon"

  xpath do |locator|
    xpath = XPath.descendant(:svg)
    xpath = builder(xpath).add_attribute_conditions(class: "octicon")
    xpath = builder(xpath).add_attribute_conditions(class: "octicon-#{locator.to_s.downcase}") if locator
    xpath
  end

  expression_filter(:size, valid_values: [Numeric, *Primer::Beta::Octicon::SIZE_OPTIONS]) do |expr, size|
    px_size = size.is_a?(Numeric) ? size : Primer::Beta::Octicon::SIZE_MAPPINGS.fetch(size)
    builder(expr).add_attribute_conditions(width: px_size, height: px_size)
  end

  describe_expression_filters do |size: nil, **|
    desc = +""
    if size.present?
      desc << size.is_a?(Numeric) ? " with size #{size}px" : " with #{size} size"
    end
    desc
  end
end

module Capybara
  module RSpecMatchers
    def have_primer_label(locator = nil, **, &)
      Matchers::HaveSelector.new(:primer_label, locator, **, &)
    end

    def have_no_primer_label(...)
      Matchers::NegatedMatcher.new(have_primer_label(...))
    end

    def have_octicon(locator = nil, **, &)
      Matchers::HaveSelector.new(:octicon, locator, **, &)
    end

    def have_no_octicon(...)
      Matchers::NegatedMatcher.new(have_octicon(...))
    end
  end
end
