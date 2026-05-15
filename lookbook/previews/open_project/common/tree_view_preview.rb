# frozen_string_literal: true

module OpenProject
  module Common
    # @hidden
    class TreeViewPreview < Lookbook::Preview
      # @label Default
      # @display min_height 350px
      # @param expanded [Boolean] toggle
      # @param select_variant [Symbol] select [multiple, none]
      # @param select_strategy [Symbol] select [self, descendants]
      # @param leading_icon [Boolean] toggle
      # @param trailing_icon [Boolean] toggle
      def default(expanded: true, select_variant: :none, select_strategy: :descendants, leading_icon: true, trailing_icon: true)
        render(Primer::OpenProject::TreeView.new) do |component|
          component.with_sub_tree(label: "OpenProject",
                                  expanded: expanded,
                                  select_variant: select_variant,
                                  select_strategy: select_strategy) do |sub_tree|
            if leading_icon
              sub_tree.with_leading_visual_icons(label: "Foobar") do |icons|
                icons.with_expanded_icon(icon: :heart, color: :accent)
                icons.with_collapsed_icon(icon: :"heart-fill", color: :accent)
              end
            end

            sub_tree.with_leaf(label: "Website", select_variant: select_variant)

            sub_tree.with_sub_tree(label: "OpenProject GmbH",
                                   expanded: expanded,
                                   elect_variant: select_variant,
                                   select_strategy: select_strategy) do |sub_tree2|
              sub_tree2.with_leaf(label: "HR", select_variant: select_variant)
              sub_tree2.with_leaf(label: "Development", current: true, select_variant: select_variant)

              if trailing_icon
                sub_tree2.with_trailing_visual_icon(icon: :"feed-heart")
              end
            end

            sub_tree.with_leaf(label: "Freedom edition", select_variant: select_variant)

            sub_tree.with_leaf(label: "Documentation", select_variant: select_variant)
          end

          component.with_leaf(label: "External project A", select_variant: select_variant)

          component.with_leaf(label: "External project B", select_variant: select_variant)
        end
      end

      # @label Multi
      # @display min_height 300px
      # @param expanded [Boolean] toggle
      # @param select_variant [Symbol] select [multiple, none]
      # @param select_strategy [Symbol] select [self, descendants]
      def multi_select(expanded: true, select_variant: :multiple, select_strategy: :descendants)
        render(Primer::OpenProject::TreeView.new) do |component|
          component.with_sub_tree(label: "Europe",
                                  expanded: expanded,
                                  select_variant: select_variant,
                                  select_strategy: select_strategy) do |sub_tree|
            sub_tree.with_sub_tree(label: "Germany",
                                   expanded: expanded,
                                   select_variant: select_variant,
                                   select_strategy: select_strategy) do |tree|
              tree.with_leaf(label: "Potsdam", current: true, select_variant: select_variant)
              tree.with_leaf(label: "Berlin", select_variant: select_variant)
              tree.with_leaf(label: "Frankfurt (Main)", select_variant: select_variant)
              tree.with_leaf(label: "München", select_variant: select_variant)
            end

            sub_tree.with_leaf(label: "France", select_variant: select_variant)

            sub_tree.with_leaf(label: "Spain", select_variant: select_variant)
          end

          component.with_leaf(label: "North America", select_variant: select_variant)

          component.with_leaf(label: "Asia", select_variant: select_variant)
        end
      end

      # @label FileTree
      # @display min_height 200px
      # @param expanded [Boolean] toggle
      def file_tree(expanded: true)
        render(Primer::OpenProject::FileTreeView.new) do |component|
          component.with_directory(label: "src", expanded: expanded) do |dir|
            dir.with_trailing_visual_icon(icon: :"diff-modified")

            dir.with_file(label: "button.rb")
            dir.with_file(label: "icon_button.rb", current: true)

            dir.with_directory(label: "tree_view", expanded: expanded) do |subdir|
              subdir.with_file(label: "sub_tree.rb")
            end
          end
        end
      end
    end
  end
end
