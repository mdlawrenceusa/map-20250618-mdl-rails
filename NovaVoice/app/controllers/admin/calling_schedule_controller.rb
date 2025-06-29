class Admin::CallingScheduleController < ApplicationController
  def index
    @current_status = CallingWindowService.current_status
    @weekly_schedule = CallingWindowService.weekly_schedule
    @calling_schedules = CallingSchedule.order(:day_of_week, :start_time)
    @queue_summary = {
      pending: CallingQueue.pending.count,
      processing: CallingQueue.where(status: 'processing').count,
      completed: CallingQueue.completed.count,
      failed: CallingQueue.failed.count,
      ready_to_call: CallingQueue.ready_to_call.count
    }
  end

  def queue
    @status_filter = params[:status]

    # Load all calls for DataTables client-side processing
    @queued_calls = CallingQueue.includes(:lead)
    @queued_calls = @queued_calls.where(status: @status_filter) if @status_filter.present?
    
    @calls = @queued_calls.order(:priority, :scheduled_call_time)

    @queue_summary = {
      pending: CallingQueue.pending.count,
      processing: CallingQueue.where(status: 'processing').count,
      completed: CallingQueue.completed.count,
      failed: CallingQueue.failed.count,
      ready_to_call: CallingQueue.ready_to_call.count
    }
  end

  def analytics
    @period = params[:period] || 'week'
    @analytics = CallingWindowService.analytics(period: @period)
    @current_status = CallingWindowService.current_status
    
    # Additional analytics data
    @lead_stats = {
      total_leads: Lead.count,
      callable_leads: Lead.callable.count,
      leads_in_queue: Lead.in_queue.count,
      leads_never_called: Lead.where(last_call_attempt: nil).count
    }

    @recent_calls = CallingQueue.includes(:lead)
                               .where('created_at > ?', 24.hours.ago)
                               .order(created_at: :desc)
                               .limit(10)
  end

  def schedule_calls
    lead_ids = params[:lead_ids] || []
    priority = params[:priority]&.to_i || 1

    if lead_ids.empty?
      redirect_to admin_calling_schedule_queue_path, alert: 'No leads selected'
      return
    end

    leads = Lead.where(id: lead_ids)
    results = CallingWindowService.bulk_schedule_calls(leads, priority: priority)

    message = "Scheduled #{results[:scheduled]} calls"
    message += ", skipped #{results[:skipped]}" if results[:skipped] > 0
    message += ". Errors: #{results[:errors].join(', ')}" if results[:errors].any?

    redirect_to admin_calling_schedule_queue_path, notice: message
  end

  def process_queue
    unless CallingWindowService.calling_allowed?
      redirect_to admin_calling_schedule_index_path, 
                  alert: 'Calling not allowed at this time'
      return
    end

    limit = params[:limit]&.to_i || 10
    results = CallingWindowService.process_queue(limit: limit)

    message = "Processed #{results[:processed]} calls: #{results[:success]} successful, #{results[:failed]} failed"
    redirect_to admin_calling_schedule_queue_path, notice: message
  end

  def reschedule_failed
    results = CallingWindowService.reschedule_failed_calls
    redirect_to admin_calling_schedule_queue_path, 
                notice: "Rescheduled #{results[:rescheduled]} failed calls"
  end
end
