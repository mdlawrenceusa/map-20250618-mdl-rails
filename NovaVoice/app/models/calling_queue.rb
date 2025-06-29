class CallingQueue < ApplicationRecord
  # Associations
  belongs_to :lead

  # Validations
  validates :scheduled_call_time, presence: true
  validates :priority, presence: true, numericality: { greater_than: 0 }
  validates :status, presence: true, inclusion: { in: %w[pending processing completed failed cancelled] }
  validates :attempt_count, presence: true, numericality: { greater_than_or_equal_to: 0 }

  # Scopes
  scope :pending, -> { where(status: 'pending') }
  scope :ready_to_call, -> { pending.where('scheduled_call_time <= ?', Time.current) }
  scope :by_priority, -> { order(:priority, :scheduled_call_time) }
  scope :failed, -> { where(status: 'failed') }
  scope :completed, -> { where(status: 'completed') }

  # Constants
  MAX_ATTEMPTS = 3
  RETRY_DELAY_HOURS = 24

  # Callbacks
  before_save :update_next_available_call_time, if: :scheduled_call_time_changed?

  # Class methods
  def self.schedule_call(lead, priority: 1, notes: nil)
    # Check if lead has calling enabled
    return false unless lead.calling_schedule_enabled?

    # Calculate next available calling time
    next_call_time = CallingSchedule.next_available_calling_time

    # Create or update existing queue entry
    queue_entry = find_or_initialize_by(lead: lead, status: 'pending')
    queue_entry.assign_attributes(
      scheduled_call_time: next_call_time,
      priority: priority,
      notes: notes,
      attempt_count: 0
    )
    
    if queue_entry.save
      # Update lead's next available call time
      lead.update(next_available_call_time: next_call_time)
      queue_entry
    else
      false
    end
  end

  def self.next_calls(limit = 10)
    ready_to_call
      .joins(:lead)
      .where(leads: { calling_schedule_enabled: true })
      .by_priority
      .limit(limit)
  end

  def self.reschedule_failed_calls
    failed_calls = failed.where('last_attempt_at < ?', RETRY_DELAY_HOURS.hours.ago)
                        .where('attempt_count < ?', MAX_ATTEMPTS)

    failed_calls.each do |call|
      next_time = CallingSchedule.next_available_calling_time
      call.update(
        status: 'pending',
        scheduled_call_time: next_time,
        failure_reason: nil
      )
    end

    failed_calls.count
  end

  # Instance methods
  def mark_processing!
    update!(
      status: 'processing',
      last_attempt_at: Time.current
    )
  end

  def mark_completed!(notes = nil)
    update!(
      status: 'completed',
      notes: [self.notes, notes].compact.join("\n")
    )
    
    # Update lead's last call attempt
    lead.update(last_call_attempt: Time.current)
  end

  def mark_failed!(reason, reschedule: true)
    increment!(:attempt_count)
    
    if attempt_count >= MAX_ATTEMPTS || !reschedule
      update!(
        status: 'failed',
        failure_reason: reason,
        last_attempt_at: Time.current
      )
    else
      # Reschedule for next available window
      next_time = CallingSchedule.next_available_calling_time(Time.current + RETRY_DELAY_HOURS.hours)
      update!(
        status: 'pending',
        scheduled_call_time: next_time,
        failure_reason: reason,
        last_attempt_at: Time.current
      )
    end
  end

  def cancel!(reason = nil)
    update!(
      status: 'cancelled',
      failure_reason: reason
    )
  end

  def time_until_call
    return 0 if scheduled_call_time <= Time.current
    ((scheduled_call_time - Time.current) / 1.hour).round(1)
  end

  def can_retry?
    attempt_count < MAX_ATTEMPTS
  end

  def overdue?
    scheduled_call_time < Time.current && status == 'pending'
  end

  private

  def update_next_available_call_time
    return unless lead&.persisted?
    
    lead.update_column(:next_available_call_time, scheduled_call_time)
  end
end
