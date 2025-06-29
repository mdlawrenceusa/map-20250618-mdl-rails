class Lead < ApplicationRecord
  # Associations
  has_many :calling_queues, dependent: :destroy
  has_one :current_calling_queue, -> { where(status: 'pending') }, class_name: 'CallingQueue'

  # Validations
  validates :name, presence: true
  validates :time_zone, inclusion: { in: %w[EST CST MST PST EDT CDT MDT PDT] }
  validates :phone, format: { 
    with: PhoneNormalizationService::STANDARD_FORMAT,
    message: "must be in format +1 (XXX) XXX-XXXX"
  }, allow_blank: true

  # Scopes
  scope :callable, -> { where(calling_schedule_enabled: true).where.not(phone: [nil, '']) }
  scope :in_queue, -> { joins(:current_calling_queue) }
  scope :not_in_queue, -> { left_joins(:current_calling_queue).where(calling_queues: { id: nil }) }
  scope :callable_now, -> { callable.where('next_available_call_time <= ? OR next_available_call_time IS NULL', Time.current) }

  # Callbacks
  before_validation :normalize_phone_number
  after_create :set_initial_call_time

  # Instance methods
  def callable?
    calling_schedule_enabled? && phone.present?
  end

  def can_call_now?
    return false unless callable?
    return true if next_available_call_time.nil?
    
    CallingSchedule.is_valid_calling_time? && 
      (next_available_call_time <= Time.current)
  end

  def schedule_call(priority: 1, notes: nil)
    return false unless callable?
    
    CallingQueue.schedule_call(self, priority: priority, notes: notes)
  end

  def time_until_next_call
    return 0 unless next_available_call_time
    return 0 if next_available_call_time <= Time.current
    
    time_diff = next_available_call_time - Time.current
    
    if time_diff < 1.hour
      "#{(time_diff / 60).round} minutes"
    elsif time_diff < 24.hours
      "#{(time_diff / 1.hour).round(1)} hours"
    else
      "#{(time_diff / 24.hours).round(1)} days"
    end
  end

  def last_call_status
    return 'Never called' unless last_call_attempt
    
    last_queue = calling_queues.where('last_attempt_at IS NOT NULL')
                              .order(last_attempt_at: :desc)
                              .first
    
    return 'Unknown' unless last_queue
    
    case last_queue.status
    when 'completed'
      'Successfully contacted'
    when 'failed'
      "Failed: #{last_queue.failure_reason}"
    when 'cancelled'
      'Cancelled'
    else
      'In progress'
    end
  end

  def calling_statistics
    {
      total_attempts: calling_queues.count,
      successful_calls: calling_queues.completed.count,
      failed_calls: calling_queues.failed.count,
      last_call: last_call_attempt&.strftime('%m/%d/%Y at %I:%M %p'),
      success_rate: calling_queues.count > 0 ? 
        (calling_queues.completed.count.to_f / calling_queues.count * 100).round(1) : 0
    }
  end

  # Phone number utility methods
  def phone_e164
    PhoneNormalizationService.to_e164(phone)
  end

  def phone_digits_only
    PhoneNormalizationService.to_digits_only(phone)
  end

  def phone_normalized?
    PhoneNormalizationService.normalized?(phone)
  end

  def update_next_call_time!
    if calling_schedule_enabled?
      next_time = CallingSchedule.next_available_calling_time
      update(next_available_call_time: next_time)
    else
      update(next_available_call_time: nil)
    end
  end

  private

  def normalize_phone_number
    return if phone.blank?
    
    normalized = PhoneNormalizationService.normalize(phone)
    if normalized.present?
      self.phone = normalized
    else
      # Keep original if normalization fails for validation to catch it
      Rails.logger.warn "Failed to normalize phone number: #{phone.inspect} for lead #{name}"
    end
  end

  def set_initial_call_time
    return unless calling_schedule_enabled?
    
    next_time = CallingSchedule.next_available_calling_time
    update_column(:next_available_call_time, next_time)
  end
end
