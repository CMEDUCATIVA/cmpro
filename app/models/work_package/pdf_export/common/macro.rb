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

module WorkPackage::PDFExport::Common::Macro
  PREFORMATTED_BLOCKS = %w(pre code).freeze

  def apply_markdown_field_macros(markdown, context)
    return markdown if markdown.blank?

    apply_macros(markdown, context)
  end

  def macros
    [
      WorkPackage::Exports::Macros::Links,
      WorkPackage::Exports::Macros::Attributes
    ]
  end

  private

  def apply_macros(markdown, context)
    return markdown unless macros.any? { |macro| macro.applicable?(markdown) }

    document = Markly.parse(markdown)
    document.walk { |node| apply_macros_node(node, context) }
    document.to_markdown
            .gsub("\\~", "~") # fix a bug in Markly that escapes tildes
  end

  def apply_macros_node(node, context)
    if node.type == :html
      apply_macros_node_html(node, context)
    elsif node.type == :text && not_in_mention?(node)
      apply_macros_node_text(node, context)
    end
  end

  def not_in_mention?(node)
    # Check if the text node is not inside a mention tag
    # e.g. <mention ...>#1234</mention>
    # We don't want to end up with
    # <mention ...><mention ...>#1234</mention></mention>
    node.previous.nil? || node.previous.type != :inline_html || node.previous.string_content.exclude?("<mention")
  end

  def apply_macros_node_text(node, context)
    formatted, applied_macros = apply_macro_text(node.string_content, context)
    return if formatted == node.string_content

    if has_html_macro?(applied_macros)
      fragment = Markly::Node.new(:inline_html)
      fragment.string_content = formatted
      node.insert_before(fragment)
      node.delete
    else
      node.string_content = formatted
    end
  end

  def apply_macros_node_html(node, context)
    node.string_content = apply_macro_html(node.string_content, context)
  end

  def applicable?(content)
    macros.any? { |macro| macro.applicable?(content) }
  end

  def apply_macro_text(text, context)
    applicable_macros = macros.select { |macro| macro.applicable?(text) }
    return text if applicable_macros.empty?

    applicable_macros.each do |macro|
      text = text.gsub(macro.regexp) do |matched_string|
        macro.process_match(Regexp.last_match, matched_string, context)
      end
    end
    [text, applicable_macros]
  end

  def apply_macro_html(html, context)
    return html unless applicable?(html)

    doc = Nokogiri::HTML.fragment(html)
    apply_macro_html_node(doc, context)
    doc.to_html
  end

  def has_html_macro?(macros)
    macros.any? { |macro| macro.respond_to?(:html_replacement?) && macro.html_replacement? }
  end

  def apply_macro_html_node(node, context)
    if node.text?
      formatted, applied_macros = apply_macro_text(node.content, context)
      if formatted != node.content
        if has_html_macro?(applied_macros)
          node.replace(formatted)
        else
          node.content = formatted
        end
      end
    elsif PREFORMATTED_BLOCKS.exclude?(node.name)
      node.children.each { |child| apply_macro_html_node(child, context) }
    end
  end
end
