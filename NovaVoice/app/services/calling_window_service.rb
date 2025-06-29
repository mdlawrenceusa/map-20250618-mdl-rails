class CallingWindowService
  include ActiveSupport::Configurable

  # Configuration
  config_accessor :time_zone, default: 'EST'
  config_accessor :max_daily_calls, default: 100
  config_accessor :call_rate_per_minute, default: 2

  class << self
    # Check if calling is currently allowed
    def calling_allowed?(time = Time.current)
      CallingSchedule.is_valid_calling_time?(time)
    end

    # Get current calling window status
    def current_status
      now = Time.current.in_time_zone(config.time_zone)
      
      {
        calling_allowed: calling_allowed?,
        current_time: now.strftime('%I:%M %p %Z'),
        current_day: now.strftime('%A'),
        next_window: next_calling_window,
        active_windows: active_windows_today,
        queue_size: CallingQueue.pending.count,
        calls_ready: CallingQueue.ready_to_call.count
      }
    end

    # Get next available calling window
    def next_calling_window
      next_time = CallingSchedule.next_available_calling_time
      
      {
        datetime: next_time,
        formatted: next_time.strftime('%A, %B %d at %I:%M %p %Z'),
        hours_away: ((next_time - Time.current) / 1.hour).round(1)
      }
    end

    # Get today's calling windows
    def active_windows_today
      today = Time.current.in_time_zone(config.time_zone)
      day_of_week = today.wday
      
      CallingSchedule.enabled
                    .for_day(day_of_week)
                    .order(:start_time)
                    .map do |window|
        window_start = today.beginning_of_day + 
                      window.start_time.hour.hours + 
                      window.start_time.min.minutes
        window_end = today.beginning_of_day + 
                    window.end_time.hour.hours + 
                    window.end_time.min.minutes

        {
          name: window.name,
          start_time: window_start,
          end_time: window_end,
          formatted: "#{window.start_time.strftime('%I:%M %p')} - #{window.end_time.strftime('%I:%M %p')}",
          active: window_start <= Time.current && Time.current <= window_end,
          upcoming: window_start > Time.current
        }
      end
    end

    # Get weekly calling schedule overview
    def weekly_schedule
      schedule = {}
      
      CallingSchedule::DAYS.each do |day_num, day_name|
        windows = CallingSchedule.enabled.for_day(day_num).order(:start_time)
        optimal = CallingSchedule::OPTIMAL_DAYS.include?(day_num)
        
        schedule[day_name.downcase.to_sym] = {
          day_number: day_num,
          optimal_day: optimal,
          windows: windows.map do |window|
            {
              name: window.name,
              time_range: window.time_range,
              description: window.description
            }
          end,
          total_hours: calculate_daily_hours(windows)
        }
      end
      
      schedule
    end

    # Process calling queue
    def process_queue(limit: 10)
      return { error: 'Calling not allowed at this time' } unless calling_allowed?

      ready_calls = CallingQueue.next_calls(limit)
      
      results = {
        processed: 0,
        success: 0,
        failed: 0,
        calls: []
      }

      ready_calls.each do |queue_item|
        begin
          queue_item.mark_processing!
          
          # Simulate call attempt (replace with actual calling logic)
          call_result = attempt_call(queue_item.lead)
          
          if call_result[:success]
            queue_item.mark_completed!(call_result[:notes])
            results[:success] += 1
          else
            queue_item.mark_failed!(call_result[:reason])
            results[:failed] += 1
          end
          
          results[:calls] << {
            lead_name: queue_item.lead.name,
            status: queue_item.status,
            notes: call_result[:notes] || call_result[:reason]
          }
          
          results[:processed] += 1
          
        rescue => e
          queue_item.mark_failed!("System error: #{e.message}", reschedule: true)
          results[:failed] += 1
          
          Rails.logger.error "Calling queue error for lead #{queue_item.lead.id}: #{e.message}"
        end
      end

      results
    end

    # Reschedule failed calls
    def reschedule_failed_calls
      count = CallingQueue.reschedule_failed_calls
      
      {
        rescheduled: count,
        message: "#{count} failed calls rescheduled for next available window"
      }
    end

    # Get calling analytics
    def analytics(period: 'week')
      end_time = Time.current
      start_time = case period
                  when 'day' then end_time.beginning_of_day
                  when 'week' then end_time.beginning_of_week
                  when 'month' then end_time.beginning_of_month
                  when 'quarter' then end_time.beginning_of_quarter
                  else end_time.beginning_of_week
                  end

      calls = CallingQueue.where(created_at: start_time..end_time)
      optimal_data = calls_during_optimal_times(calls)
      
      {
        period: period,
        total_calls: calls.count,
        completed_calls: calls.completed.count,
        failed_calls: calls.failed.count,
        pending_calls: calls.pending.count,
        successful_calls: calls.completed.count,
        success_rate: calls.count > 0 ? (calls.completed.count.to_f / calls.count * 100).round(1) : 0,
        average_attempts: calls.average(:attempt_count)&.round(1) || 0,
        optimal_time_calls: optimal_data[:count],
        non_optimal_time_calls: calls.count - optimal_data[:count],
        optimal_success_rate: optimal_data[:percentage],
        non_optimal_success_rate: calls.count > 0 ? (100 - optimal_data[:percentage]).round(1) : 0,
        queue_wait_time: average_queue_wait_time(calls),
        calls_by_day: calls_by_day_breakdown(calls),
        avg_call_duration: "#{average_queue_wait_time(calls)}h"
      }
    end

    # Bulk schedule calls for leads
    def bulk_schedule_calls(leads, priority: 1)
      results = {
        scheduled: 0,
        skipped: 0,
        errors: []
      }

      leads.each do |lead|
        begin
          if lead.callable? && !lead.current_calling_queue
            if lead.schedule_call(priority: priority)
              results[:scheduled] += 1
            else
              results[:skipped] += 1
              results[:errors] << "Could not schedule call for #{lead.name}"
            end
          else
            results[:skipped] += 1
          end
        rescue => e
          results[:errors] << "Error scheduling #{lead.name}: #{e.message}"
        end
      end

      results
    end

    private

    def calculate_daily_hours(windows)
      total_minutes = windows.sum do |window|
        start_minutes = window.start_time.hour * 60 + window.start_time.min
        end_minutes = window.end_time.hour * 60 + window.end_time.min
        end_minutes - start_minutes
      end
      
      (total_minutes / 60.0).round(1)
    end

    def attempt_call(lead)
      # This is a placeholder for actual calling logic
      # In production, this would integrate with the Nova Sonic microservice
      
      # Simulate random success/failure for demonstration
      if rand > 0.3 # 70% success rate
        {
          success: true,
          notes: "Successfully connected with #{lead.name}"
        }
      else
        {
          success: false,
          reason: "No answer"
        }
      end
    end

    def calls_during_optimal_times(calls)
      optimal_count = 0
      
      calls.each do |call|
        if call.last_attempt_at && CallingSchedule.is_valid_calling_time?(call.last_attempt_at)
          optimal_count += 1
        end
      end
      
      {
        count: optimal_count,
        percentage: calls.count > 0 ? (optimal_count.to_f / calls.count * 100).round(1) : 0
      }
    end

    def average_queue_wait_time(calls)
      wait_times = calls.where.not(last_attempt_at: nil).map do |call|
        (call.last_attempt_at - call.created_at) / 1.hour
      end
      
      wait_times.empty? ? 0 : (wait_times.sum / wait_times.length).round(1)
    end

    def calls_by_day_breakdown(calls)
      breakdown = {
        monday: 0,
        tuesday: 0,
        wednesday: 0,
        thursday: 0,
        friday: 0,
        saturday: 0,
        sunday: 0
      }
      
      calls.each do |call|
        day_name = call.created_at.strftime('%A').downcase.to_sym
        breakdown[day_name] += 1 if breakdown.key?(day_name)
      end
      
      breakdown
    end
  end
end