class Api::V1::CallingScheduleController < ApplicationController
  before_action :set_default_response_format

  # GET /api/v1/calling_schedule/status
  def status
    render json: CallingWindowService.current_status
  end

  # GET /api/v1/calling_schedule/queue
  def queue
    page = params[:page]&.to_i || 1
    per_page = params[:per_page]&.to_i || 20
    status_filter = params[:status]

    queued_calls = CallingQueue.includes(:lead)
    queued_calls = queued_calls.where(status: status_filter) if status_filter.present?
    
    calls = queued_calls.order(:priority, :scheduled_call_time)
                       .limit(per_page)
                       .offset((page - 1) * per_page)

    response_data = {
      calls: calls.map do |call|
        {
          id: call.id,
          lead_name: call.lead.name,
          lead_phone: call.lead.phone,
          scheduled_time: call.scheduled_call_time.strftime('%m/%d/%Y at %I:%M %p %Z'),
          priority: call.priority,
          status: call.status,
          attempt_count: call.attempt_count,
          time_until_call: call.time_until_call,
          notes: call.notes,
          can_retry: call.can_retry?,
          overdue: call.overdue?
        }
      end,
      pagination: {
        current_page: page,
        per_page: per_page,
        total_count: queued_calls.count,
        total_pages: (queued_calls.count.to_f / per_page).ceil
      },
      summary: {
        pending: CallingQueue.pending.count,
        processing: CallingQueue.where(status: 'processing').count,
        completed: CallingQueue.completed.count,
        failed: CallingQueue.failed.count,
        ready_to_call: CallingQueue.ready_to_call.count
      }
    }

    render json: response_data
  end

  # POST /api/v1/calling_schedule/schedule
  def schedule
    lead_ids = params[:lead_ids] || []
    priority = params[:priority]&.to_i || 1
    notes = params[:notes]

    if lead_ids.empty?
      render json: { error: 'No lead IDs provided' }, status: :bad_request
      return
    end

    leads = Lead.where(id: lead_ids)
    
    if params[:bulk] == 'true'
      results = CallingWindowService.bulk_schedule_calls(leads, priority: priority)
    else
      results = { scheduled: 0, skipped: 0, errors: [] }
      
      leads.each do |lead|
        if lead.schedule_call(priority: priority, notes: notes)
          results[:scheduled] += 1
        else
          results[:skipped] += 1
          results[:errors] << "Could not schedule call for #{lead.name}"
        end
      end
    end

    render json: results
  end

  # GET /api/v1/calling_schedule/analytics
  def analytics
    period = params[:period] || 'week'
    analytics_data = CallingWindowService.analytics(period: period)
    
    # Add additional metrics
    analytics_data.merge!(
      calling_windows: CallingWindowService.weekly_schedule,
      current_status: CallingWindowService.current_status,
      queue_metrics: {
        total_pending: CallingQueue.pending.count,
        overdue_calls: CallingQueue.pending.where('scheduled_call_time < ?', Time.current).count,
        high_priority: CallingQueue.pending.where(priority: 1).count,
        retry_needed: CallingQueue.failed.where('attempt_count < ?', CallingQueue::MAX_ATTEMPTS).count
      }
    )

    render json: analytics_data
  end

  # POST /api/v1/calling_schedule/process
  def process_queue
    unless CallingWindowService.calling_allowed?
      render json: { 
        error: 'Calling not allowed at this time',
        current_status: CallingWindowService.current_status
      }, status: :unprocessable_entity
      return
    end

    limit = params[:limit]&.to_i || 10
    results = CallingWindowService.process_queue(limit: limit)
    
    render json: results
  end

  # POST /api/v1/calling_schedule/reschedule_failed
  def reschedule_failed
    results = CallingWindowService.reschedule_failed_calls
    render json: results
  end

  # GET /api/v1/calling_schedule/windows
  def windows
    render json: {
      weekly_schedule: CallingWindowService.weekly_schedule,
      today_windows: CallingWindowService.active_windows_today,
      next_window: CallingWindowService.next_calling_window
    }
  end

  # PUT /api/v1/calling_schedule/restrictions
  def update_restrictions
    # This would be for admin users to update calling windows
    # For now, return the current schedule
    render json: {
      message: 'Schedule update endpoint - to be implemented',
      current_schedule: CallingSchedule.enabled.order(:day_of_week, :start_time)
    }
  end

  private

  def set_default_response_format
    request.format = :json unless params[:format]
  end
end
