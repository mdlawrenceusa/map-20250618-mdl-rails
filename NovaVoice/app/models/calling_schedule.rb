class CallingSchedule < ApplicationRecord
  # Validations
  validates :day_of_week, presence: true, inclusion: { in: 0..6 }
  validates :start_time, presence: true
  validates :end_time, presence: true
  validates :name, presence: true
  validate :end_time_after_start_time

  # Scopes
  scope :enabled, -> { where(enabled: true) }
  scope :for_day, ->(day) { where(day_of_week: day) }
  scope :current_windows, -> { enabled.where(day_of_week: Time.current.in_time_zone('EST').wday) }

  # Constants
  DAYS = {
    0 => 'Sunday',
    1 => 'Monday', 
    2 => 'Tuesday',
    3 => 'Wednesday',
    4 => 'Thursday',
    5 => 'Friday',
    6 => 'Saturday'
  }.freeze

  OPTIMAL_DAYS = [2, 3, 4].freeze # Tuesday, Wednesday, Thursday

  # Class methods
  def self.is_valid_calling_time?(datetime = Time.current)
    est_time = datetime.in_time_zone('EST')
    day_of_week = est_time.wday
    time_of_day = est_time.strftime('%H:%M:%S')

    # Check if it's an optimal calling day
    return false unless OPTIMAL_DAYS.include?(day_of_week)

    # Check Wednesday evening restriction (5:00 PM - 8:00 PM)
    if day_of_week == 3 # Wednesday
      evening_start = Time.parse('17:00:00')
      evening_end = Time.parse('20:00:00')
      current_time = Time.parse(time_of_day)
      
      return false if current_time >= evening_start && current_time <= evening_end
    end

    # Check if current time falls within any enabled calling window
    current_windows.any? do |schedule|
      current_time = Time.parse(time_of_day)
      current_time >= schedule.start_time && current_time <= schedule.end_time
    end
  end

  def self.next_available_calling_time(from_time = Time.current)
    est_time = from_time.in_time_zone('EST')
    
    # Try each of the next 14 days to find the next calling window
    (0..13).each do |days_ahead|
      check_date = est_time + days_ahead.days
      day_of_week = check_date.wday
      
      # Skip non-optimal days
      next unless OPTIMAL_DAYS.include?(day_of_week)
      
      # Get calling windows for this day
      windows = enabled.for_day(day_of_week).order(:start_time)
      
      windows.each do |window|
        window_start = check_date.beginning_of_day + 
                      window.start_time.hour.hours + 
                      window.start_time.min.minutes
        
        # Skip Wednesday evening restriction
        if day_of_week == 3 # Wednesday
          evening_start = check_date.beginning_of_day + 17.hours
          evening_end = check_date.beginning_of_day + 20.hours
          
          next if window_start >= evening_start && window_start <= evening_end
        end
        
        # If this window is in the future, return it
        if window_start > from_time
          return window_start
        end
      end
    end
    
    # If no window found in next 14 days, return next Tuesday 9 AM
    next_tuesday = est_time.next_occurring(:tuesday).beginning_of_day + 9.hours
    next_tuesday
  end

  # Instance methods
  def day_name
    DAYS[day_of_week]
  end

  def time_range
    "#{start_time.strftime('%I:%M %p')} - #{end_time.strftime('%I:%M %p')}"
  end

  private

  def end_time_after_start_time
    return unless start_time && end_time
    
    if end_time <= start_time
      errors.add(:end_time, 'must be after start time')
    end
  end
end
