# frozen_string_literal: true

module Flows
  class ReminderTriggerService
    def self.call(reminder_notification)
      new(reminder_notification).call
    end

    def initialize(input)
      @reminder_notification = nil
      @reminder = nil

      if input.is_a?(Hash)
        @force = input[:force] || input["force"]
        @source = input[:source] || input["source"]
        reminder_value = input[:reminder] || input["reminder"]
        reminder_id = input[:reminder_id] || input["reminder_id"] || input[:id] || input["id"]
        if reminder_value&.respond_to?(:remindable)
          @reminder = reminder_value
        elsif reminder_id
          if defined?(Reminder)
            @reminder = Reminder.find_by(id: reminder_id.to_i)
          end
        end
      elsif input.respond_to?(:reminder)
        @reminder_notification = input
        @reminder = input.reminder
      elsif input.respond_to?(:remindable)
        @reminder = input
      elsif input.is_a?(Integer)
        if defined?(ReminderNotification)
          @reminder_notification = ReminderNotification.find_by(id: input)
          @reminder = @reminder_notification&.reminder
        end
        if @reminder.nil? && defined?(Reminder)
          @reminder = Reminder.find_by(id: input)
        end
      end

      @remindable = @reminder&.remindable
    end

    def call
      return unless @reminder && @remindable
      if !@force && @reminder.respond_to?(:id) && @reminder.id
        dedupe_key = "flows:reminder:#{@reminder.id}"
        if Rails.cache.exist?(dedupe_key)
          Rails.logger.info("[Flows][Reminder] skipped duplicate reminder_id=#{@reminder.id}")
          return
        end
        Rails.cache.write(dedupe_key, true, expires_in: 2.minutes)
      end
      project = remindable_project
      return unless project

      flows = FlowDefinition.where(project: project)
      Rails.logger.info("[Flows][Reminder] trigger project_id=#{project.id} reminder_id=#{@reminder.id} source=#{@source} flows=#{flows.size}")
      flows.find_each do |flow|
        node = find_reminder_node(flow)
        unless node
          Rails.logger.info("[Flows][Reminder] skip flow_id=#{flow.id} missing reminder node")
          next
        end

        FlowRunnerJob.perform_later(flow.id, project.id, @reminder.creator_id, build_options(node))
      end
    end

    private

    def remindable_project
      return @remindable.project if @remindable.respond_to?(:project)
      return Project.find_by(id: @remindable.project_id) if @remindable.respond_to?(:project_id)

      nil
    end

    def find_reminder_node(flow)
      definition = flow.definition_json || {}
      nodes = definition["nodes"] || []
      nodes.find { |node| node["type"].to_s == "reminder" }
    end

    def build_options(node)
      remind_at = @reminder.remind_at
      user_zone = @reminder.creator&.time_zone
      remind_at = remind_at.in_time_zone(user_zone) if remind_at && user_zone.present?
      payload = {
        "reminder_id" => @reminder.id,
        "remind_at" => remind_at&.iso8601,
        "remind_at_date" => remind_at&.to_date&.to_s,
        "remind_at_time" => remind_at&.strftime("%H:%M"),
        "note" => @reminder.note.to_s,
        "remindable_type" => @reminder.remindable_type.to_s,
        "remindable_id" => @reminder.remindable_id
      }
      if @remindable.respond_to?(:id)
        payload["work_package_id"] = @remindable.id
      end
      if @remindable.respond_to?(:subject)
        payload["remindable_subject"] = @remindable.subject.to_s
        payload["work_package_subject"] = @remindable.subject.to_s
      end
      if @remindable.respond_to?(:id)
        begin
          path = Rails.application.routes.url_helpers.work_package_path(@remindable)
          payload["work_package_url"] = path
          if Setting.respond_to?(:host_name) && Setting.host_name.to_s.present?
            payload["work_package_url_full"] = "https://#{Setting.host_name}#{path}"
          end
        rescue StandardError
          nil
        end
      end
      if @remindable.respond_to?(:project_id)
        payload["project_id"] = @remindable.project_id
      end
      {
        start_node_id: node["id"],
        start_type: "reminder",
        payload: payload.compact,
        allow_without_contact: true,
        restrict_to_ids: true,
        source: "reminder"
      }
    end
  end
end
