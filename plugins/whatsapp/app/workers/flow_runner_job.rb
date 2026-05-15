require "set"

class FlowRunnerJob < ApplicationJob
  queue_with_priority :notification

  def perform(flow_definition_id, project_id, user_id = nil, options = {})
    options = options.is_a?(Hash) ? options : {}
    flow = FlowDefinition.find_by(id: flow_definition_id, project_id: project_id)
    return unless flow

    run = FlowRun.create!(
      flow_definition: flow,
      project_id: project_id,
      started_by_id: user_id,
      status: "running",
      started_at: Time.current,
      metadata: build_metadata(options)
    )

    start_node_id = options[:start_node_id].presence || find_start_node_id(flow.definition_json, options[:start_type])
    return if start_node_id.blank?
    contacts = resolve_contacts(project_id, options).to_a
    total_contacts = contacts.size
    if total_contacts == 0 && options[:allow_without_contact]
      total_contacts = 1
    end
    materialized_plan = options.key?(:materialize) ? !!options[:materialize] : true
    run.update_columns(metadata: (run.metadata.is_a?(Hash) ? run.metadata : {}).merge(
      "total_contacts" => total_contacts,
      "node_counters" => {},
      "materialized_plan" => materialized_plan
    ))
    Rails.logger.info(
      "[Flows] runner_start run_id=#{run.id} flow_id=#{flow.id} start_node=#{start_node_id} " \
      "contacts=#{contacts.size} allow_without_contact=#{options[:allow_without_contact] ? 'true' : 'false'} " \
      "source=#{options[:source].to_s.presence || '-'} materialized_plan=#{materialized_plan}"
    )

    if materialized_plan
      materialize_and_enqueue_plan!(
        run: run,
        flow: flow,
        start_node_id: start_node_id,
        contacts: contacts,
        allow_without_contact: !!options[:allow_without_contact]
      )
    else
      if contacts.any?
        contacts.each do |contact|
          Rails.logger.info(
            "[Flows] runner_enqueue_first run_id=#{run.id} contact_id=#{contact.id} node_id=#{start_node_id}"
          )
          FlowNodeJob.perform_later(run.id, contact.id, start_node_id)
        end
      elsif options[:allow_without_contact]
        Rails.logger.info(
          "[Flows] runner_enqueue_first run_id=#{run.id} contact_id=nil node_id=#{start_node_id}"
        )
        FlowNodeJob.perform_later(run.id, nil, start_node_id)
      end
    end
  rescue StandardError => error
    run&.update(status: "failed", finished_at: Time.current, metadata: { error: error.message })
    raise
  end

  private

  def materialize_and_enqueue_plan!(run:, flow:, start_node_id:, contacts:, allow_without_contact:)
    definition = flow.definition_json.is_a?(Hash) ? flow.definition_json : {}
    nodes = definition["nodes"].is_a?(Array) ? definition["nodes"] : []
    edges = definition["edges"].is_a?(Array) ? definition["edges"] : []
    duplicate_node_ids = Hash.new(0)
    nodes_by_id = nodes.each_with_object({}) do |node, memo|
      next unless node.is_a?(Hash)
      node_id = node["id"].to_s
      next if node_id.blank?
      duplicate_node_ids[node_id] += 1
      memo[node_id] ||= node
      normalized = normalize_node_id_for_plan(node_id)
      memo[normalized] ||= node if normalized.present?
      memo[normalized.downcase] ||= node if normalized.present?
    end
    duplicated = duplicate_node_ids.select { |_node_id, count| count > 1 }
    if duplicated.any?
      Rails.logger.warn(
        "[Flows] materialize_duplicate_node_ids run_id=#{run.id} flow_id=#{flow.id} " \
        "details=#{duplicated.map { |node_id, count| "#{node_id}:#{count}" }.join(',')}"
      )
    end

    contact_ids = contacts.map(&:id)
    contact_ids = [nil] if contact_ids.empty? && allow_without_contact

    Rails.logger.info(
      "[Flows] materialize_start run_id=#{run.id} flow_id=#{flow.id} start_node=#{start_node_id} contacts=#{contact_ids.size}"
    )

    contact_ids.each do |contact_id|
      plan = build_contact_plan(
        run: run,
        contact_id: contact_id,
        start_node_id: start_node_id,
        nodes_by_id: nodes_by_id,
        edges: edges
      )
      email_nodes = plan.count do |entry|
        node_type = nodes_by_id.dig(entry[:node_id].to_s, "type").to_s
        %w[email email_template].include?(node_type)
      end
      Rails.logger.info(
        "[Flows] materialize_contact run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
        "planned_steps=#{plan.size} planned_email_steps=#{email_nodes}"
      )
      Rails.logger.info(
        "[Flows] materialize_plan_nodes run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
        "nodes=#{plan.map { |e| e[:node_id].to_s }.join(' > ')}"
      )
      log_missing_email_nodes_for_plan(
        run: run,
        contact_id: contact_id,
        plan: plan,
        nodes_by_id: nodes_by_id,
        edges: edges
      )

      plan.each do |entry|
        scheduled_at = entry[:scheduled_at].presence || Time.current
        planned_item = FlowRunItem.create!(
          flow_run: run,
          contact_id: contact_id,
          node_id: entry[:node_id].to_s,
          status: "queued",
          result_meta: {
            "materialized_plan" => true,
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
          FlowNodeJob.set(wait_until: scheduled_at).perform_later(run.id, contact_id, entry[:node_id], job_options)
          mode = "scheduled"
        else
          FlowNodeJob.perform_later(run.id, contact_id, entry[:node_id], job_options)
          mode = "immediate"
        end

        Rails.logger.info(
          "[Flows] materialize_enqueue run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
          "node_id=#{entry[:node_id]} from=#{entry[:from_node_id] || '-'} at=#{scheduled_at.iso8601} " \
          "mode=#{mode} item_id=#{planned_item.id}"
        )
      end
    end
  end

  def build_contact_plan(run:, contact_id:, start_node_id:, nodes_by_id:, edges:)
    contact = contact_id.present? ? WhatsappContactProfile.find_by(id: contact_id) : nil
    queue = [{ node_id: start_node_id.to_s, at: Time.current, from: nil }]
    plan = []
    visited = Hash.new(0)
    node_visits = Hash.new(0)
    max_visits_per_node = [ENV.fetch("FLOWS_MATERIALIZE_MAX_VISITS_PER_NODE", "1").to_i, 1].max
    max_steps = 400
    steps = 0

    while queue.any? && steps < max_steps
      steps += 1
      current = queue.shift
      requested_node_id = current[:node_id].to_s
      next if requested_node_id.blank?

      timestamp_key = (current[:at]&.to_i || 0) / 1
      requested_state_key = "#{requested_node_id}|#{timestamp_key}"
      visited[requested_state_key] += 1
      next if visited[requested_state_key] > 2

      node = resolve_plan_node(nodes_by_id, requested_node_id)
      unless node.is_a?(Hash)
        passthrough_targets = edges.select do |edge|
          edge.is_a?(Hash) &&
            normalize_node_id_for_plan(edge["source"]) == normalize_node_id_for_plan(requested_node_id)
        end
        if passthrough_targets.any?
          next_time = (current[:at] || Time.current) + 1.second
          target_ids = passthrough_targets.map { |edge| normalize_node_id_for_plan(edge["target"]) }
                                          .reject(&:blank?)
                                          .uniq
          Rails.logger.warn(
            "[Flows] materialize_missing_node_passthrough run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
            "node_id=#{requested_node_id} targets=#{target_ids.join(',')}"
          )
          target_ids.each_with_index do |target_id, index|
            queue << {
              node_id: target_id,
              at: next_time + index.seconds,
              from: requested_node_id
            }
          end
        else
          Rails.logger.warn(
            "[Flows] materialize_missing_node run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
            "node_id=#{requested_node_id} targets=-"
          )
        end
        next
      end
      node_id = node["id"].to_s.presence || requested_node_id
      node_type = node["type"].to_s

      normalized_node_id = normalize_node_id_for_plan(node_id)
      node_visits[normalized_node_id] += 1
      if node_visits[normalized_node_id] > max_visits_per_node
        Rails.logger.warn(
          "[Flows] materialize_cycle_guard_skip run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
          "node_id=#{node_id} visits=#{node_visits[normalized_node_id]} max=#{max_visits_per_node}"
        )
        next
      end

      if contact.nil? && node_requires_contact_for_plan?(node_type)
        Rails.logger.info(
          "[Flows] materialize_skip_contact_required run_id=#{run.id} node_id=#{node_id} contact_id=nil"
        )
        next
      end

      state_key = "#{node_id}|#{timestamp_key}"
      visited[state_key] += 1
      next if visited[state_key] > 2

      plan << { node_id: node_id, scheduled_at: current[:at], from_node_id: current[:from] }

      node_data = node["data"].is_a?(Hash) ? node["data"] : {}
      next_time = case node_type
                  when "delay"
                    compute_delay_time(node_data, base_time: current[:at], project_id: run.project_id)
                  when "wait_until"
                    compute_wait_until_time(node_data, base_time: current[:at])
                  else
                    (current[:at] || Time.current) + 1.second
                  end

      path = resolve_plan_path(node_type: node_type, node_data: node_data, contact: contact, run: run)
      targets = edges.select do |edge|
        edge.is_a?(Hash) &&
          normalize_node_id_for_plan(edge["source"]) == normalize_node_id_for_plan(node_id)
      end
      selected = select_targets_for_path(targets: targets, node_type: node_type, desired_path: path)
      if targets.any?
        all_paths = targets.map { |edge| "#{normalized_edge_path(edge)}->#{edge['target']}" }
        selected_paths = selected.map { |edge| "#{normalized_edge_path(edge)}->#{edge['target']}" }
        Rails.logger.info(
          "[Flows] materialize_edges run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
          "node_id=#{node_id} type=#{node_type} desired_path=#{path} " \
          "all=#{all_paths.join(',')} selected=#{selected_paths.join(',')}"
        )
      else
        Rails.logger.info(
          "[Flows] materialize_edges run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
          "node_id=#{node_id} type=#{node_type} desired_path=#{path} all=- selected=-"
        )
      end

      selected_targets = selected.map { |edge| normalize_node_id_for_plan(edge["target"]) }.reject(&:blank?).uniq
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

  def resolve_plan_node(nodes_by_id, node_id)
    return nil if nodes_by_id.blank? || node_id.to_s.blank?
    exact = nodes_by_id[node_id.to_s]
    return exact if exact.is_a?(Hash)

    normalized = normalize_node_id_for_plan(node_id)
    from_normalized = nodes_by_id[normalized]
    return from_normalized if from_normalized.is_a?(Hash)

    from_downcased = nodes_by_id[normalized.downcase]
    return from_downcased if from_downcased.is_a?(Hash)

    nil
  end

  def normalize_node_id_for_plan(value)
    value
      .to_s
      .unicode_normalize(:nfkc)
      .gsub(/\p{Cf}/, "")
      .gsub(/\s+/, "")
      .strip
  rescue StandardError
    value.to_s.strip
  end

  def resolve_plan_path(node_type:, node_data:, contact:, run:)
    case node_type
    when "filter", "branch"
      return "yes" if contact && evaluate_filter_for_plan(contact, node_data)
      return "no" if contact
      "default"
    when "condition"
      return "yes" if contact && evaluate_condition_for_plan(contact, node_data)
      return "no" if contact
      "default"
    when "transform_json"
      payload = run.metadata.is_a?(Hash) ? run.metadata["payload"] : {}
      applicable, debug = transform_json_applicable_for_plan(node_data, payload)
      Rails.logger.info(
        "[Flows] materialize_transform_json run_id=#{run.id} " \
        "applicable=#{applicable} missing=#{Array(debug[:missing]).join(',')} " \
        "targets=#{Array(debug[:sources]).join(',')}"
      )
      applicable ? "default" : "no"
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

  def log_missing_email_nodes_for_plan(run:, contact_id:, plan:, nodes_by_id:, edges:)
    planned_ids = plan.map { |entry| entry[:node_id].to_s }.to_set
    email_node_ids = nodes_by_id.each_with_object([]) do |(node_id, node), memo|
      type = node.is_a?(Hash) ? node["type"].to_s : ""
      memo << node_id.to_s if %w[email email_template].include?(type)
    end.uniq

    missing_ids = email_node_ids.reject { |node_id| planned_ids.include?(node_id) }
    return if missing_ids.empty?

    incoming = Hash.new { |memo, key| memo[key] = [] }
    edges.each do |edge|
      next unless edge.is_a?(Hash)
      source = normalize_node_id_for_plan(edge["source"])
      target = normalize_node_id_for_plan(edge["target"])
      next if source.blank? || target.blank?
      incoming[target] << "#{source}(#{normalized_edge_path(edge)})"
    end

    details = missing_ids.map do |node_id|
      parents = incoming[node_id]
      parent_ids = parents.map { |value| value.split("(").first }
      has_parent_in_plan = parent_ids.any? do |parent_id|
        planned_ids.include?(parent_id.to_s) || planned_ids.include?(normalize_node_id_for_plan(parent_id))
      end
      lineage = materialize_parent_lineage(node_id: node_id, incoming: incoming, planned_ids: planned_ids)
      "#{node_id}:parents=[#{parents.join(',')}] parent_in_plan=#{has_parent_in_plan} lineage=#{lineage}"
    end

    Rails.logger.warn(
      "[Flows] materialize_missing_email_nodes run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
      "count=#{missing_ids.size} details=#{details.join(' | ')}"
    )
  rescue StandardError => error
    Rails.logger.warn(
      "[Flows] materialize_missing_email_nodes_error run_id=#{run.id} contact_id=#{contact_id || 'nil'} " \
      "error=#{error.message}"
    )
  end

  def materialize_parent_lineage(node_id:, incoming:, planned_ids:)
    current = node_id.to_s
    return "-" if current.blank?

    visited = Set.new
    segments = []
    max_hops = 20
    hops = 0

    while current.present? && hops < max_hops
      hops += 1
      break if visited.include?(current)
      visited << current

      parents = Array(incoming[current])
      if parents.empty?
        segments << "#{current}(root?)"
        break
      end

      first_parent_entry = parents.first.to_s
      parent_id = first_parent_entry.split("(").first.to_s
      in_plan = planned_ids.include?(parent_id) || planned_ids.include?(normalize_node_id_for_plan(parent_id))
      segments << "#{current}<-#{first_parent_entry}[in_plan=#{in_plan}]"

      break if parent_id.blank?
      current = parent_id
      break if in_plan
    end

    segments.join(" > ")
  rescue StandardError
    "-"
  end

  def transform_json_applicable_for_plan(node_data, payload)
    return [false, { missing: ["payload_invalid"], sources: [] }] unless payload.is_a?(Hash)
    mappings = node_data["mappings"].is_a?(Array) ? node_data["mappings"] : []
    active_mappings = mappings.select do |mapping|
      mapping.is_a?(Hash) && mapping["source"].to_s.strip.present? && mapping["target"].to_s.strip.present?
    end
    return [false, { missing: ["mappings_empty"], sources: [] }] if active_mappings.empty?

    unresolved_sources = active_mappings.each_with_object([]) do |mapping, memo|
      source = mapping["source"].to_s.strip
      next if source.blank?
      value = extract_payload_value_for_plan(payload, source)
      blank_value =
        value.nil? ||
        (value.is_a?(String) && value.strip.empty?) ||
        (value.respond_to?(:empty?) && !value.is_a?(Numeric) && value.empty?)
      memo << source if blank_value
    end

    [unresolved_sources.empty?, { missing: unresolved_sources.uniq, sources: active_mappings.map { |m| m["source"].to_s.strip } }]
  rescue StandardError
    [false, { missing: ["exception"], sources: [] }]
  end

  def extract_payload_value_for_plan(payload, source)
    return nil unless payload.is_a?(Hash)
    path = source.to_s.strip
    return nil if path.blank?

    direct = payload[path] if payload.key?(path)
    return direct if direct.present?

    value = resolve_payload_path_for_plan(payload, path)
    return value if value.present?

    payload_source_aliases_for_plan(path).each do |candidate_path|
      next if candidate_path.blank? || candidate_path.to_s == path.to_s

      candidate_direct = payload[candidate_path] if payload.key?(candidate_path)
      return candidate_direct if candidate_direct.present?

      candidate_value = resolve_payload_path_for_plan(payload, candidate_path)
      return candidate_value if candidate_value.present?
    end

    nil
  rescue StandardError
    nil
  end

  def resolve_payload_path_for_plan(payload, path)
    keys = path.to_s.split(".").map(&:strip).reject(&:blank?)
    return nil if keys.empty?

    keys.reduce(payload) do |memo, key|
      break if memo.nil?
      next memo[key] if memo.is_a?(Hash) && memo.key?(key)
      next memo[key.to_sym] if memo.is_a?(Hash) && memo.key?(key.to_sym)
      nil
    end
  end

  def payload_source_aliases_for_plan(path)
    normalized = normalize_source_path_for_plan(path)
    aliases = {
      "submissionnombresyapellidos" => [
        "submission.nombres y apellidos",
        "submission.nombres_y_apellidos",
        "submission.nombre",
        "submission.name",
        "submission.first_name"
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

  def normalize_source_path_for_plan(value)
    ActiveSupport::Inflector
      .transliterate(value.to_s)
      .downcase
      .gsub(/[^a-z0-9]+/, "")
  end

  def evaluate_filter_for_plan(contact, data)
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

  def evaluate_condition_for_plan(contact, data)
    mode = data["mode"].to_s == "any" ? "any" : "all"
    rules = data["rules"].is_a?(Array) ? data["rules"] : []
    return false if rules.empty?
    results = rules.map { |rule| evaluate_filter_for_plan(contact, rule.is_a?(Hash) ? rule : {}) }
    mode == "any" ? results.any? : results.all?
  rescue StandardError
    false
  end

  def compute_delay_time(data, base_time:, project_id:)
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

  def compute_wait_until_time(data, base_time:)
    raw = data["datetime"].to_s
    parsed = Time.zone.parse(raw) rescue nil
    candidate = parsed || base_time || Time.current
    candidate > (base_time || Time.current) ? candidate : (base_time || Time.current) + 1.second
  rescue StandardError
    (base_time || Time.current) + 1.second
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

  def truthy?(value)
    return true if value == true
    return false if value == false || value.nil?
    value.to_s.strip.downcase.in?(%w[1 true on yes])
  end

  def node_requires_contact_for_plan?(node_type)
    %w[
      filter condition branch
      whatsapp whatsapp_ai whatsapp_template
      email email_template
      assign_owner update_field add_tag
    ].include?(node_type.to_s)
  end

  def find_start_node_id(definition, preferred_type = nil)
    nodes = (definition || {})["nodes"] || []
    if preferred_type.present?
      preferred = nodes.find { |node| node["type"] == preferred_type }
      return preferred["id"] if preferred
    end
    start = nodes.find { |node| node["type"] == "start" }
    start ? start["id"] : nil
  end

  def resolve_contacts(project_id, options)
    scope = WhatsappContactProfile.active.where(project_id: project_id)
    ids = Array(options[:contact_ids]).compact.map(&:to_i).reject(&:zero?)
    return scope.where(id: ids) if ids.any?
    return scope.none if options[:restrict_to_ids]
    scope
  end

  def build_metadata(options)
    metadata = {}
    metadata[:source] = options[:source] if options[:source]
    metadata[:webhook_event_id] = options[:webhook_event_id] if options[:webhook_event_id]
    metadata[:payload] = options[:payload] if options[:payload]
    metadata.presence
  end
end
