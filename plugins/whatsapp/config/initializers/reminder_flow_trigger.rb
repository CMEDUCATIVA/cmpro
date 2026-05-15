# frozen_string_literal: true

Rails.application.config.to_prepare do
  module Flows
    module ReminderNotificationHook
      def trigger_flow_reminder
        Flows::ReminderTriggerService.call(self)
      rescue StandardError => error
        Rails.logger.error("[Flows][Reminder] trigger failed: #{error.message}")
      end
    end

    module ScheduleReminderJobHook
      def perform(*args, **kwargs)
        Rails.logger.info("[Flows][Reminder] schedule hook args=#{args.map { |item| item.class.name }.join(',')} kwargs=#{kwargs.keys.join(',')}")
        result = super
        input = extract_reminder_input(args, kwargs)
        Flows::ReminderTriggerService.call({ reminder: input, source: "schedule" }) if input
        result
      rescue StandardError => error
        Rails.logger.error("[Flows][Reminder] schedule hook failed: #{error.message}")
        raise
      end

      private

      def extract_reminder_input(args, kwargs)
        candidates = []
        candidates << kwargs[:reminder] if kwargs.key?(:reminder)
        candidates << kwargs[:reminder_id] if kwargs.key?(:reminder_id)
        candidates << kwargs[:id] if kwargs.key?(:id)
        candidates.concat(args)
        candidates.each do |item|
          next if item.nil?
          return item if item.respond_to?(:remindable)
          return item if item.respond_to?(:reminder)
          if item.is_a?(Hash)
            return item if item[:reminder] || item["reminder"] || item[:reminder_id] || item["reminder_id"] || item[:id] || item["id"]
          end
          if item.is_a?(Integer)
            return item
          end
          if item.is_a?(String)
            value = item.to_i
            return value if value > 0
          end
        end
        nil
      end
    end

    module ReminderNotificationJobHook
      def perform(*args, **kwargs)
        Rails.logger.info("[Flows][Reminder] delivery hook args=#{args.map { |item| item.class.name }.join(',')} kwargs=#{kwargs.keys.join(',')}")
        result = super
        input = extract_reminder_input(args, kwargs)
        Flows::ReminderTriggerService.call({ reminder: input, source: "delivery" }) if input
        result
      rescue StandardError => error
        Rails.logger.error("[Flows][Reminder] delivery hook failed: #{error.message}")
        raise
      end

      private

      def extract_reminder_input(args, kwargs)
        candidates = []
        candidates << kwargs[:reminder] if kwargs.key?(:reminder)
        candidates << kwargs[:reminder_id] if kwargs.key?(:reminder_id)
        candidates << kwargs[:notification] if kwargs.key?(:notification)
        candidates << kwargs[:notification_id] if kwargs.key?(:notification_id)
        candidates << kwargs[:id] if kwargs.key?(:id)
        candidates.concat(args)
        candidates.each do |item|
          next if item.nil?
          return item if item.respond_to?(:remindable)
          return item if item.respond_to?(:reminder)
          if item.is_a?(Hash)
            return item if item[:reminder] || item["reminder"] || item[:reminder_id] || item["reminder_id"] || item[:id] || item["id"]
          end
          if item.is_a?(Integer)
            return item
          end
          if item.is_a?(String)
            value = item.to_i
            return value if value > 0
          end
        end
        nil
      end
    end
  end

  # Disabled: reminder notification hook caused duplicate flow runs in this environment.
  # if defined?(ReminderNotification) && !ReminderNotification.included_modules.include?(Flows::ReminderNotificationHook)
  #   ReminderNotification.include(Flows::ReminderNotificationHook)
  #   ReminderNotification.after_commit :trigger_flow_reminder, on: :create
  # end

  if defined?(Reminders::ScheduleReminderJob) && !Reminders::ScheduleReminderJob.included_modules.include?(Flows::ScheduleReminderJobHook)
    Reminders::ScheduleReminderJob.prepend(Flows::ScheduleReminderJobHook)
  end

  # Disabled: delivery job fires after schedule and caused duplicate flow runs.
  # if defined?(Mails::Reminders::NotificationDeliveryJob) && !Mails::Reminders::NotificationDeliveryJob.included_modules.include?(Flows::ReminderNotificationJobHook)
  #   Mails::Reminders::NotificationDeliveryJob.prepend(Flows::ReminderNotificationJobHook)
  # end
end
