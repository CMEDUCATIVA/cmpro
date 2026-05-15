require "net/http"
require "uri"
require "base64"
require "set"

class FlowNodeJob < ApplicationJob
  queue_with_priority :notification

  def perform(flow_run_id, contact_id, node_id, options = nil)
    run = FlowRun.find_by(id: flow_run_id)
    return unless run
    contact = contact_id.present? ? WhatsappContactProfile.find_by(id: contact_id) : nil
    return if contact_id.present? && contact.nil?
    definition = run.flow_definition&.definition_json || {}
    nodes = definition["nodes"] || []
    edges = definition["edges"] || []
    node = find_node_by_id(nodes, node_id)
    return unless node
    options = options.is_a?(Hash) ? options : {}

    if run_failed_globally?(run)
      skip_job_due_failed_run!(run: run, flow_run_id: flow_run_id, contact_id: contact_id, node_id: node_id, options: options)
      return
    end

    planned_mode = truthy?(options["materialized_plan"]) || truthy?(options[:materialized_plan])
    night_window = night_window_for_node(nodes, edges, node_id)
    if night_window && !planned_mode && !truthy?(options["night_deferred"])
      if in_night_window?(Time.current, night_window[:start], night_window[:end])
        new_time = Time.current + 12.hours
        payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
        payload = payload.is_a?(Hash) ? payload : {}
        FlowRunItem.create!(
          flow_run: run,
          contact: contact,
          node_id: node_id,
          status: "queued",
          started_at: Time.current,
          result_meta: {
            "delay_until" => new_time.iso8601,
            "night_adjusted" => true,
            "night_adjust_hours" => 12,
            "night_window" => "#{night_window[:start]}-#{night_window[:end]}",
            "night_deferred" => true,
            "reprogrammed_from" => Time.current.iso8601,
            "reprogrammed_to" => new_time.iso8601,
            "payload" => payload
          }
        )
        self.class.set(wait_until: new_time)
                  .perform_later(flow_run_id, contact_id, node_id, { "night_deferred" => true })
        return
      end
    end

    planned_item_id = options["planned_item_id"] || options[:planned_item_id]
    item = nil
    if planned_item_id.present?
      planned_item = FlowRunItem.find_by(id: planned_item_id, flow_run_id: run.id)
      if planned_item.nil?
        Rails.logger.info(
          "[Flows] materialized_item_missing_skip run_id=#{run.id} node_id=#{node_id} " \
          "contact_id=#{contact_id || 'nil'} item_id=#{planned_item_id}"
        )
        return
      end

      if planned_item.status.to_s != "queued"
        Rails.logger.info(
          "[Flows] materialized_item_not_queued_skip run_id=#{run.id} node_id=#{node_id} " \
          "contact_id=#{contact_id || 'nil'} item_id=#{planned_item.id} status=#{planned_item.status}"
        )
        return
      end

      planned_item.update_columns(
        contact_id: contact&.id || planned_item.contact_id,
        node_id: node_id.to_s,
        status: "running",
        started_at: Time.current,
        updated_at: Time.current
      )
      item = planned_item
    end
    item ||= FlowRunItem.create!(
      flow_run: run,
      contact: contact,
      node_id: node_id,
      status: "running",
      started_at: Time.current
    )

    if failed_item_exists_for_run?(run_id: run.id, excluding_item_id: item.id)
      item.update!(
        status: "skipped",
        finished_at: Time.current,
        error_message: "Run cancelado por fallo previo"
      )
      Rails.logger.info(
        "[Flows] run_failed_skip_by_item run_id=#{run.id} node_id=#{node_id} contact_id=#{contact_id || 'nil'}"
      )
      return
    end
    if planned_mode
      gate_state = ensure_no_prior_running_items!(
        run: run,
        item: item,
        flow_run_id: flow_run_id,
        contact_id: contact_id,
        node_id: node_id,
        options: options
      )
      return if gate_state == :halt
    end

    if planned_mode && contact.nil? && node_requires_contact_for_execution?(node["type"])
      item.update!(
        status: "skipped",
        finished_at: Time.current,
        error_message: "Contacto requerido (plan materializado sin contacto)"
      )
      Rails.logger.warn(
        "[Flows] materialized_blocked run_id=#{run.id} node_id=#{node_id} contact_id=nil reason=contact_required"
      )
      return
    end
    if planned_mode
      dependency_state = ensure_planned_dependency!(
        run: run,
        item: item,
        options: options,
        flow_run_id: flow_run_id,
        contact_id: contact_id,
        node_id: node_id
      )
      return if dependency_state == :halt
    end

    result = execute_node(run, run.project_id, contact, node)
    if result[:contact_id] && item.contact_id.blank?
      item.contact_id = result[:contact_id]
    end
    item.result_path = result[:path] if result.key?(:path)
    if result.key?(:meta)
      merged_meta = {}
      merged_meta.merge!(item.result_meta) if item.result_meta.is_a?(Hash)
      merged_meta.merge!(result[:meta]) if result[:meta].is_a?(Hash)
      item.result_meta = merged_meta.presence
    end
    item.update!(status: result[:status], finished_at: Time.current, error_message: result[:error])
    if result[:status].to_s == "failed"
      fail_run_and_cancel_pending!(run: run, failed_node_id: node_id, contact_id: contact_id, error: result[:error].to_s)
    end

    if %w[failed skipped].include?(result[:status].to_s)
      if planned_mode && should_cancel_materialized_descendants?(node: node, result: result)
        skip_materialized_descendants!(
          run: run,
          contact_id: item.contact_id,
          root_node_id: node_id.to_s,
          reason: result[:error].presence || "Rama omitida por nodo anterior"
        )
      end
      Rails.logger.warn(
        "[Flows] node_result status=#{result[:status]} run_id=#{run.id} node_id=#{node_id} " \
        "contact_id=#{contact_id} error=#{result[:error].to_s.tr("\n", " ")[0, 300]}"
      )
    end

    # Failed/skipped nodes must not continue the branch, otherwise we generate
    # phantom pending jobs (and duplicated history rows) from invalid paths.
    return if %w[failed skipped].include?(result[:status].to_s)
    if planned_mode
      if node["type"].to_s == "transform_json" && result[:status].to_s == "finished" && result[:contact_id].present? && contact_id.to_i <= 0
        next_ids = next_nodes(edges, node_id, result[:path], node["type"])
        next_contact_id = result[:contact_id]
        resolved_contact = contact || WhatsappContactProfile.find_by(id: next_contact_id)
        planned_steps = materialize_resume_plan!(
          run: run,
          flow_run_id: flow_run_id,
          nodes: nodes,
          edges: edges,
          from_node_id: node_id,
          next_ids: next_ids,
          contact_id: next_contact_id,
          contact: resolved_contact,
          initial_delay_until: result[:delay_until]
        )
        Rails.logger.info(
          "[Flows] materialized_resume run_id=#{run.id} from=#{node_id} contact_id=#{next_contact_id} " \
          "planned_steps=#{planned_steps}"
        )
      else
        Rails.logger.info(
          "[Flows] materialized_no_chain run_id=#{run.id} node_id=#{node_id} contact_id=#{contact_id}"
        )
      end
      return
    end
    next_ids = next_nodes(edges, node_id, result[:path], node["type"])
    return if next_ids.empty?
    next_contact_id = result[:contact_id].presence || contact_id
    next_ids.each do |next_id|
      delay_until = result[:delay_until]
      if delay_until.blank?
        delay_seconds = whatsapp_interval_delay(run, nodes, next_id)
        delay_until = Time.current + delay_seconds if delay_seconds && delay_seconds > 0
      end
      if delay_until
        Rails.logger.info(
          "[Flows] enqueue_next run_id=#{run.id} from=#{node_id} to=#{next_id} " \
          "contact_id=#{next_contact_id} mode=scheduled at=#{delay_until.iso8601}"
        )
        self.class.set(wait_until: delay_until).perform_later(flow_run_id, next_contact_id, next_id)
      else
        Rails.logger.info(
          "[Flows] enqueue_next run_id=#{run.id} from=#{node_id} to=#{next_id} " \
          "contact_id=#{next_contact_id} mode=immediate"
        )
        self.class.perform_later(flow_run_id, next_contact_id, next_id)
      end
    end
  rescue StandardError => error
    item&.update(status: "failed", finished_at: Time.current, error_message: error.message)
    raise
  end

  private

  def next_nodes(edges, node_id, path = nil, node_type = nil)
    source_id = normalize_node_id_for_flow(node_id)
    targets = edges.select do |edge|
      edge.is_a?(Hash) &&
        normalize_node_id_for_flow(edge["source"]) == source_id
    end
    selected = select_targets_for_path(targets: targets, node_type: node_type, desired_path: path)
    selected.map { |edge| edge["target"].to_s.strip }.reject(&:blank?).uniq
  end

  def find_node_by_id(nodes, node_id)
    requested = normalize_node_id_for_flow(node_id)
    return nil if requested.blank?

    nodes.find do |node|
      node.is_a?(Hash) &&
        normalize_node_id_for_flow(node["id"]) == requested
    end
  rescue StandardError
    nil
  end

  def normalize_node_id_for_flow(value)
    value
      .to_s
      .unicode_normalize(:nfkc)
      .gsub(/\p{Cf}/, "")
      .gsub(/\s+/, "")
      .strip
  rescue StandardError
    value.to_s.strip
  end

  def run_failed_globally?(run)
    run.status.to_s == "failed"
  rescue StandardError
    false
  end

  def failed_item_exists_for_run?(run_id:, excluding_item_id:)
    scope = FlowRunItem.where(flow_run_id: run_id, status: "failed")
    scope = scope.where.not(id: excluding_item_id) if excluding_item_id.present?
    scope.exists?
  rescue StandardError
    false
  end

  def ensure_no_prior_running_items!(run:, item:, flow_run_id:, contact_id:, node_id:, options:)
    blocker = FlowRunItem.where(flow_run_id: run.id, status: "running")
                         .where("id < ?", item.id)
                         .order(id: :asc)
                         .first
    return :ok unless blocker

    retries = (options["planned_gate_retry"] || options[:planned_gate_retry]).to_i
    if retries >= 20
      item.update!(
        status: "skipped",
        finished_at: Time.current,
        error_message: "Bloqueo por orden excedido (item=#{blocker.id})"
      )
      Rails.logger.warn(
        "[Flows] materialized_gate_timeout run_id=#{run.id} node_id=#{node_id} " \
        "contact_id=#{contact_id || 'nil'} blocker_item_id=#{blocker.id}"
      )
      return :halt
    end

    retry_options = options.is_a?(Hash) ? options.deep_dup : {}
    retry_options["planned_gate_retry"] = retries + 1
    item.update_columns(status: "queued", started_at: nil, updated_at: Time.current)
    self.class.set(wait: 2.seconds).perform_later(flow_run_id, contact_id, node_id, retry_options)
    Rails.logger.info(
      "[Flows] materialized_gate_wait run_id=#{run.id} node_id=#{node_id} " \
      "contact_id=#{contact_id || 'nil'} blocker_item_id=#{blocker.id} retry=#{retries + 1}"
    )
    :halt
  rescue StandardError
    :ok
  end

  def skip_job_due_failed_run!(run:, flow_run_id:, contact_id:, node_id:, options:)
    planned_item_id = options["planned_item_id"] || options[:planned_item_id]
    if planned_item_id.present?
      planned_item = FlowRunItem.find_by(id: planned_item_id, flow_run_id: flow_run_id)
      if planned_item && planned_item.status.to_s == "queued"
        planned_item.update_columns(
          status: "skipped",
          finished_at: Time.current,
          error_message: "Run cancelado por fallo previo",
          updated_at: Time.current
        )
      end
    end
    Rails.logger.info(
      "[Flows] run_failed_skip run_id=#{run.id} node_id=#{node_id} contact_id=#{contact_id || 'nil'}"
    )
  rescue StandardError
    nil
  end

  def fail_run_and_cancel_pending!(run:, failed_node_id:, contact_id:, error:)
    now = Time.current
    FlowRun.transaction do
      run.lock!
      metadata = run.metadata.is_a?(Hash) ? run.metadata.deep_dup : {}
      failures = metadata["failures"].is_a?(Array) ? metadata["failures"] : []
      failures << {
        "node_id" => failed_node_id.to_s,
        "contact_id" => contact_id.presence,
        "error" => error.to_s[0, 500],
        "at" => now.iso8601
      }
      metadata["failures"] = failures
      metadata["halt_reason"] = "node_failed"
      metadata["halted_at"] = now.iso8601
      run.update_columns(status: "failed", finished_at: now, metadata: metadata, updated_at: now)
    end

    FlowRunItem.where(flow_run_id: run.id, status: "queued").update_all(
      status: "skipped",
      finished_at: now,
      error_message: "Cancelado por fallo en nodo #{failed_node_id}",
      updated_at: now
    )

    Rails.logger.warn(
      "[Flows] run_failed_halt run_id=#{run.id} failed_node=#{failed_node_id} contact_id=#{contact_id || 'nil'} error=#{error.to_s.tr("\n", " ")[0, 300]}"
    )
  rescue StandardError => halt_error
    Rails.logger.warn(
      "[Flows] run_failed_halt_error run_id=#{run.id} failed_node=#{failed_node_id} error=#{halt_error.message}"
    )
  end

  def should_cancel_materialized_descendants?(node:, result:)
    return false unless result[:status].to_s == "skipped"

    node_type = node.is_a?(Hash) ? node["type"].to_s : ""
    # For transform_json, a skipped result can be a valid business-path outcome
    # (e.g. non-matching payload for this branch). In that case we must not
    # cancel descendants preemptively, otherwise history loses the planned chain.
    return false if node_type == "transform_json"

    true
  rescue StandardError
    true
  end

  def ensure_planned_dependency!(run:, item:, options:, flow_run_id:, contact_id:, node_id:)
    meta = item.result_meta.is_a?(Hash) ? item.result_meta : {}
    parent_node_id = meta["planned_from"].to_s.presence
    return :ok if parent_node_id.blank?

    parent_item = FlowRunItem.where(
      flow_run_id: run.id,
      contact_id: contact_id,
      node_id: parent_node_id
    ).where("id < ?", item.id).order(id: :desc).first

    unless parent_item
      item.update!(
        status: "skipped",
        finished_at: Time.current,
        error_message: "Dependencia no encontrada: #{parent_node_id}"
      )
      Rails.logger.warn(
        "[Flows] materialized_dependency_missing run_id=#{run.id} node_id=#{node_id} " \
        "contact_id=#{contact_id || 'nil'} planned_from=#{parent_node_id}"
      )
      return :halt
    end

    case parent_item.status.to_s
    when "finished"
      :ok
    when "failed", "skipped"
      item.update!(
        status: "skipped",
        finished_at: Time.current,
        error_message: "Dependencia no cumplida: #{parent_node_id} (#{parent_item.status})"
      )
      Rails.logger.info(
        "[Flows] materialized_dependency_blocked run_id=#{run.id} node_id=#{node_id} " \
        "contact_id=#{contact_id || 'nil'} planned_from=#{parent_node_id} parent_status=#{parent_item.status}"
      )
      :halt
    else
      retries = (options["planned_dep_retry"] || options[:planned_dep_retry]).to_i
      if retries >= 12
        item.update!(
          status: "skipped",
          finished_at: Time.current,
          error_message: "Dependencia pendiente agotada: #{parent_node_id} (#{parent_item.status})"
        )
        Rails.logger.warn(
          "[Flows] materialized_dependency_timeout run_id=#{run.id} node_id=#{node_id} " \
          "contact_id=#{contact_id || 'nil'} planned_from=#{parent_node_id} parent_status=#{parent_item.status}"
        )
        return :halt
      end

      retry_options = options.is_a?(Hash) ? options.deep_dup : {}
      retry_options["planned_dep_retry"] = retries + 1
      item.update_columns(status: "queued", started_at: nil, updated_at: Time.current)
      self.class.set(wait: 5.seconds).perform_later(flow_run_id, contact_id, node_id, retry_options)
      Rails.logger.info(
        "[Flows] materialized_dependency_wait run_id=#{run.id} node_id=#{node_id} " \
        "contact_id=#{contact_id || 'nil'} planned_from=#{parent_node_id} parent_status=#{parent_item.status} " \
        "retry=#{retries + 1}"
      )
      :halt
    end
  end

  def skip_materialized_descendants!(run:, contact_id:, root_node_id:, reason:)
    scope = FlowRunItem.where(
      flow_run_id: run.id,
      contact_id: contact_id
    )
    pending_items = scope.where(status: "queued").to_a
    return if pending_items.empty?
    definition = run.flow_definition&.definition_json
    edges = definition.is_a?(Hash) ? Array(definition["edges"]) : []
    incoming_parents = Hash.new { |memo, key| memo[key] = [] }
    edges.each do |edge|
      next unless edge.is_a?(Hash)
      source = edge["source"].to_s
      target = edge["target"].to_s
      next if source.blank? || target.blank?
      incoming_parents[target] << source
    end

    children_by_parent = pending_items.each_with_object(Hash.new { |memo, key| memo[key] = [] }) do |queued_item, memo|
      next unless queued_item.result_meta.is_a?(Hash)
      parent = queued_item.result_meta["planned_from"].to_s
      next if parent.blank?
      memo[parent] << queued_item
    end

    to_visit = [root_node_id.to_s]
    visited_nodes = Set.new
    skipped_count = 0
    skipped_item_ids = []

    while to_visit.any?
      parent_id = to_visit.shift.to_s
      next if parent_id.blank? || visited_nodes.include?(parent_id)
      visited_nodes << parent_id

      children = children_by_parent[parent_id]
      next if children.blank?

      children.each do |child_item|
        next unless child_item.status.to_s == "queued"
        # If there is an alternate active parent for this node, keep it queued.
        parent_candidates = incoming_parents[child_item.node_id.to_s].uniq - [parent_id]
        keep_queued = parent_candidates.any? do |candidate_parent_id|
          next false if candidate_parent_id.blank?
          parent_status = scope.where(node_id: candidate_parent_id)
                               .order(id: :desc)
                               .limit(1)
                               .pick(:status)
          %w[queued running finished].include?(parent_status.to_s)
        end
        next if keep_queued

        child_item.update!(
          status: "skipped",
          finished_at: Time.current,
          error_message: "Descartado por dependencia omitida: #{reason.to_s[0, 220]}"
        )
        skipped_count += 1
        skipped_item_ids << child_item.id
        to_visit << child_item.node_id.to_s if child_item.node_id.to_s.present?
      end
    end

    cancelled_jobs = cancel_materialized_planned_jobs!(
      run_id: run.id,
      planned_item_ids: skipped_item_ids
    )

    return if skipped_count <= 0
    Rails.logger.info(
      "[Flows] materialized_descendants_skipped run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
      "root_node=#{root_node_id} skipped_items=#{skipped_count} cancelled_jobs=#{cancelled_jobs}"
    )
  rescue StandardError => error
    Rails.logger.warn(
      "[Flows] materialized_descendants_skip_error run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
      "root_node=#{root_node_id} error=#{error.message}"
    )
  end

  def cancel_materialized_planned_jobs!(run_id:, planned_item_ids:)
    ids = Array(planned_item_ids).map(&:to_i).select(&:positive?).uniq
    return 0 if ids.empty?
    return 0 unless defined?(GoodJob::Job)

    pending_jobs = GoodJob::Job.where(finished_at: nil)
                              .where("scheduled_at > ?", Time.current)
                              .where(job_class: ["FlowNodeJob", "ActiveJob::QueueAdapters::GoodJobAdapter::JobWrapper"])

    cancelled = 0
    pending_jobs.find_each(batch_size: 200) do |job|
      args = extract_flow_node_job_arguments(job.serialized_params)
      next unless args.is_a?(Array) && args.length >= 4
      next unless args[0].to_i == run_id.to_i

      options = args[3]
      next unless options.is_a?(Hash)
      planned_item_id = (options["planned_item_id"] || options[:planned_item_id]).to_i
      next unless planned_item_id.positive?
      next unless ids.include?(planned_item_id)

      job.destroy!
      cancelled += 1
    end

    cancelled
  rescue StandardError => error
    Rails.logger.warn(
      "[Flows] materialized_cancel_jobs_error run_id=#{run_id} error=#{error.message}"
    )
    0
  end

  def extract_flow_node_job_arguments(serialized_params)
    raw = serialized_params
    if raw.is_a?(String)
      begin
        raw = JSON.parse(raw)
      rescue StandardError
        raw = {}
      end
    end
    return [] unless raw.is_a?(Hash)

    args =
      raw["arguments"] ||
      raw[:arguments] ||
      raw.dig("job_data", "arguments") ||
      raw.dig(:job_data, :arguments) ||
      raw.dig("job", "arguments") ||
      raw.dig(:job, :arguments)
    return args if args.is_a?(Array) && args.length >= 3 && args[2].to_s.present?

    wrapper = args.is_a?(Array) ? args.first : nil
    if wrapper.is_a?(Hash)
      job_class = wrapper["job_class"] || wrapper[:job_class] || wrapper.dig("job_data", "job_class")
      return [] unless job_class.to_s == "FlowNodeJob"

      inner_args =
        wrapper["arguments"] ||
        wrapper[:arguments] ||
        wrapper.dig("job_data", "arguments") ||
        wrapper.dig(:job_data, :arguments)
      return inner_args if inner_args.is_a?(Array)
    end

    []
  rescue StandardError
    []
  end

  def materialize_resume_plan!(run:, flow_run_id:, nodes:, edges:, from_node_id:, next_ids:, contact_id:, contact:, initial_delay_until:)
    return 0 if next_ids.blank?

    now = Time.current
    initial_entries = next_ids.each_with_index.map do |next_id, index|
      delay_until = initial_delay_until
      if delay_until.blank?
        delay_seconds = whatsapp_interval_delay(run, nodes, next_id)
        delay_until = now + delay_seconds if delay_seconds && delay_seconds > 0
      end

      scheduled_at = delay_until || now
      { node_id: next_id.to_s, at: scheduled_at + index.seconds, from: from_node_id.to_s }
    end

    plan = build_resume_contact_plan(
      nodes: nodes,
      edges: edges,
      contact: contact,
      project_id: run.project_id,
      initial_entries: initial_entries
    )
    return 0 if plan.empty?

    created = 0
    plan.each do |entry|
      node_id = entry[:node_id].to_s
      next if node_id.blank?
      scheduled_at = entry[:scheduled_at].presence || Time.current
      next if resume_item_already_materialized?(run_id: run.id, contact_id: contact_id, node_id: node_id, planned_at: scheduled_at)

      planned_item = FlowRunItem.create!(
        flow_run: run,
        contact_id: contact_id,
        node_id: node_id,
        status: "queued",
        result_meta: {
          "materialized_plan" => true,
          "materialized_resume" => true,
          "planned_at" => scheduled_at.iso8601,
          "planned_from" => entry[:from_node_id].to_s.presence
        }
      )

      job_options = {
        "materialized_plan" => true,
        "planned_item_id" => planned_item.id,
        "planned_at" => scheduled_at.iso8601
      }

      if scheduled_at > Time.current
        self.class.set(wait_until: scheduled_at).perform_later(flow_run_id, contact_id, node_id, job_options)
        mode = "scheduled"
      else
        self.class.perform_later(flow_run_id, contact_id, node_id, job_options)
        mode = "immediate"
      end

      Rails.logger.info(
        "[Flows] materialized_resume_enqueue run_id=#{run.id} contact_id=#{contact_id} " \
        "node_id=#{node_id} from=#{entry[:from_node_id] || '-'} at=#{scheduled_at.iso8601} mode=#{mode} item_id=#{planned_item.id}"
      )
      created += 1
    end

    created
  end

  def build_resume_contact_plan(nodes:, edges:, contact:, project_id:, initial_entries:)
    nodes_by_id = nodes.each_with_object({}) do |node, memo|
      next unless node.is_a?(Hash)
      memo[node["id"].to_s] = node
    end

    queue = initial_entries.map { |entry| entry.dup }
    plan = []
    visited = Hash.new(0)
    max_steps = 500
    steps = 0

    while queue.any? && steps < max_steps
      steps += 1
      current = queue.shift
      node_id = current[:node_id].to_s
      next if node_id.blank?

      node = nodes_by_id[node_id]
      next unless node.is_a?(Hash)
      node_type = node["type"].to_s

      timestamp_key = (current[:at]&.to_i || 0)
      state_key = "#{node_id}|#{timestamp_key}"
      visited[state_key] += 1
      next if visited[state_key] > 2

      plan << {
        node_id: node_id,
        scheduled_at: current[:at],
        from_node_id: current[:from]
      }

      node_data = node["data"].is_a?(Hash) ? node["data"] : {}
      next_time = case node_type
                  when "delay"
                    compute_planned_delay_time(node_data, base_time: current[:at], project_id: project_id)
                  when "wait_until"
                    compute_planned_wait_until_time(node_data, base_time: current[:at])
                  else
                    (current[:at] || Time.current) + 1.second
                  end

      path = resolve_resume_path(node_type: node_type, node_data: node_data, contact: contact)
      targets = edges.select { |edge| edge.is_a?(Hash) && edge["source"].to_s == node_id }
      selected = select_targets_for_path(targets: targets, node_type: node_type, desired_path: path)

      selected_targets = selected.map { |edge| edge["target"].to_s }.reject(&:blank?).uniq
      selected_targets.each_with_index do |target_id, index|
        next if target_id.blank?

        queue << {
          node_id: target_id,
          at: next_time + index.seconds,
          from: node_id
        }
      end
    end

    plan
  end

  def resolve_resume_path(node_type:, node_data:, contact:)
    case node_type
    when "filter", "branch"
      return "yes" if contact && evaluate_filter(contact, node_data)
      return "no" if contact
      "default"
    when "condition"
      return "yes" if contact && evaluate_condition(contact, node_data)
      return "no" if contact
      "default"
    else
      "default"
    end
  rescue StandardError
    "default"
  end

  def normalized_edge_path(edge)
    return "default" unless edge.is_a?(Hash)
    edge["path"].to_s.presence || "default"
  end

  def select_targets_for_path(targets:, node_type:, desired_path:)
    desired = desired_path.to_s.presence || "default"
    exact = targets.select { |edge| normalized_edge_path(edge) == desired }
    return exact if exact.any?

    if node_type.to_s == "transform_json" && desired == "default"
      fallback = targets.reject { |edge| normalized_edge_path(edge) == "no" }
      return fallback if fallback.any?
    end

    strict_nodes = %w[filter branch condition transform_json]
    return [] if strict_nodes.include?(node_type.to_s)

    targets
  end

  def compute_planned_delay_time(data, base_time:, project_id:)
    base = base_time || Time.current
    amount = data["amount"].to_i
    amount = 1 if amount <= 0
    unit = data["unit"].to_s
    seconds = case unit
              when "seconds" then amount.seconds
              when "hours" then amount.hours
              when "days" then amount.days
              else amount.minutes
              end
    delay_until = base + seconds

    return delay_until unless truthy?(data["night_convert"])

    project_tz = WhatsappProjectSetting.find_by(project_id: project_id)&.time_zone.to_s.presence
    zone = project_tz.present? ? ActiveSupport::TimeZone[project_tz] : Time.zone
    zone ||= Time.zone
    start_value = data["night_start"].to_s.presence || "22:00"
    end_value = data["night_end"].to_s.presence || "06:00"
    start_minutes = parse_time_minutes(start_value)
    end_minutes = parse_time_minutes(end_value)
    return delay_until unless start_minutes && end_minutes

    zoned_delay = delay_until.in_time_zone(zone)
    base_date = zoned_delay.to_date
    start_time = zone.parse("#{base_date} #{start_value}") rescue nil
    end_time = zone.parse("#{base_date} #{end_value}") rescue nil
    start_time ||= zoned_delay.change(hour: (start_minutes / 60).to_i, min: (start_minutes % 60).to_i, sec: 0)
    end_time ||= zoned_delay.change(hour: (end_minutes / 60).to_i, min: (end_minutes % 60).to_i, sec: 0)
    end_time += 1.day if end_time < start_time

    in_window = zoned_delay >= start_time && zoned_delay <= end_time
    in_window ? (delay_until + 12.hours) : delay_until
  rescue StandardError
    base_time || Time.current
  end

  def compute_planned_wait_until_time(data, base_time:)
    base = base_time || Time.current
    raw = data["datetime"].to_s
    parsed = Time.zone.parse(raw) rescue nil
    candidate = parsed || base
    candidate > base ? candidate : base + 1.second
  rescue StandardError
    (base_time || Time.current) + 1.second
  end

  def resume_item_already_materialized?(run_id:, contact_id:, node_id:, planned_at:)
    FlowRunItem.where(
      flow_run_id: run_id,
      contact_id: contact_id,
      node_id: node_id,
      status: "queued"
    ).where("result_meta ->> 'planned_at' = ?", planned_at.iso8601).exists?
  rescue StandardError
    false
  end

  def night_window_for_node(nodes, edges, node_id)
    prev_ids = edges.select { |e| e["target"] == node_id }.map { |e| e["source"] }
    prev_ids.each do |prev_id|
      prev = nodes.find { |n| n["id"] == prev_id }
      next unless prev && prev["type"].to_s == "delay"
      data = prev["data"] || {}
      next unless truthy?(data["night_convert"])
      start_value = data["night_start"].to_s.presence || "22:00"
      end_value = data["night_end"].to_s.presence || "06:00"
      return { start: start_value, end: end_value }
    end
    nil
  end

  def in_night_window?(time, start_value, end_value)
    start_minutes = parse_time_minutes(start_value)
    end_minutes = parse_time_minutes(end_value)
    return false unless start_minutes && end_minutes
    current_minutes = time.hour * 60 + time.min
    if start_minutes <= end_minutes
      current_minutes >= start_minutes && current_minutes <= end_minutes
    else
      current_minutes >= start_minutes || current_minutes <= end_minutes
    end
  end

  def whatsapp_interval_delay(run, nodes, node_id)
    node = nodes.find { |n| n["id"] == node_id }
    return nil unless node && node["type"].to_s == "whatsapp"
    data = node["data"] || {}
    interval = data["send_interval"].to_i
    return nil if interval <= 0
    interval = 5 if interval < 5
    typing_delay = truthy?(data["start_typing"]) ? 3 : 0
    base_delay = interval - typing_delay
    base_delay = 0 if base_delay < 0
    position = next_node_sequence(run, node_id)
    (position - 1) * interval + base_delay
  end

  def next_node_sequence(run, node_id)
    FlowRun.transaction do
      run.lock!
      meta = run.metadata.is_a?(Hash) ? run.metadata.deep_dup : {}
      counters = meta["node_counters"].is_a?(Hash) ? meta["node_counters"] : {}
      key = node_id.to_s
      current = counters[key].to_i
      next_value = current + 1
      counters[key] = next_value
      meta["node_counters"] = counters
      run.update_columns(metadata: meta)
      next_value
    end
  end

  def execute_node(run, project_id, contact, node)
    type = node["type"].to_s
    data = node["data"] || {}
    case type
    when "start"
      { status: "finished" }
    when "conversation_ai"
      payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
      payload = payload.is_a?(Hash) ? payload : {}
      contact_snapshot = {}
      if contact
        payload["contact_id"] = contact.id if payload["contact_id"].blank?
        payload["chat_id"] = contact.chat_id if payload["chat_id"].blank?
        payload["first_name"] = contact.first_name.to_s if payload["first_name"].to_s.strip.empty?
        payload["last_name"] = contact.last_name.to_s if payload["last_name"].to_s.strip.empty?
        payload["email"] = contact.email.to_s if payload["email"].to_s.strip.empty?
        if payload["phone"].to_s.strip.empty?
          payload["phone"] = contact.external_id.to_s.presence || contact.phone.to_s
        end
        contact_snapshot = contact.attributes.slice(
          "id",
          "chat_id",
          "first_name",
          "last_name",
          "email",
          "phone",
          "address",
          "city",
          "state",
          "country",
          "postal_code",
          "company",
          "job_title",
          "notes",
          "tags",
          "source",
          "status",
          "birthday",
          "assigned_to_id",
          "points",
          "last_interaction_at",
          "deleted_at",
          "external_id",
          "custom_fields",
          "created_at",
          "updated_at"
        )
      end
      Rails.logger.info("[Flows] conversation_ai node run node_id=#{node['id']} run_id=#{run.id}")
      meta = { "payload" => payload }
      meta["contact"] = contact_snapshot if contact_snapshot.present?
      { status: "finished", path: "default", meta: meta }
    when "macro"
      payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
      payload = payload.is_a?(Hash) ? payload : {}
      if contact
        payload["first_name"] = contact.first_name.to_s if payload["first_name"].to_s.strip.empty?
        payload["email"] = contact.email.to_s if payload["email"].to_s.strip.empty?
        if payload["phone"].to_s.strip.empty?
          payload["phone"] = contact.external_id.to_s.presence || contact.phone.to_s
        end
        payload["contact_id"] = contact.id if payload["contact_id"].blank?
      end
      selected_keys = node.is_a?(Hash) && node["data"].is_a?(Hash) ? node["data"]["payload_keys"] : nil
      if selected_keys.is_a?(Array) && selected_keys.any?
        filtered = {}
        selected_keys.each do |key|
          key = key.to_s
          filtered[key] = payload[key] if payload.key?(key)
        end
        payload = filtered
        meta = run.metadata.is_a?(Hash) ? run.metadata.dup : {}
        meta["payload"] = payload
        run.update_columns(metadata: meta)
      end
      node_label = node.is_a?(Hash) ? node["id"] : node_id
      Rails.logger.info("[Flows] macro node run node_id=#{node_label} run_id=#{run.id} output=default payload_keys=#{payload.keys.join(',')}")
      {
        status: "finished",
        path: "default",
        meta: { "payload" => payload }
      }
    when "webhook_input"
      mark_webhook_event_processed(run)
      { status: "finished" }
    when "transform_json"
      transform_json(run, contact, data, node)
    when "end"
      { status: "finished" }
    when "filter"
      return { status: "skipped", error: "Contacto requerido" } if contact.nil?
      passes = evaluate_filter(contact, data)
      { status: "finished", path: passes ? "yes" : "no" }
    when "condition"
      return { status: "skipped", error: "Contacto requerido" } if contact.nil?
      passes = evaluate_condition(contact, data)
      { status: "finished", path: passes ? "yes" : "no" }
    when "branch"
      return { status: "skipped", error: "Contacto requerido" } if contact.nil?
      passes = evaluate_filter(contact, data)
      { status: "finished", path: passes ? "yes" : "no" }
    when "whatsapp"
      return { status: "failed", error: "Contacto requerido" } if contact.nil?
      required_keys = node.is_a?(Hash) && node["data"].is_a?(Hash) ? node["data"]["required_keys"] : nil
      if required_keys.is_a?(Array) && required_keys.any?
        payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
        payload = payload.is_a?(Hash) ? payload : {}
        missing = required_keys.map(&:to_s).select do |key|
          value = payload[key]
          value.nil? || value.to_s.strip.empty?
        end
        if missing.any?
          return { status: "failed", error: "Faltan datos requeridos: #{missing.join(', ')}" }
        end
      end
      payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
      payload = payload.is_a?(Hash) ? payload : {}
      chat_id = contact.chat_id.presence || payload["chat_id"].to_s.presence
      if chat_id.present?
        chat = WhatsappChat.find_by(id: chat_id, project_id: project_id)
        if chat
          contact.update_columns(chat_id: chat.id) if contact.chat_id.blank?
        end
      end
      Rails.logger.info("[Flows] whatsapp node run node_id=#{node['id']} run_id=#{run.id} contact_id=#{contact.id} template_id=#{data['template_id'].to_s}")
      result = send_whatsapp(project_id, contact, data)
      if result.is_a?(Hash)
        meta = result[:meta].is_a?(Hash) ? result[:meta] : {}
        meta["chat_id_used"] = contact.chat_id.presence || chat_id
        meta["template_id"] = data["template_id"] if data["template_id"].present?
        result[:meta] = meta
      end
      result
    when "whatsapp_ai"
      return { status: "failed", error: "Contacto requerido" } if contact.nil?
      server_url = data["server_url"].to_s.strip
      return { status: "failed", error: "URL servidor requerida" } if server_url.blank?
      agent_id = data["agent_id"].to_s.strip
      agent_id = "openproject-agent" if agent_id.blank?
      payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
      payload = payload.is_a?(Hash) ? payload : {}
      message_text =
        payload["message_body"].to_s.presence ||
        payload["message"].to_s.presence ||
        payload["body"].to_s.presence ||
        payload["text"].to_s.presence
      return { status: "failed", error: "Mensaje requerido" } if message_text.blank?

      thread_id = payload["thread_id"].to_s.presence || "wa:chat:#{payload['chat_id'].presence || contact.chat_id.presence || contact.id}"
      user_id = payload["user_id"].to_s.presence || contact.id.to_s
      request_payload = {
        "message" => message_text,
        "thread_id" => thread_id,
        "user_id" => user_id,
        "agent_config" => { "payload" => payload }
      }
      auth = {
        username: data["basic_username"].to_s.presence,
        password: data["basic_password"].to_s.presence
      }
      Rails.logger.info("[Flows] whatsapp_ai invoke agent=#{agent_id} server=#{server_url}")
      ai_result = invoke_ai_agent(server_url, agent_id, request_payload, auth)
      meta = {
        "agent_id" => agent_id,
        "server_url" => server_url,
        "auth_user" => auth[:username],
        "message" => message_text.to_s[0, 200],
        "chat_id" => payload["chat_id"],
        "contact_id" => contact.id
      }.compact
      if ai_result[:error].present?
        meta["response"] = ai_result[:response].to_s[0, 200] if ai_result[:response].present?
        return { status: "failed", error: ai_result[:error], meta: meta }
      end
      response_text = ai_result[:response].to_s
      if response_text.strip.empty?
        return { status: "failed", error: "IA sin respuesta", meta: meta }
      end
      meta["response"] = response_text.to_s[0, 200]
      typing_enabled = truthy?(data["start_typing"])
      interval = data["send_interval"].to_i
      interval = 5 if interval > 0 && interval < 5
      if interval > 0
        sleep interval
        meta["delay_seconds"] = interval
      end
      send_result = send_whatsapp(project_id, contact, { "message" => response_text, "start_typing" => typing_enabled })
      if send_result.is_a?(Hash)
        merged_meta = send_result[:meta].is_a?(Hash) ? send_result[:meta].merge(meta) : meta
        send_result[:meta] = merged_meta
        return send_result
      end
      { status: "finished", meta: meta }
    when "whatsapp_reminder"
      payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
      payload = payload.is_a?(Hash) ? payload : {}
      subject = payload["work_package_subject"].to_s.presence || payload["remindable_subject"].to_s
      remind_at_date = payload["remind_at_date"].to_s
      remind_at_time = payload["remind_at_time"].to_s
      link = payload["work_package_url_full"].to_s.presence || payload["work_package_url"].to_s
      note = payload["note"].to_s
      return { status: "failed", error: "Nota vacia" } if note.strip.empty?

      message_lines = []
      message_lines << "📝 Paquete de trabajo: #{subject}" if subject.present?
      message_lines << "📅 Fecha: #{remind_at_date}" if remind_at_date.present?
      message_lines << "⏰ Hora: #{remind_at_time}" if remind_at_time.present?
      message_lines << "🔗 Link: #{link}" if link.present?
      message_lines << "🗒️ Nota: #{note}"
      message = message_lines.join("\n")

      contact_ids = Array(data["contact_ids"]).map(&:to_i).reject(&:zero?)
      return { status: "failed", error: "Selecciona contactos" } if contact_ids.empty?

      interval = data["send_interval"].to_i
      interval = 5 if interval <= 0
      interval = 5 if interval < 5
      typing_enabled = truthy?(data["start_typing"])

      total = contact_ids.size
      sent = 0
      failed = 0
      errors = []

      contact_ids.each_with_index do |contact_id_value, index|
        target_contact = WhatsappContactProfile.find_by(id: contact_id_value)
        if target_contact.nil?
          failed += 1
          errors << "Contacto #{contact_id_value} no encontrado"
        else
          if target_contact.chat_id.blank? && target_contact.phone.to_s.strip.present?
            create_whatsapp_chat_for_contact(target_contact)
          end
          result = send_whatsapp(run.project_id, target_contact, { "message" => message, "start_typing" => typing_enabled })
          if result[:status] == "finished"
            sent += 1
          else
            failed += 1
            errors << (result[:error].to_s.presence || "Error al enviar a contacto #{contact_id_value}")
          end
        end
        sleep interval if index < total - 1 && interval > 0
      end

      meta = {
        total: total,
        sent: sent,
        failed: failed,
        message: message.to_s[0, 160]
      }
      if typing_enabled
        meta[:typing] = true
        meta[:typing_delay] = 3
      end

      status = sent > 0 ? "finished" : "failed"
      error = sent > 0 ? nil : errors.join("; ")
      { status: status, meta: meta, error: error }
    when "whatsapp_template"
      return { status: "failed", error: "Contacto requerido" } if contact.nil?
      Rails.logger.info("[Flows] whatsapp_template node run node_id=#{node['id']} run_id=#{run.id} contact_id=#{contact.id}")
      send_whatsapp_legacy_template(project_id, contact, data)
    when "email"
      return { status: "failed", error: "Contacto requerido" } if contact.nil?
      send_email(project_id, contact, data)
    when "email_template"
      return { status: "failed", error: "Contacto requerido" } if contact.nil?
      required_keys = node.is_a?(Hash) && node["data"].is_a?(Hash) ? node["data"]["required_keys"] : nil
      if required_keys.is_a?(Array) && required_keys.any?
        payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
        payload = payload.is_a?(Hash) ? payload : {}
        missing = required_keys.map(&:to_s).select do |key|
          value = payload[key]
          value.nil? || value.to_s.strip.empty?
        end
        if missing.any?
          return { status: "failed", error: "Faltan datos requeridos: #{missing.join(', ')}" }
        end
      end
      send_email_template(project_id, contact, data, run_id: run.id, node_id: node["id"])
    when "rate_limit"
      evaluate_rate_limit(run, node, contact)
    when "delay"
      payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
      payload = payload.is_a?(Hash) ? payload : {}
      delay_result = compute_delay_with_meta(data, project_id: run.project_id)
      delay_until = delay_result[:delay_until]
      Rails.logger.info(
        "[Flows][Delay] run_id=#{run.id} node_id=#{node['id']} now=#{Time.current.iso8601} delay_until=#{delay_until&.iso8601} night_convert=#{data['night_convert'].inspect} night_start=#{data['night_start'].inspect} night_end=#{data['night_end'].inspect} night_adjusted=#{delay_result[:night_adjusted].inspect}"
      )
      meta = {
        "delay_until" => delay_until&.iso8601,
        "amount" => data["amount"],
        "unit" => data["unit"],
        "payload" => payload,
        "night_convert" => data["night_convert"],
        "night_start" => data["night_start"],
        "night_end" => data["night_end"],
        "server_now" => Time.current.iso8601
      }
      if delay_result[:night_adjusted]
        meta["night_adjusted"] = true
        meta["night_adjust_hours"] = delay_result[:night_adjust_hours]
        meta["night_window"] = delay_result[:night_window]
      end
      meta["night_debug"] = delay_result[:night_debug] if delay_result[:night_debug]
      meta["time_zone"] = delay_result[:time_zone] if delay_result[:time_zone]
      {
        status: "finished",
        delay_until: delay_until,
        meta: meta
      }
    when "wait_until"
      delay_until = compute_wait_until(data)
      { status: "finished", delay_until: delay_until }
    when "reminder"
      payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
      payload = payload.is_a?(Hash) ? payload : {}
      remind_at_date = payload["remind_at_date"].to_s
      remind_at_time = payload["remind_at_time"].to_s
      note = payload["note"].to_s
      {
        status: "finished",
        meta: {
          remind_at_date: remind_at_date.presence,
          remind_at_time: remind_at_time.presence,
          note: note.presence
        }.compact
      }
    when "assign_owner"
      return { status: "failed", error: "Contacto requerido" } if contact.nil?
      assign_owner(contact, data)
    when "update_field"
      return { status: "failed", error: "Contacto requerido" } if contact.nil?
      update_field(contact, data)
    when "related_item"
      payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
      payload = payload.is_a?(Hash) ? payload : {}
      related_name_source = data["related_name_source"].to_s
      related_name_label = data["related_name_label"].to_s
      related_name_value = related_name_source.present? ? extract_payload_value(payload, related_name_source).to_s : ""
      work_package_type_id = data["work_package_type_id"].to_s
      work_package_type_name = data["work_package_type_name"].to_s
      if work_package_type_name.blank? && work_package_type_id.present?
        work_package_type_name = Type.find_by(id: work_package_type_id)&.name.to_s
      end
      Rails.logger.info(
        "[Flows][RelatedItem] run_id=#{run.id} node_id=#{node['id']} project_id=#{run.project_id} type_id=#{work_package_type_id.inspect} type_name=#{work_package_type_name.inspect} name_source=#{related_name_source.inspect} name_label=#{related_name_label.inspect} name_value=#{related_name_value.inspect}"
      )
      if related_name_value.to_s.strip.empty?
        return { status: "failed", error: "Nombre del paquete vacio" }
      end
      if work_package_type_id.to_s.strip.empty?
        return { status: "failed", error: "Tipo de paquete requerido" }
      end

      user = User.respond_to?(:system) ? User.system : User.admin.first
      project = Project.find_by(id: run.project_id)
      return { status: "failed", error: "Proyecto no encontrado" } if project.nil?
      return { status: "failed", error: "Usuario no disponible" } if user.nil?

      type = Type.enabled_in(project).find_by(id: work_package_type_id)
      return { status: "failed", error: "Tipo de paquete no valido" } if type.nil?

      call = WorkPackages::CreateService.new(user: user).call(
        project: project,
        type_id: type.id,
        subject: related_name_value.to_s
      )
      unless call.success?
        return { status: "failed", error: call.errors.full_messages.join(", ") }
      end
      work_package = call.result

      chat_id = payload["chat_id"].to_s.presence
      chat_id ||= contact&.chat_id.to_s.presence
      chat = chat_id.present? ? WhatsappChat.find_by(id: chat_id, project_id: project.id) : nil

      profile = contact
      if profile.nil? && chat
        profile = WhatsappContactProfile.find_by(project_id: project.id, chat_id: chat.id)
        if profile.nil? && chat.external_id.present?
          profile = WhatsappContactProfile.find_by(project_id: project.id, external_id: chat.external_id)
        end
      end

      WhatsappWorkPackageRelation.create!(
        project: project,
        chat: chat,
        contact_profile: profile,
        work_package: work_package,
        created_by: user
      )

      if payload.is_a?(Hash)
        payload_updates = {
          "work_package_id" => work_package.id,
          "work_package_subject" => work_package.subject.to_s
        }
        metadata = run.metadata.is_a?(Hash) ? run.metadata.dup : {}
        metadata["payload"] = payload.merge(payload_updates)
        run.update(metadata: metadata)
      end

      {
        status: "finished",
        meta: {
          work_package_type_id: work_package_type_id.presence,
          work_package_type_name: work_package_type_name.presence,
          related_name_source: related_name_source.presence,
          related_name_label: related_name_label.presence,
          related_name_value: related_name_value.presence,
          work_package_id: work_package&.id,
          work_package_subject: work_package&.subject.to_s
        }
      }
    when "related_board"
      payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
      payload = payload.is_a?(Hash) ? payload : {}
      work_package_id = payload["work_package_id"].to_s.presence
      work_package_subject = payload["work_package_subject"].to_s.presence
      return { status: "failed", error: "Falta Paquete ID" } if work_package_id.blank?
      return { status: "failed", error: "Falta Asunto" } if work_package_subject.blank?

      board_id = data["board_id"].to_s
      query_id = data["query_id"].to_s
      return { status: "failed", error: "Selecciona un tablero" } if board_id.blank?
      return { status: "failed", error: "Selecciona una lista" } if query_id.blank?

      user = User.respond_to?(:system) ? User.system : User.admin.first
      project = Project.find_by(id: run.project_id)
      return { status: "failed", error: "Proyecto no encontrado" } if project.nil?
      return { status: "failed", error: "Usuario no disponible" } if user.nil?

      board = Boards::Grid.find_by(id: board_id, project: project)
      return { status: "failed", error: "Tablero no encontrado" } if board.nil?

      work_package = WorkPackage.find_by(id: work_package_id, project_id: project.id)
      return { status: "failed", error: "Paquete no encontrado" } if work_package.nil?

      query_ids = board.widgets.map { |w| w.options["queryId"] || w.options["query_id"] }.compact.map(&:to_i)
      return { status: "failed", error: "Lista no encontrada" } unless query_ids.include?(query_id.to_i)

      query = Query.find_by(id: query_id)
      return { status: "failed", error: "Lista no encontrada" } if query.nil?

      chat_id = payload["chat_id"].to_s.presence
      chat_id ||= contact&.chat_id.to_s.presence
      chat = chat_id.present? ? WhatsappChat.find_by(id: chat_id, project_id: project.id) : nil
      profile = contact
      if profile.nil? && chat
        profile = WhatsappContactProfile.find_by(project_id: project.id, chat_id: chat.id)
        if profile.nil? && chat.external_id.present?
          profile = WhatsappContactProfile.find_by(project_id: project.id, external_id: chat.external_id)
        end
      end

      existing = query.ordered_work_packages.find_by(work_package_id: work_package.id)
      unless existing
        position = query.ordered_work_packages.maximum(:position)
        next_position = position ? position + 1 : 0
        query.ordered_work_packages.create!(work_package: work_package, position: next_position)
      end

      relation = WhatsappBoardCardRelation.create!(
        project: project,
        chat: chat,
        contact_profile: profile,
        board: board,
        query: query,
        work_package: work_package,
        created_by: user
      )

      {
        status: "finished",
        meta: {
          board_id: board.id,
          board_name: board.name.to_s,
          list_name: query.name.to_s,
          work_package_id: work_package.id,
          work_package_subject: work_package.subject.to_s,
          relation_id: relation.id
        }
      }
    when "add_tag"
      return { status: "failed", error: "Contacto requerido" } if contact.nil?
      add_tags(contact, data)
    when "webhook"
      call_webhook(contact, data)
    else
      { status: "failed", error: "Tipo de nodo no soportado: #{type}" }
    end
  end

  def transform_json(run, contact, data, node = nil)
    payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
    if payload.is_a?(Hash)
      data_keys = payload["data"].is_a?(Hash) ? payload["data"].keys : []
      Rails.logger.info(
        "[CRM] payload keys=#{payload.keys.map(&:to_s).sort.join(',')} data_keys=#{data_keys.map(&:to_s).sort.join(',')}"
      )
    end
    if payload.is_a?(Hash)
      raw_phone = payload["phone"].to_s.presence || payload["phone_number"].to_s.presence
      raw_phone ||= payload.dig("contact", "phone").to_s.presence
      raw_phone ||= payload.dig("submission", "Phone Number").to_s.presence
      raw_phone ||= payload.dig("submission", "Telefono").to_s.presence
      if raw_phone.present?
        Rails.logger.info("[CRM] payload phone raw=#{raw_phone.inspect}")
      else
        Rails.logger.info("[CRM] payload phone raw=nil")
      end
    end
    return { status: "failed", error: "Payload invalido para Agregar a CRM", path: "no" } unless payload.is_a?(Hash)

    mappings = data["mappings"].is_a?(Array) ? data["mappings"] : []
    active_mappings = mappings.select do |mapping|
      mapping.is_a?(Hash) && mapping["source"].to_s.strip.present? && mapping["target"].to_s.strip.present?
    end
    if active_mappings.empty?
      return { status: "failed", error: "Debe agregar al menos un mapeo", path: "no", meta: { skipped: "no_mappings" } }
    end
    mappings = active_mappings
    Rails.logger.info("[CRM] mappings count=#{mappings.size} targets=#{mappings.map { |m| m['target'] }.compact.join(',')}")
    selected_work_package_type_id = data["work_package_type_id"].to_s.presence
    selected_board_id = data["board_id"].to_s.presence
    selected_query_id = data["query_id"].to_s.presence
    selected_tag_name = data["crm_tag_name"].to_s.strip.presence
    selected_assigned_to_id = data["assigned_to_id"].to_i
    selected_assigned_to_id = nil if selected_assigned_to_id <= 0
    assigned_user = selected_assigned_to_id ? User.find_by(id: selected_assigned_to_id) : nil
    selected_assigned_to_name = assigned_user&.name.to_s.presence
    registration_at, registration_source = extract_registration_timestamp(payload, mappings)
    effective_registration_at = registration_at || Time.current
    effective_registration_source = registration_source.presence || "system_now"
    Rails.logger.info(
      "[CRM] registration_at effective source=#{effective_registration_source} value=#{effective_registration_at.iso8601}"
    )

    unresolved_sources = mappings.each_with_object([]) do |mapping, memo|
      source = mapping["source"].to_s.strip
      next if source.blank?
      value = extract_payload_value(payload, source)
      blank_value =
        value.nil? ||
        (value.is_a?(String) && value.strip.empty?) ||
        (value.respond_to?(:empty?) && !value.is_a?(Numeric) && value.empty?)
      memo << source if blank_value
    end
    if unresolved_sources.any?
      meta_payload = if run.metadata.is_a?(Hash) && run.metadata["payload"].is_a?(Hash)
                       run.metadata["payload"]
                     else
                       payload
                     end
      return {
        status: "skipped",
        path: "no",
        error: "No aplica para este payload (faltan: #{unresolved_sources.uniq.join(', ')})",
        meta: {
          skipped: "mapping_not_applicable",
          unresolved_sources: unresolved_sources.uniq,
          payload: meta_payload
        }
      }
    end

    email_value = nil
    phone_value = nil
    name_updates = {}
    applied_fields = []
    applied_custom = []
    applied_values = {}
    applied_custom_values = {}
    mappings.each do |mapping|
      next unless mapping["target_type"].to_s == "field"
      source = mapping["source"].to_s.strip
      target = mapping["target"].to_s.strip
      if source.present?
        value = extract_payload_value(payload, source)
        if value.present?
          Rails.logger.info(
            "[CRM] map field source=#{source.inspect} target=#{target.inspect} value=#{value.to_s.inspect}"
          )
        end
        if value.present?
          if target == "phone"
            phone_value = value
          elsif target == "first_name" || target == "last_name" || target == "name"
            field_key = target == "name" ? "first_name" : target
            name_updates[field_key] = normalize_payload_value(value)
          end
        end
      end
      next unless mapping["target"].to_s == "email"
      next if source.blank?
      if email_value.blank?
        email_value = extract_payload_value(payload, source)
      end
    end
    Rails.logger.info(
      "[CRM] transform_json flow_run=#{run.id} contact_id=#{contact&.id} email=#{email_value.to_s.inspect} phone=#{phone_value.to_s.inspect} chat_id=#{payload['chat_id'].to_s.inspect}"
    )

    duplicate_contact = nil
    duplicate_reason = nil
    chat_id = payload["chat_id"].to_s.presence || payload["chatId"].to_s.presence
    if chat_id.present?
      chat = WhatsappChat.find_by(id: chat_id, project_id: run.project_id)
      if chat
        duplicate_contact = WhatsappContactProfile.find_by(project_id: run.project_id, chat_id: chat.id)
        duplicate_reason = "chat_id" if duplicate_contact
      end
    end

    if duplicate_contact.nil? && email_value.present?
      existing_by_email = WhatsappContactProfile.find_by(project_id: run.project_id, email: email_value.to_s)
      if existing_by_email && (!contact || existing_by_email.id != contact.id)
        duplicate_contact = existing_by_email
        duplicate_reason = "email"
      end
    end

    if duplicate_contact.nil? && phone_value.present?
      existing_by_phone = WhatsappContactProfile.find_by(project_id: run.project_id, phone: phone_value.to_s)
      if existing_by_phone && (!contact || existing_by_phone.id != contact.id)
        duplicate_contact = existing_by_phone
        duplicate_reason = "phone"
      else
        candidate_external_id = build_external_id_from_phone(phone_value)
        Rails.logger.info(
          "[CRM] phone check flow_run=#{run.id} phone=#{phone_value.to_s.inspect} external_id=#{candidate_external_id.to_s.inspect}"
        )
        if candidate_external_id.present?
          duplicate_contact = WhatsappContactProfile.find_by(project_id: run.project_id, external_id: candidate_external_id)
          duplicate_reason = "phone" if duplicate_contact
        end
      end
    end

      if duplicate_contact
        Rails.logger.info(
          "[CRM] duplicate detected flow_run=#{run.id} contact_id=#{duplicate_contact.id} reason=#{duplicate_reason} chat_id=#{duplicate_contact.chat_id.inspect} external_id=#{duplicate_contact.external_id.to_s.inspect}"
        )
      updates_for_duplicate = name_updates.dup
      updates_for_duplicate["email"] = email_value.to_s if email_value.present?
      updates_for_duplicate["assigned_to_id"] = selected_assigned_to_id if selected_assigned_to_id
      duplicate_values = updates_for_duplicate.dup
      if updates_for_duplicate.present?
        duplicate_contact.update(updates_for_duplicate)
      end
      duplicate_contact.update_columns(created_at: effective_registration_at, updated_at: Time.current)
      duplicate_contact.reload
      Rails.logger.info(
        "[CRM] duplicate created_at updated contact_id=#{duplicate_contact.id} created_at=#{duplicate_contact.created_at&.iso8601}"
      )
      if duplicate_contact.chat_id.present?
        WhatsappChat.where(id: duplicate_contact.chat_id).update_all(last_message_at: Time.current)
      elsif duplicate_contact.external_id.present?
        WhatsappChat.where(project_id: duplicate_contact.project_id, external_id: duplicate_contact.external_id.to_s)
                    .update_all(last_message_at: Time.current)
        create_whatsapp_chat_for_contact(duplicate_contact)
        duplicate_contact.reload
      elsif phone_value.present? || duplicate_contact.phone.to_s.present?
        create_whatsapp_chat_for_contact(duplicate_contact)
        duplicate_contact.reload
      end
        if chat_id.present?
          WhatsappChat.where(id: chat_id, project_id: run.project_id).update_all(last_message_at: Time.current)
        elsif phone_value.present?
          candidate_external_id = build_external_id_from_phone(phone_value)
          if candidate_external_id.present?
            WhatsappChat.where(project_id: run.project_id, external_id: candidate_external_id.to_s)
                        .update_all(last_message_at: Time.current)
          end
        end
        project = Project.find_by(id: run.project_id)
        user = User.respond_to?(:system) ? User.system : User.admin.first
        work_package = nil
        if project && user
          chat_for_wp = if duplicate_contact.chat_id.present?
                          WhatsappChat.find_by(id: duplicate_contact.chat_id, project_id: project.id)
                        elsif duplicate_contact.external_id.present?
                          WhatsappChat.find_by(project_id: project.id, external_id: duplicate_contact.external_id.to_s)
                        end
          relation = Whatsapp::AutoWorkPackageService
            .new(
              project: project,
              contact_profile: duplicate_contact,
              chat: chat_for_wp,
              user: user,
              work_package_type_id: selected_work_package_type_id
            )
            .call(contact_was_new: false)
          work_package = relation&.work_package
          board_meta = attach_work_package_to_board(
            project: project,
            work_package: work_package,
            board_id: selected_board_id,
            query_id: selected_query_id,
            chat: chat_for_wp,
            contact_profile: duplicate_contact,
            user: user
          )
        end
        tag_meta = apply_contact_tag(duplicate_contact, selected_tag_name)
        meta_payload = if run.metadata.is_a?(Hash) && run.metadata["payload"].is_a?(Hash)
                         run.metadata["payload"]
                       else
                         payload
                       end
        meta = {
          duplicate: true,
          duplicate_reason: duplicate_reason,
          updated_fields: updates_for_duplicate.keys,
          updated_values: duplicate_values,
          updated_custom_fields: [],
          updated_custom_values: {},
          work_package_type_id: work_package&.type_id || selected_work_package_type_id,
          work_package_type_name: work_package&.type&.name.to_s.presence || data["work_package_type_name"].to_s.presence,
          assigned_to_id: selected_assigned_to_id,
          assigned_to_name: selected_assigned_to_name,
          work_package_id: work_package&.id,
          work_package_subject: work_package&.subject.to_s.presence,
          registration_at: effective_registration_at&.iso8601,
          registration_source: effective_registration_source,
          payload: meta_payload
        }
        meta.merge!(board_meta) if board_meta.is_a?(Hash)
        meta.merge!(tag_meta) if tag_meta.is_a?(Hash)
      if payload.is_a?(Hash)
        payload_updates = {}
        payload_updates["contact_id"] = duplicate_contact.id if payload["contact_id"].blank?
        payload_updates["email"] = duplicate_contact.email.to_s.presence || email_value.to_s.presence if payload["email"].blank?
        payload_updates["phone"] = duplicate_contact.phone.to_s.presence || phone_value.to_s.presence if payload["phone"].blank?
        payload_updates["first_name"] = duplicate_contact.first_name.to_s.presence if payload["first_name"].blank?
        payload_updates["chat_id"] = duplicate_contact.chat_id if payload["chat_id"].blank? && duplicate_contact.chat_id.present?
        if payload_updates.any?
          metadata = run.metadata.is_a?(Hash) ? run.metadata.dup : {}
          metadata["payload"] = payload.merge(payload_updates)
          run.update(metadata: metadata)
        end
      end
      create_crm_trace_history(
        run: run,
        contact: duplicate_contact,
        node: node,
        status: "finished",
        path: "no",
        duplicate: true,
        meta: meta
      )
      return { status: "finished", path: "no", contact_id: duplicate_contact.id, meta: meta }
    end

    created_contact = false
    restored_contact = false
    chat_created = false
    chat_linked = false
    chat_bumped = false
    if contact.nil? && email_value.present?
      contact = WhatsappContactProfile.where(project_id: run.project_id, email: email_value.to_s).first
      if contact.nil?
        create_attrs = { project_id: run.project_id, email: email_value.to_s }
        create_attrs[:created_at] = effective_registration_at
        create_attrs[:updated_at] = Time.current
        contact = WhatsappContactProfile.create!(create_attrs)
        created_contact = true
      elsif contact.deleted_at.present?
        contact.update(deleted_at: nil)
        restored_contact = true
      end
    end

    updates = {}
    custom_updates = contact&.custom_fields.is_a?(Hash) ? contact.custom_fields.dup : {}
    variables = run.metadata.is_a?(Hash) ? (run.metadata["variables"].is_a?(Hash) ? run.metadata["variables"].dup : {}) : {}

    mappings.each do |mapping|
      source = mapping["source"].to_s.strip
      target_type = mapping["target_type"].to_s.presence || "field"
      target = mapping["target"].to_s.strip
      next if source.blank? || target.blank?

      value = extract_payload_value(payload, source)
      next if value.nil?

      if target_type == "variable"
        variables[target] = value
      else
        next unless contact
        if target.start_with?("custom:")
          key = target.delete_prefix("custom:").to_s
          normalized = normalize_payload_value(value)
          custom_updates[key] = normalized
          applied_custom << key
          applied_custom_values[key] = normalized
        else
          normalized = normalize_payload_value(value)
          updates[target] = normalized
          applied_fields << target
          applied_values[target] = normalized
        end
      end
    end

    if contact
      contact.update_columns(created_at: effective_registration_at, updated_at: Time.current)
      contact.reload
      Rails.logger.info(
        "[CRM] contact created_at updated contact_id=#{contact.id} created_at=#{contact.created_at&.iso8601}"
      )
      if selected_assigned_to_id
        updates["assigned_to_id"] = selected_assigned_to_id
        applied_fields << "assigned_to_id"
        applied_values["assigned_to_id"] = selected_assigned_to_id
      end
      if contact.external_id.blank?
        candidate_external_id = build_external_id_from_phone(
          updates["phone"] || updates[:phone] || contact.phone || payload["phone"]
        )
        if candidate_external_id.present?
          taken = WhatsappContactProfile.where(project_id: contact.project_id, external_id: candidate_external_id)
                                          .where.not(id: contact.id)
                                          .exists?
          updates[:external_id] = candidate_external_id unless taken
        end
      elsif (updates.key?("phone") || updates.key?(:phone)) && updates["phone"].to_s != contact.phone.to_s
        candidate_external_id = build_external_id_from_phone(updates["phone"] || updates[:phone])
        if candidate_external_id.present?
          taken = WhatsappContactProfile.where(project_id: contact.project_id, external_id: candidate_external_id)
                                          .where.not(id: contact.id)
                                          .exists?
          updates[:external_id] = candidate_external_id unless taken
        end
      end

      if updates.present? || custom_updates.present?
        updates[:custom_fields] = custom_updates if custom_updates.present?
        contact.update(updates)
      end
    end
    tag_meta = apply_contact_tag(contact, selected_tag_name)

      work_package = nil
      if contact
        sync_contact_external_id_from_phone(contact)
        result = create_whatsapp_chat_for_contact(contact)
        chat_created = result[:created]
        chat_linked = result[:linked]
        chat_bumped = result[:bumped]
        duplicate_chat = result[:duplicate_chat]
        project = Project.find_by(id: run.project_id)
        user = User.respond_to?(:system) ? User.system : User.admin.first
        if project && user
          chat_for_wp = contact.chat_id.present? ? WhatsappChat.find_by(id: contact.chat_id, project_id: project.id) : nil
          relation = Whatsapp::AutoWorkPackageService
            .new(
              project: project,
              contact_profile: contact,
              chat: chat_for_wp,
              user: user,
              work_package_type_id: selected_work_package_type_id
            )
            .call(contact_was_new: created_contact)
          work_package = relation&.work_package
          board_meta = attach_work_package_to_board(
            project: project,
            work_package: work_package,
            board_id: selected_board_id,
            query_id: selected_query_id,
            chat: chat_for_wp,
            contact_profile: contact,
            user: user
          )
        end
        if payload.is_a?(Hash)
          payload_updates = {}
          payload_updates["contact_id"] = contact.id if payload["contact_id"].blank?
        payload_updates["email"] = contact.email.to_s.presence || email_value.to_s.presence if payload["email"].blank?
        payload_updates["phone"] = contact.phone.to_s.presence || phone_value.to_s.presence if payload["phone"].blank?
        payload_updates["first_name"] = contact.first_name.to_s.presence if payload["first_name"].blank?
        payload_updates["chat_id"] = contact.chat_id if payload["chat_id"].blank? && contact.chat_id.present?
        if payload_updates.any?
          metadata = run.metadata.is_a?(Hash) ? run.metadata.dup : {}
          metadata["payload"] = payload.merge(payload_updates)
          run.update(metadata: metadata)
        end
      end
        if duplicate_chat
          meta_payload = if run.metadata.is_a?(Hash) && run.metadata["payload"].is_a?(Hash)
                           run.metadata["payload"]
                         else
                           payload
                         end
          meta = {
            created_contact: created_contact,
            restored_contact: restored_contact,
            updated_fields: applied_fields.uniq,
            updated_custom_fields: applied_custom.uniq,
            updated_values: applied_values,
            updated_custom_values: applied_custom_values,
            chat_created: chat_created,
            chat_linked: chat_linked,
            chat_bumped: chat_bumped,
            duplicate_chat: true,
            work_package_type_id: work_package&.type_id || selected_work_package_type_id,
            work_package_type_name: work_package&.type&.name.to_s.presence || data["work_package_type_name"].to_s.presence,
            assigned_to_id: selected_assigned_to_id,
            assigned_to_name: selected_assigned_to_name,
            work_package_id: work_package&.id,
            work_package_subject: work_package&.subject.to_s.presence,
            payload: meta_payload
          }
          meta.merge!(board_meta) if board_meta.is_a?(Hash)
          meta.merge!(tag_meta) if tag_meta.is_a?(Hash)
          create_crm_trace_history(
            run: run,
            contact: contact,
            node: node,
            status: "finished",
            path: "no",
            duplicate: true,
            meta: meta
          )
          return { status: "finished", path: "no", contact_id: contact&.id, meta: meta }
        end
      end

    if contact.nil?
      meta_payload = if run.metadata.is_a?(Hash) && run.metadata["payload"].is_a?(Hash)
                       run.metadata["payload"]
                     else
                       payload
                     end
      return {
        status: "failed",
        path: "no",
        error: "Contacto no resuelto en Agregar a CRM",
        meta: {
          updated_fields: applied_fields.uniq,
          updated_custom_fields: applied_custom.uniq,
          updated_values: applied_values,
          updated_custom_values: applied_custom_values,
          payload: meta_payload
        }
      }
    end

    if variables.present?
      metadata = run.metadata.is_a?(Hash) ? run.metadata.dup : {}
      metadata["variables"] = variables
      run.update(metadata: metadata)
    end

    final_payload = if run.metadata.is_a?(Hash) && run.metadata["payload"].is_a?(Hash)
                      run.metadata["payload"]
                    else
                      payload
                    end

      meta = {
        created_contact: created_contact,
        restored_contact: restored_contact,
        updated_fields: applied_fields.uniq,
        updated_custom_fields: applied_custom.uniq,
        updated_values: applied_values,
        updated_custom_values: applied_custom_values,
        chat_created: chat_created,
        chat_linked: chat_linked,
        chat_bumped: chat_bumped,
        work_package_type_id: work_package&.type_id || selected_work_package_type_id,
        work_package_type_name: work_package&.type&.name.to_s.presence || data["work_package_type_name"].to_s.presence,
        assigned_to_id: selected_assigned_to_id,
        assigned_to_name: selected_assigned_to_name,
        work_package_id: work_package&.id,
        work_package_subject: work_package&.subject.to_s.presence,
        registration_at: effective_registration_at&.iso8601,
        registration_source: effective_registration_source,
        payload: final_payload
      }
    meta.merge!(board_meta) if board_meta.is_a?(Hash)
    meta.merge!(tag_meta) if tag_meta.is_a?(Hash)
    final_path = created_contact ? "yes" : "no"
    create_crm_trace_history(
      run: run,
      contact: contact,
      node: node,
      status: "finished",
      path: final_path,
      duplicate: !created_contact,
      meta: meta
    )
    { status: "finished", path: final_path, contact_id: contact&.id, meta: meta }
  rescue StandardError => error
    { status: "failed", error: error.message, path: "no" }
  end

  def attach_work_package_to_board(project:, work_package:, board_id:, query_id:, chat:, contact_profile:, user:)
    return {} if project.nil? || work_package.nil?
    return {} if board_id.to_s.blank? || query_id.to_s.blank?

    board = Boards::Grid.find_by(id: board_id, project: project)
    return { board_error: "Tablero no encontrado" } if board.nil?

    query_ids = board.widgets.map { |w| w.options["queryId"] || w.options["query_id"] }.compact.map(&:to_i)
    return { board_error: "Lista no encontrada" } unless query_ids.include?(query_id.to_i)

    query = Query.find_by(id: query_id)
    return { board_error: "Lista no encontrada" } if query.nil?

    existing = query.ordered_work_packages.find_by(work_package_id: work_package.id)
    unless existing
      position = query.ordered_work_packages.maximum(:position)
      next_position = position ? position + 1 : 0
      query.ordered_work_packages.create!(work_package: work_package, position: next_position)
    end

    relation_scope = WhatsappBoardCardRelation.where(
      project: project,
      board: board,
      query: query,
      work_package: work_package
    )
    relation_scope = relation_scope.where(chat_id: chat&.id) if chat
    relation_scope = relation_scope.where(contact_profile_id: contact_profile&.id) if contact_profile
    relation = relation_scope.first
    relation ||= WhatsappBoardCardRelation.create!(
      project: project,
      chat: chat,
      contact_profile: contact_profile,
      board: board,
      query: query,
      work_package: work_package,
      created_by: user
    )

    {
      board_id: board.id,
      board_name: board.name.to_s,
      list_name: query.name.to_s,
      relation_id: relation.id
    }
  rescue StandardError => error
    { board_error: error.message.to_s }
  end

  def normalize_payload_value(value)
    return value if value.is_a?(String) || value.is_a?(Numeric) || value == true || value == false
    value.is_a?(Array) || value.is_a?(Hash) ? value.to_json : value.to_s
  end

  def apply_contact_tag(contact, tag_name)
    return {} if contact.nil? || tag_name.to_s.strip.blank?

    normalized_tag = tag_name.to_s.strip
    current = contact.tags.is_a?(Array) ? contact.tags : []
    merged = (current + [normalized_tag]).map(&:to_s).map(&:strip).reject(&:blank?).uniq
    contact.update(tags: merged) if merged != current

    {
      crm_tag_name: normalized_tag,
      tags: merged.join(", ")
    }
  rescue StandardError => error
    {
      crm_tag_name: tag_name.to_s.strip.presence,
      tag_error: error.message.to_s
    }
  end

  def extract_payload_value(payload, path)
    return if payload.blank? || path.blank?
    direct = payload[path] if payload.key?(path)
    return direct if direct.present?

    value = resolve_payload_path(payload, path)
    return value if value.present?

    payload_source_aliases(path).each do |candidate_path|
      next if candidate_path.blank? || candidate_path.to_s == path.to_s

      candidate_direct = payload[candidate_path] if payload.key?(candidate_path)
      return candidate_direct if candidate_direct.present?

      candidate_value = resolve_payload_path(payload, candidate_path)
      return candidate_value if candidate_value.present?
    end

    nil
  end

  def resolve_payload_path(payload, path)
    keys = path.to_s.split(".").map(&:strip).reject(&:blank?)
    return nil if keys.empty?

    keys.reduce(payload) do |memo, key|
      break if memo.nil?
      next memo[key] if memo.is_a?(Hash) && memo.key?(key)
      next memo[key.to_sym] if memo.is_a?(Hash) && memo.key?(key.to_sym)
      nil
    end
  end

  def payload_source_aliases(path)
    normalized = normalize_source_path(path)
    aliases = {
      "submissionnombresyapellidos" => [
        "submission.nombres y apellidos",
        "submission.nombres_y_apellidos",
        "submission.nombre",
        "submission.name",
        "submission.first_name",
        "submission.nombre",
        "submission.nombres y apellidos"
      ],
      "submissionemail" => [
        "submission.email",
        "submission.correo",
        "submission.correo_electronico"
      ],
      "submissionphonenumber" => [
        "submission.phone_number",
        "submission.phone number",
        "submission.telefono",
        "submission.phone"
      ]
    }
    aliases[normalized] || []
  end

  def normalize_source_path(value)
    ActiveSupport::Inflector
      .transliterate(value.to_s)
      .downcase
      .gsub(/[^a-z0-9]+/, "")
  end

  def extract_registration_timestamp(payload, mappings)
    return [nil, nil] unless payload.is_a?(Hash)

    mapping_source = Array(mappings).find do |mapping|
      next false unless mapping.is_a?(Hash)
      target = mapping["target"].to_s.strip
      target.in?(%w[created_at registration_date])
    end&.dig("source").to_s.strip

    candidate_sources = []
    candidate_sources << mapping_source if mapping_source.present?
    candidate_sources.concat(
      [
        "created_at",
        "createdAt",
        "fecha",
        "fecha_actual",
        "fecha_registro",
        "fecha_de_registro",
        "registration",
        "registration_date",
        "registrationDate",
        "submitted_at",
        "submittedAt",
        "timestamp",
        "current_date",
        "currentDate",
        "data.fecha",
        "data.fecha_actual",
        "data.fecha_registro",
        "data.created_at",
        "data.createdAt",
        "data.registration_date",
        "data.timestamp",
        "submission.created_at",
        "submission.createdAt",
        "submission.registration_date",
        "submission.timestamp"
      ]
    )

    candidate_sources.each do |source|
      raw = extract_payload_value(payload, source)
      next if raw.nil? || raw.to_s.strip.empty?
      parsed = parse_registration_time(raw)
      return [parsed, source] if parsed
    end

    [nil, nil]
  rescue StandardError
    [nil, nil]
  end

  def parse_registration_time(raw)
    return nil if raw.nil?
    return raw.in_time_zone if raw.respond_to?(:in_time_zone)

    text = raw.to_s.strip
    return nil if text.empty?

    if text.match?(/\A\d+(\.\d+)?\z/)
      numeric = text.to_f
      return nil if numeric <= 0
      # Handle epoch milliseconds vs seconds.
      numeric /= 1000.0 if numeric > 10_000_000_000
      return Time.zone.at(numeric)
    end

    Time.zone.parse(text)
  rescue StandardError
    nil
  end

  def create_crm_trace_history(run:, contact:, node:, status:, path:, duplicate:, meta:)
    return if run.nil? || contact.nil?

    node_meta = meta.is_a?(Hash) ? meta : {}
    tag_name = node_meta["crm_tag_name"].to_s.presence || node_meta[:crm_tag_name].to_s.presence
    tag_name ||= "Sin etiqueta"
    event_payload = {
      title: "Contacto actualizado - #{tag_name}",
      flow_run_id: run.id,
      flow_definition_id: run.flow_definition_id,
      node_id: node.is_a?(Hash) ? node["id"].to_s : "",
      status: status.to_s,
      path: path.to_s,
      duplicate: !!duplicate,
      changes: node_meta
    }

    attrs = {
      project_id: run.project_id,
      created_by: (User.respond_to?(:system) ? User.system : nil),
      outcome: "Actualizacion CRM",
      note: "",
      call_duration: "00:00:00",
      logged_at: Time.current
    }
    if WhatsappCallHistory.column_names.include?("event_type")
      attrs[:event_type] = "crm_trace"
    end
    if WhatsappCallHistory.column_names.include?("event_meta")
      attrs[:event_meta] = event_payload
    else
      attrs[:note] = event_payload.to_json[0, 5000]
    end
    contact.call_histories.create!(attrs)
  rescue StandardError => error
    Rails.logger.warn("[CRM][Trace] history_create_failed run_id=#{run&.id} contact_id=#{contact&.id} error=#{error.message}")
  end

  def create_whatsapp_chat_for_contact(contact)
    return if contact.nil?
    title = contact.first_name.to_s.presence || contact.email.to_s.presence || contact.phone.to_s.presence || "Contacto"
    phone_external_id = build_external_id_from_phone(contact.phone)
    desired_external_id = phone_external_id.presence ||
                          contact.external_id.to_s.presence ||
                          "crm:#{contact.id}"

    chat = WhatsappChat.find_by(project_id: contact.project_id, external_id: desired_external_id)
    created = false
    linked = false
    bumped = false
    if chat.nil? && contact.chat_id.present?
      chat = WhatsappChat.find_by(id: contact.chat_id, project_id: contact.project_id)
    end

    if chat
      if chat.external_id.blank? && desired_external_id.present?
        conflict = WhatsappChat.where(project_id: contact.project_id, external_id: desired_external_id)
                                .where.not(id: chat.id)
                                .exists?
        chat.update(external_id: desired_external_id) unless conflict
      end
      if phone_external_id.present? && chat.external_id.to_s != phone_external_id.to_s
        conflict = WhatsappChat.where(project_id: contact.project_id, external_id: phone_external_id.to_s)
                                .where.not(id: chat.id)
                                .exists?
        chat.update(external_id: phone_external_id) unless conflict
      end
      chat.update(last_message_at: Time.current)
      bumped = true
    else
      chat = WhatsappChat.create!(
        project_id: contact.project_id,
        title: title,
        chat_type: "direct",
        external_id: desired_external_id
      )
      created = true
    end

    duplicate_chat = false
    if contact.chat_id != chat.id
      begin
        contact.update(chat_id: chat.id)
        linked = true
      rescue ActiveRecord::RecordNotUnique, PG::UniqueViolation
        duplicate_chat = true
      end
    end
    if chat.external_id.present?
      conflict = WhatsappContactProfile.where(project_id: contact.project_id, external_id: chat.external_id.to_s)
                                        .where.not(id: contact.id)
                                        .exists?
      contact.update(external_id: chat.external_id) unless conflict
    end
    { created: created, linked: linked, bumped: bumped, duplicate_chat: duplicate_chat }
  end

  def sync_contact_external_id_from_phone(contact)
    return if contact.nil?
    candidate = build_external_id_from_phone(contact.phone)
    return if candidate.blank?
    return if candidate.to_s == contact.external_id.to_s
    conflict = WhatsappContactProfile.where(project_id: contact.project_id, external_id: candidate.to_s)
                                      .where.not(id: contact.id)
                                      .exists?
    return if conflict
    contact.update(external_id: candidate)
  end

  def build_external_id_from_phone(value)
    raw = value.to_s.strip
    return if raw.blank?
    return normalize_whatsapp_external_id(raw) if raw.include?("@")

    digits = raw.gsub(/\D/, "")
    return if digits.blank?
    "#{digits}@c.us"
  end

  def normalize_whatsapp_external_id(value)
    cleaned = value.to_s.strip
    cleaned = cleaned.sub("@s.whatsapp.net", "@c.us")
    cleaned = cleaned.sub(/\A\+/, "")
    return if cleaned.blank?
    cleaned
  end

  def mark_webhook_event_processed(run)
    return unless run&.metadata.is_a?(Hash)
    event_id = run.metadata["webhook_event_id"]
    return if event_id.blank?
    FlowWebhookEvent.where(id: event_id).update_all(status: "processed")
  end

  def evaluate_filter(contact, data)
    field = data["field"].to_s
    operator = data["operator"].to_s.presence || "equals"
    value = data["value"].to_s

    current = if field.start_with?("custom:")
                key = field.delete_prefix("custom:")
                custom = contact.custom_fields.is_a?(Hash) ? contact.custom_fields : {}
                custom[key]
              elsif contact.respond_to?(field)
                contact.public_send(field)
              else
                nil
              end

    current_value = current.is_a?(Array) ? current.join(",") : current.to_s
    case operator
    when "contains"
      current_value.downcase.include?(value.downcase)
    when "starts_with"
      current_value.downcase.start_with?(value.downcase)
    when "ends_with"
      current_value.downcase.end_with?(value.downcase)
    when "greater_than"
      current_value.to_f > value.to_f
    when "less_than"
      current_value.to_f < value.to_f
    when "is_blank"
      current_value.strip.empty?
    when "is_not_blank"
      !current_value.strip.empty?
    else
      current_value.downcase == value.downcase
    end
  rescue StandardError
    false
  end

  def evaluate_condition(contact, data)
    mode = data["mode"].to_s == "any" ? "any" : "all"
    rules = data["rules"].is_a?(Array) ? data["rules"] : []
    return false if rules.empty?
    results = rules.map { |rule| evaluate_filter(contact, rule) }
    mode == "any" ? results.any? : results.all?
  end

  def compute_delay(data, project_id: nil)
    compute_delay_with_meta(data, project_id: project_id)[:delay_until]
  end

  def compute_delay_with_meta(data, project_id: nil)
    amount = data["amount"].to_i
    amount = 1 if amount <= 0
    unit = data["unit"].to_s
    seconds =
      case unit
      when "seconds" then amount.seconds
      when "hours" then amount.hours
      when "days" then amount.days
      else amount.minutes
      end
    delay_until = Time.current + seconds
    night_adjusted = false
    night_adjust_hours = nil
    night_window = nil
    night_debug = nil
    time_zone = nil

    if truthy?(data["night_convert"])
      time_zone = WhatsappProjectSetting.find_by(project_id: project_id)&.time_zone.to_s.presence
      zone = time_zone.present? ? ActiveSupport::TimeZone[time_zone] : Time.zone
      zone ||= Time.zone
      start_value = data["night_start"]
      end_value = data["night_end"]
      start_minutes = parse_time_minutes(start_value)
      end_minutes = parse_time_minutes(end_value)
      if start_minutes && end_minutes
        zoned_delay = delay_until.in_time_zone(zone)
        base_date = zoned_delay.to_date
        start_time = zone.parse("#{base_date} #{start_value}") rescue nil
        end_time = zone.parse("#{base_date} #{end_value}") rescue nil
        start_time ||= zoned_delay.change(hour: (start_minutes / 60).to_i, min: (start_minutes % 60).to_i, sec: 0)
        end_time ||= zoned_delay.change(hour: (end_minutes / 60).to_i, min: (end_minutes % 60).to_i, sec: 0)
        end_time += 1.day if end_time < start_time
        in_window = zoned_delay >= start_time && zoned_delay <= end_time
        if in_window
          delay_until += 12.hours
          night_adjusted = true
          night_adjust_hours = 12
          night_window = "#{start_value}-#{end_value}"
        end
        night_debug = {
          "time_zone" => zone&.name.to_s,
          "start_value" => start_value.to_s,
          "end_value" => end_value.to_s,
          "start_time" => start_time.iso8601,
          "end_time" => end_time.iso8601,
          "delay_until_before" => (delay_until - (night_adjusted ? 12.hours : 0)).iso8601,
          "in_window" => in_window
        }
      end
    end

    {
      delay_until: delay_until,
      night_adjusted: night_adjusted,
      night_adjust_hours: night_adjust_hours,
      night_window: night_window,
      night_debug: night_debug,
      time_zone: time_zone
    }
  end

  def parse_time_minutes(value)
    return nil if value.nil?
    text = value.to_s.strip
    return nil if text.empty?
    parts = text.split(":")
    return nil if parts.length < 2
    hour = parts[0].to_i
    minute = parts[1].to_i
    return nil if hour.negative? || hour > 23
    return nil if minute.negative? || minute > 59
    (hour * 60) + minute
  end

  def compute_wait_until(data)
    raw = data["datetime"].to_s
    parsed = Time.zone.parse(raw) rescue nil
    parsed || Time.current
  end

  def evaluate_rate_limit(run, node, contact)
    node_id = node["id"].to_s
    config = node["data"].is_a?(Hash) ? node["data"] : {}
    interval_seconds = rate_interval_seconds(config)
    interval_seconds = 1 if interval_seconds < 1
    max_per_hour = [config["max_per_hour"].to_i, 1].max
    max_per_day = [config["max_per_day"].to_i, 1].max
    random_percent = [[config["random_percent"].to_i, 0].max, 40].min
    window_enabled = truthy?(config["window_enabled"])
    window_start = config["window_start"].to_s.presence || "09:00"
    window_end = config["window_end"].to_s.presence || "18:00"
    prevent_repeat = truthy?(config["prevent_repeat"])
    dedupe_hours = [config["dedupe_hours"].to_i, 1].max
    on_daily_limit = config["on_daily_limit"].to_s == "stop" ? "stop" : "pause_24h"

    now = Time.current
    result = nil

    FlowRun.transaction do
      run.lock!
      metadata = run.metadata.is_a?(Hash) ? run.metadata.deep_dup : {}
      metadata["rate_limit"] = {} unless metadata["rate_limit"].is_a?(Hash)
      state = metadata["rate_limit"][node_id].is_a?(Hash) ? metadata["rate_limit"][node_id] : {}

      hour_started_at = safe_parse_time(state["hour_started_at"]) || now
      if now >= (hour_started_at + 1.hour)
        hour_started_at = now
        state["hour_count"] = 0
      end

      day_started_at = safe_parse_time(state["day_started_at"]) || now.beginning_of_day
      if now.to_date != day_started_at.to_date
        day_started_at = now.beginning_of_day
        state["day_count"] = 0
      end

      recent_targets = state["recent_targets"].is_a?(Hash) ? state["recent_targets"] : {}
      target_key = contact&.id.to_s.presence
      if prevent_repeat && target_key
        last_sent_at = safe_parse_time(recent_targets[target_key])
        if last_sent_at && last_sent_at > (now - dedupe_hours.hours)
          state["hour_started_at"] = hour_started_at.iso8601
          state["day_started_at"] = day_started_at.iso8601
          state["recent_targets"] = compact_recent_targets(recent_targets, now)
          metadata["rate_limit"][node_id] = state
          run.update_columns(metadata: metadata)
          result = {
            status: "skipped",
            error: "Repetido bloqueado por ventana de #{dedupe_hours}h",
            meta: {
              "rate_limit" => true,
              "reason" => "prevent_repeat",
              "dedupe_hours" => dedupe_hours
            }
          }
          next
        end
      end

      hour_count = state["hour_count"].to_i
      day_count = state["day_count"].to_i
      next_at = safe_parse_time(state["next_at"])
      schedule_at = next_at && next_at > now ? next_at : now
      delays = []

      if window_enabled
        window_schedule = adjust_to_time_window(schedule_at, window_start, window_end)
        if window_schedule > schedule_at
          delays << { reason: "window", at: window_schedule }
          schedule_at = window_schedule
        end
      end

      if day_count >= max_per_day
        if on_daily_limit == "stop"
          state["hour_started_at"] = hour_started_at.iso8601
          state["day_started_at"] = day_started_at.iso8601
          state["recent_targets"] = compact_recent_targets(recent_targets, now)
          metadata["rate_limit"][node_id] = state
          run.update_columns(metadata: metadata)
          result = {
            status: "skipped",
            error: "Limite diario alcanzado",
            meta: { "rate_limit" => true, "reason" => "daily_limit_stop", "max_per_day" => max_per_day }
          }
          next
        else
          daily_resume = [day_started_at + 24.hours, now + 24.hours].max
          delays << { reason: "daily_limit_pause_24h", at: daily_resume }
          schedule_at = [schedule_at, daily_resume].max
        end
      end

      if hour_count >= max_per_hour
        hour_resume = [hour_started_at + 1.hour, now + 1.minute].max
        delays << { reason: "hour_limit", at: hour_resume }
        schedule_at = [schedule_at, hour_resume].max
      end

      jitter = compute_rate_jitter(interval_seconds, random_percent)
      next_gap = interval_seconds + jitter
      next_gap = 1 if next_gap < 1

      state["hour_started_at"] = hour_started_at.iso8601
      state["day_started_at"] = day_started_at.iso8601
      state["hour_count"] = hour_count + 1
      state["day_count"] = day_count + 1
      state["next_at"] = (schedule_at + next_gap.seconds).iso8601
      if target_key
        recent_targets[target_key] = now.iso8601
      end
      state["recent_targets"] = compact_recent_targets(recent_targets, now)
      metadata["rate_limit"][node_id] = state
      run.update_columns(metadata: metadata)

      meta = {
        "rate_limit" => true,
        "scheduled_for" => schedule_at.iso8601,
        "interval_seconds" => interval_seconds,
        "jitter_seconds" => jitter,
        "max_per_hour" => max_per_hour,
        "max_per_day" => max_per_day,
        "window_enabled" => window_enabled
      }
      meta["window"] = "#{window_start}-#{window_end}" if window_enabled
      meta["delays"] = delays.map { |entry| { "reason" => entry[:reason], "at" => entry[:at].iso8601 } } if delays.any?

      result = {
        status: "finished",
        delay_until: (schedule_at > now ? schedule_at : nil),
        meta: meta
      }
    end

    result || { status: "finished" }
  end

  def rate_interval_seconds(config)
    value = config["interval_value"].to_i
    value = 1 if value <= 0
    unit = config["interval_unit"].to_s
    unit == "minutes" ? value * 60 : value
  end

  def compute_rate_jitter(interval_seconds, random_percent)
    return 0 if random_percent <= 0 || interval_seconds <= 1
    range = (interval_seconds * random_percent / 100.0).round
    return 0 if range <= 0
    rand(-range..range)
  end

  def compact_recent_targets(recent_targets, now)
    return {} unless recent_targets.is_a?(Hash)
    recent_targets.each_with_object({}) do |(key, value), memo|
      timestamp = safe_parse_time(value)
      next unless timestamp
      next if timestamp < (now - 7.days)
      memo[key.to_s] = timestamp.iso8601
    end
  end

  def safe_parse_time(value)
    return nil if value.blank?
    Time.zone.parse(value.to_s)
  rescue StandardError
    nil
  end

  def adjust_to_time_window(time, start_value, end_value)
    start_minutes = parse_time_minutes(start_value)
    end_minutes = parse_time_minutes(end_value)
    return time unless start_minutes && end_minutes

    current_minutes = time.hour * 60 + time.min
    current_day = time.beginning_of_day
    if start_minutes <= end_minutes
      start_time = current_day + start_minutes.minutes
      end_time = current_day + end_minutes.minutes
      return start_time if time < start_time
      return time if time <= end_time
      return (current_day + 1.day + start_minutes.minutes)
    end

    # overnight window (e.g. 22:00 - 06:00)
    start_time = current_day + start_minutes.minutes
    end_time = current_day + end_minutes.minutes
    return time if time >= start_time
    return time if time <= end_time
    current_day + start_minutes.minutes
  end

  def send_whatsapp(project_id, contact, data)
    template_id = data["template_id"].to_s
    if template_id.present?
      return send_whatsapp_template(project_id, contact, template_id, data)
    end

    chat_id = contact.chat_id
    return { status: "failed", error: "Contacto sin chat" } if chat_id.blank?
    chat = WhatsappChat.find_by(id: chat_id, project_id: project_id)
    return { status: "failed", error: "Chat no encontrado" } unless chat

    session_name = WhatsappProjectSetting.find_by(project_id: project_id)&.session_name.to_s
    return { status: "failed", error: "Sesion WAHA no configurada" } if session_name.blank?

    message = data["message"].to_s
    return { status: "failed", error: "Mensaje vacio" } if message.blank?

    chat_external_id = chat.external_id.to_s
    typing_enabled = truthy?(data["start_typing"])
    begin
      if typing_enabled
        send_typing(project_id, chat_external_id, session_name, "start")
        sleep 3
      end
      response = waha_request(
        project_id,
        "/api/sendText",
        {
          chatId: chat_external_id,
          text: message,
          session: session_name,
          linkPreview: true,
          linkPreviewHighQuality: false
        }
      )
    ensure
      send_typing(project_id, chat_external_id, session_name, "stop") if typing_enabled
    end

    meta = {
      message: message.to_s[0, 160],
      chat_id: chat.id
    }
    if typing_enabled
      meta[:typing] = true
      meta[:typing_delay] = 3
    end
    if response[:status].to_i >= 200 && response[:status].to_i < 300
      sender = User.respond_to?(:system) ? User.system : User.admin.first
      WhatsappMessage.create!(
        chat: chat,
        sender_user: sender,
        body: message,
        message_type: "text",
        status: "sent",
        metadata: { "waha" => response[:json], "from_me" => true }
      )
      chat.update!(last_message_at: Time.current)
      { status: "finished", meta: meta }
    else
      { status: "failed", error: response[:json].to_s, meta: meta }
    end
  end

  def invoke_ai_agent(server_url, agent_id, payload, auth = {})
    base = server_url.to_s.strip.chomp("/")
    uri = URI("#{base}/#{agent_id}/invoke")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    http.open_timeout = 10
    http.read_timeout = 60

    headers = {
      "Accept" => "application/json",
      "Content-Type" => "application/json"
    }
    if auth[:username].present? && auth[:password].present?
      token = Base64.strict_encode64("#{auth[:username]}:#{auth[:password]}")
      headers["Authorization"] = "Basic #{token}"
    end

    request = Net::HTTP::Post.new(uri.request_uri, headers)
    request.body = payload.to_json
    response = http.request(request)
    return { error: "HTTP #{response.code}" } unless response.code.to_i == 200

    data = JSON.parse(response.body) rescue {}
    content = data.is_a?(Hash) ? data["content"] : nil
    content = content.to_s
    return { error: "Respuesta vacia", response: content } if content.strip.empty?

    { response: content, raw: data }
  rescue StandardError => e
    { error: "#{e.class}: #{e.message}" }
  end

  def send_whatsapp_template(project_id, contact, template_id, data = {})
    chat_id = contact.chat_id
    return { status: "failed", error: "Contacto sin chat" } if chat_id.blank?
    chat = WhatsappChat.find_by(id: chat_id, project_id: project_id)
    return { status: "failed", error: "Chat no encontrado" } unless chat

    template = WhatsappTemplate.where(project_id: project_id, active: true).find_by(id: template_id)
    return { status: "failed", error: "Plantilla no encontrada" } unless template

    session_name = WhatsappProjectSetting.find_by(project_id: project_id)&.session_name.to_s
    return { status: "failed", error: "Sesion WAHA no configurada" } if session_name.blank?

    template_type = template.template_type.to_s
    body_text = template.body_text.to_s
    uses_media = template_type != "text"
    uses_text = template_type.start_with?("text_") || template_type == "text"

    media_payload = uses_media ? build_whatsapp_template_media_payload(template) : nil
    if uses_media && media_payload.nil?
      return { status: "failed", error: "Plantilla sin media" }
    end

    chat_external_id = chat.external_id.to_s
    endpoint = "/api/sendText"
    message_type = "text"
    payload = { chatId: chat_external_id, session: session_name }

    send_voice = false
    if uses_media
      if template_type.include?("image")
        endpoint = "/api/sendImage"
        message_type = "image"
      elsif template_type.include?("video")
        endpoint = "/api/sendVideo"
        message_type = "video"
      elsif template_type.include?("audio")
        send_voice = voice_note_media?(media_payload, template)
        endpoint = send_voice ? "/api/sendVoice" : "/api/sendFile"
        message_type = "audio"
      else
        endpoint = "/api/sendFile"
        message_type = "file"
      end
      payload[:file] = media_payload
      payload[:convert] = true if send_voice
      payload[:caption] = body_text if uses_text && body_text.present? && !send_voice
    else
      payload[:text] = body_text
    end

    typing_enabled = truthy?(data["start_typing"])
    begin
      if typing_enabled
        send_typing(project_id, chat_external_id, session_name, "start")
        sleep 3
      end
      response = waha_request(project_id, endpoint, payload)
    ensure
      send_typing(project_id, chat_external_id, session_name, "stop") if typing_enabled
    end
    meta = {
      template_id: template.id,
      template_name: template.name.to_s,
      template_type: template.template_type.to_s,
      message: body_text.to_s[0, 160],
      file_name: template.file_name.to_s.presence,
      chat_id: chat.id
    }.compact
    if typing_enabled
      meta[:typing] = true
      meta[:typing_delay] = 3
    end

    if response[:status].to_i >= 200 && response[:status].to_i < 300
      sender = User.respond_to?(:system) ? User.system : User.admin.first
      metadata = {
        filename: media_payload ? media_payload[:filename] : nil,
        content_type: media_payload ? media_payload[:mimetype] : nil,
        file_size: media_payload ? media_payload[:file_size] : nil,
        remote_url: whatsapp_template_media_url(project_id, template),
        waha: response[:json],
        from_me: true
      }.compact
      waha_id = response[:json].is_a?(Hash) ? response[:json]["id"].to_s : ""
      metadata["waha_id"] = waha_id if waha_id.present?

      WhatsappMessage.create!(
        chat: chat,
        sender_user: sender,
        body: uses_text ? body_text : "",
        message_type: message_type,
        status: "sent",
        metadata: metadata
      )
      chat.update!(last_message_at: Time.current)
      { status: "finished", meta: meta }
    else
      { status: "failed", error: response[:json].to_s, meta: meta }
    end
  rescue StandardError => error
    { status: "failed", error: error.message }
  end

  def build_whatsapp_template_media_payload(template)
    filename = template.file_name.to_s
    content_type = template.content_type.to_s
    bytes = nil

    if template.storage_path.present? && File.exist?(template.storage_path.to_s)
      bytes = File.binread(template.storage_path.to_s)
      Rails.logger.info("[Flows] wa_template_media storage_hit template_id=#{template.id} bytes=#{bytes.bytesize}")
    elsif template.storage_path.present?
      Rails.logger.info("[Flows] wa_template_media storage_missing template_id=#{template.id} path=#{template.storage_path}")
    elsif template.media_url.present?
      media_url = template.media_url.to_s
      Rails.logger.info("[Flows] wa_template_media fetch_start template_id=#{template.id} url=#{media_url}")
      response = fetch_remote_media(media_url)
      if response.nil?
        Rails.logger.info("[Flows] wa_template_media fetch_failed template_id=#{template.id} url=#{media_url}")
        return nil
      end
      bytes = response[:body]
      filename = response[:filename].to_s if filename.blank?
      content_type = response[:content_type].to_s if content_type.blank?
      Rails.logger.info("[Flows] wa_template_media fetch_ok template_id=#{template.id} bytes=#{bytes.to_s.bytesize} content_type=#{content_type} filename=#{filename}")
    else
      Rails.logger.info("[Flows] wa_template_media missing template_id=#{template.id}")
    end

    return nil if bytes.blank?
    filename = "archivo" if filename.blank?
    content_type = "application/octet-stream" if content_type.blank?
    {
      data: Base64.strict_encode64(bytes),
      filename: filename,
      mimetype: content_type,
      file_size: bytes.bytesize
    }
  end

  def fetch_remote_media(url, max_redirects: 3)
    return nil if url.to_s.strip.empty?
    uri = URI.parse(url.to_s)
    return nil unless uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)

    current_uri = uri
    max_redirects.times do
      http = Net::HTTP.new(current_uri.host, current_uri.port)
      http.use_ssl = current_uri.is_a?(URI::HTTPS)
      http.open_timeout = 8
      http.read_timeout = 15

      response = http.start { |client| client.get(current_uri.request_uri) }
      case response
      when Net::HTTPRedirection
        location = response["location"].to_s
        return nil if location.blank?
        next_uri = URI.parse(location)
        current_uri = if next_uri.is_a?(URI::HTTP) || next_uri.is_a?(URI::HTTPS)
                        next_uri
                      else
                        current_uri.merge(location)
                      end
        next
      when Net::HTTPSuccess
        return {
          body: response.body,
          content_type: response["Content-Type"].to_s,
          filename: File.basename(current_uri.path.to_s)
        }
      else
        return nil
      end
    end
    nil
  rescue StandardError
    nil
  end

  def voice_note_media?(media_payload, template)
    content_type = ""
    filename = ""
    if media_payload.is_a?(Hash)
      content_type = media_payload[:mimetype].to_s
      filename = media_payload[:filename].to_s
    end
    content_type = template.content_type.to_s if content_type.empty?
    filename = template.file_name.to_s if filename.empty?
    ct = content_type.downcase
    return true if ct.include?("audio/ogg") || ct.include?("audio/opus") || ct.include?("codecs=opus")
    ext = File.extname(filename).downcase
    %w[.ogg .oga .opus].include?(ext)
  end

  def whatsapp_template_media_url(project_id, template)
    return template.media_url.to_s if template.media_url.present?
    return "" if template.storage_path.blank?
    Rails.application.routes.url_helpers.whatsapp_plugin_project_whatsapp_template_media_path(
      project_id: project_id,
      id: template.id,
      only_path: true
    )
  end

  def send_whatsapp_legacy_template(project_id, contact, data)
    template = data["template"].to_s
    message = render_template(template, contact)
    send_whatsapp(project_id, contact, { "message" => message })
  end

  def send_email(project_id, contact, data)
    recipient = contact.email.to_s
    return { status: "failed", error: "Contacto sin email" } if recipient.blank?
    subject = data["subject"].to_s
    body = data["body"].to_s
    return { status: "failed", error: "Asunto vacio" } if subject.blank?
    return { status: "failed", error: "Contenido vacio" } if body.blank?

    smtp_source = normalize_smtp_source_value(data["smtp_source"])
    delivery = EmailDelivery.create!(
      project_id: project_id,
      subject: subject,
      body: body,
      recipient_email: recipient,
      smtp_source: smtp_source,
      contact_profile_id: contact.id
    )
    EmailEmailSendJob.perform_later(delivery.id)
    { status: "finished" }
  rescue StandardError => error
    { status: "failed", error: error.message }
  end

  def send_email_template(project_id, contact, data, run_id: nil, node_id: nil)
    recipient = contact.email.to_s
    return { status: "failed", error: "Contacto sin email" } if recipient.blank?
    template_id = data["template_id"].to_s
    template = EmailTemplate.find_by(id: template_id, project_id: project_id, active: true)
    return { status: "failed", error: "Plantilla no encontrada" } unless template

    flow_run_id = run_id.to_s.presence
    flow_node_id = node_id.to_s.presence
    if flow_run_id && flow_node_id
      candidates = EmailDelivery
                   .where(project_id: project_id,
                          contact_profile_id: contact.id,
                          email_template_id: template.id,
                          status: %w[queued sending sent])
                   .where("created_at >= ?", 2.days.ago)
                   .order(created_at: :desc)
                   .limit(50)
      existing = candidates.find do |delivery_row|
        tokens = delivery_row.render_tokens.is_a?(Hash) ? delivery_row.render_tokens : {}
        tokens["flow_run_id"].to_s == flow_run_id && tokens["flow_node_id"].to_s == flow_node_id
      end
      if existing
        Rails.logger.info(
          "[Flows] email_template_dedup run_id=#{flow_run_id} node_id=#{flow_node_id} " \
          "contact_id=#{contact.id} existing_delivery_id=#{existing.id}"
        )
        return {
          status: "finished",
          meta: {
            delivery_id: existing.id,
            template_id: template.id,
            template_name: template.name.to_s,
            recipient: recipient,
            subject: template.subject.to_s,
            smtp_source: existing.smtp_source.to_s,
            sender_name: existing.sender_name.to_s,
            deduped: true
          }
        }
      end
    end

    subject = template.subject.to_s
    body = template.body.to_s
    body_html = template.body_html.to_s
    template_smtp_source = normalize_smtp_source_value(template.smtp_source)
    delivery = EmailDelivery.create!(
      project_id: project_id,
      email_template: template,
      sender_name: template.sender_name.to_s,
      subject: subject,
      body: body,
      body_html: body_html.presence,
      recipient_email: recipient,
      smtp_source: template_smtp_source,
      contact_profile_id: contact.id,
      render_tokens: {
        "flow_run_id" => flow_run_id,
        "flow_node_id" => flow_node_id
      }.compact
    )
    EmailEmailSendJob.perform_later(delivery.id)
    {
      status: "finished",
      meta: {
        delivery_id: delivery.id,
        template_id: template.id,
        template_name: template.name.to_s,
        recipient: recipient,
        subject: subject,
        smtp_source: delivery.smtp_source.to_s,
        sender_name: delivery.sender_name.to_s
      }
    }
  rescue StandardError => error
    { status: "failed", error: error.message }
  end

  def assign_owner(contact, data)
    user_id = data["user_id"].to_i
    contact.update(assigned_to_id: user_id)
    { status: "finished" }
  rescue StandardError => error
    { status: "failed", error: error.message }
  end

  def normalize_smtp_source_value(value)
    source = value.to_s
    source = "smtp2" if source == "plugin"
    EmailProjectSetting::SMTP_SOURCES.include?(source) ? source : "openproject"
  end

  def update_field(contact, data)
    field = data["field"].to_s
    value = data["value"]
    if field.start_with?("custom:")
      key = field.delete_prefix("custom:").to_s
      custom = contact.custom_fields.is_a?(Hash) ? contact.custom_fields : {}
      if value.is_a?(String) && value.include?(",")
        custom[key] = value.split(",").map(&:strip).reject(&:blank?)
      else
        custom[key] = value
      end
      contact.update(custom_fields: custom)
    else
      contact.update(field => value)
    end
    { status: "finished", meta: { field: field, value: value } }
  rescue StandardError => error
    { status: "failed", error: error.message }
  end

  def add_tags(contact, data)
    raw = data["tags"].to_s
    tags = raw.split(",").map(&:strip).reject(&:blank?)
    current = contact.tags.is_a?(Array) ? contact.tags : []
    merged = (current + tags).map(&:to_s).map(&:strip).reject(&:blank?).uniq
    contact.update(tags: merged)
    { status: "finished" }
  rescue StandardError => error
    { status: "failed", error: error.message }
  end

  def call_webhook(contact, data)
    url = data["url"].to_s
    return { status: "failed", error: "URL vacia" } if url.blank?
    payload = data["payload"].to_s
    json = payload.present? ? JSON.parse(payload) : {}
    if contact
      json["contact"] = contact.attributes.slice(
        "id", "first_name", "last_name", "email", "phone", "company",
        "status", "source", "points", "assigned_to_id", "tags"
      )
    end

    uri = URI.parse(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    request = Net::HTTP::Post.new(uri.request_uri)
    request["Content-Type"] = "application/json"
    request.body = json.to_json
    response = http.request(request)
    if response.code.to_i >= 200 && response.code.to_i < 300
      { status: "finished" }
    else
      { status: "failed", error: response.body.to_s }
    end
  rescue StandardError => error
    { status: "failed", error: error.message }
  end

  def render_template(template, contact)
    template.to_s.gsub(/\{\{\s*contact\.([a-zA-Z0-9_]+)\s*\}\}/) do
      key = Regexp.last_match(1)
      value = contact.respond_to?(key) ? contact.public_send(key) : ""
      value.to_s
    end.gsub(/\{\{\s*custom\.([a-zA-Z0-9_]+)\s*\}\}/) do
      key = Regexp.last_match(1)
      custom = contact.custom_fields.is_a?(Hash) ? contact.custom_fields : {}
      custom[key].to_s
    end
  end

  def truthy?(value)
    value == true || value.to_s == "true" || value.to_s == "1"
  end

  def node_requires_contact_for_execution?(node_type)
    %w[
      filter condition branch
      whatsapp whatsapp_ai whatsapp_template
      email email_template
      assign_owner update_field add_tag
    ].include?(node_type.to_s)
  end

  def send_typing(project_id, chat_external_id, session_name, action)
    return if chat_external_id.blank? || session_name.blank?
    path = action == "stop" ? "/api/stopTyping" : "/api/startTyping"
    waha_request(project_id, path, { chatId: chat_external_id, session: session_name })
  rescue StandardError
    nil
  end

  def waha_request(project_id, path, payload)
    base_url = (Setting.plugin_openproject_whatsapp || {})["waha_url"].to_s.strip
    return { status: 422, json: { error: "Configura la URL del servidor WAHA." } } if base_url.blank?

    base_url = "#{base_url}/" unless base_url.end_with?("/")
    url = URI.join(base_url, path.sub(/\A\//, ""))

    http = Net::HTTP.new(url.host, url.port)
    http.use_ssl = url.scheme == "https"

    request = Net::HTTP::Post.new(url.request_uri)
    request["Accept"] = "application/json"
    request["Content-Type"] = "application/json"
    request.body = payload.to_json

    response = http.request(request)
    json = begin
      JSON.parse(response.body)
    rescue JSON::ParserError
      { "error" => response.body.to_s }
    end
    { status: response.code.to_i, json: json }
  rescue StandardError => error
    { status: 502, json: { error: error.message } }
  end
end

