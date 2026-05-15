# frozen_string_literal: true

module Costos
  module Patches
    module CostTypesControllerPatch
      extend ActiveSupport::Concern

      PAGE_SIZES = [10, 25, 50, 100, "all"].freeze
      DEFAULT_LIMIT = 10

      def index # rubocop:disable Metrics/PerceivedComplexity, Metrics/AbcSize
        sort_init "name", "asc"
        sort_columns = { "name" => "#{CostType.table_name}.name",
                         "unit" => "#{CostType.table_name}.unit",
                         "unit_plural" => "#{CostType.table_name}.unit_plural" }
        sort_update sort_columns

        @search_term = params[:search].to_s.strip
        filtered_scope = CostType.order(sort_clause)
        if @search_term.present?
          query = "%#{@search_term.downcase}%"
          filtered_scope = filtered_scope.where("LOWER(#{CostType.table_name}.name) LIKE ?", query)
        end

        if params[:clear_filter]
          @fixed_date = Time.zone.today
          @include_deleted = nil
        else
          @fixed_date = begin
            Date.parse(params[:fixed_date])
          rescue StandardError
            Time.zone.today
          end
          @include_deleted = params[:include_deleted]
        end

        active_scope = filtered_scope.where(deleted_at: nil)
        @total_cost_types = active_scope.count

        @page_size = determine_page_size
        @current_page = [params[:page].to_i, 1].max

        if @page_size == :all
          @current_page = 1
          @cost_types = active_scope.to_a
          @total_pages = 1
        else
          @total_pages = [(@total_cost_types.to_f / @page_size).ceil, 1].max
          @current_page = [@current_page, @total_pages].min
          offset = (@current_page - 1) * @page_size
          @cost_types = active_scope.offset(offset).limit(@page_size).to_a
        end

        @deleted_cost_types = filtered_scope.where.not(deleted_at: nil) if @include_deleted

        render action: "index", layout: !request.xhr?
      end

      private

      def determine_page_size
        if (explicit = parse_page_size(params[:per_page]))
          session[:cost_types_per_page] = explicit
          return explicit
        end

        stored = parse_page_size(session[:cost_types_per_page])
        stored || DEFAULT_LIMIT
      end

      def parse_page_size(raw)
        return if raw.blank?
        return :all if raw.to_s == "all"

        value = raw.to_i
        PAGE_SIZES.include?(value) ? value : nil
      end
    end
  end
end
