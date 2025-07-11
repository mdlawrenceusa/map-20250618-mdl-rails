require 'aws-sdk-dynamodb'

class CallFrequencyGuard
  LOOKBACK_HOURS = 24
  TABLE_NAME = 'nova-sonic-call-records'
  
  # Numbers exempt from frequency protection (for testing/admin)
  EXEMPT_NUMBERS = [
    '13472005533'  # User's number for testing
  ].freeze
  
  def initialize
    @dynamodb = Aws::DynamoDB::Client.new(region: ENV['AWS_REGION'] || 'us-east-1')
  end
  
  # Check if a phone number has been called within the lookback period
  def recently_called?(phone_number, hours_ago: LOOKBACK_HOURS)
    formatted_phone = format_phone(phone_number)
    digits_only = phone_number.gsub(/\D/, '').last(10)
    
    # Check if number is exempt from frequency protection
    if EXEMPT_NUMBERS.any? { |exempt| exempt.include?(digits_only) }
      Rails.logger.info "🔓 EXEMPT NUMBER: #{phone_number} is exempt from frequency protection"
      return false
    end
    
    cutoff_time = Time.current - hours_ago.hours
    
    Rails.logger.info "🛡️ Checking call frequency for #{phone_number} (formatted: #{formatted_phone}, last #{hours_ago} hours)"
    
    begin
      # Use Rails approach: full scan then filter in Ruby
      # This avoids DynamoDB filter expression issues
      response = @dynamodb.scan(table_name: TABLE_NAME)
      
      # Filter for matching phone and recent time in Ruby
      recent_calls = response.items.select do |item|
        phone_matches = item['phone_number'] == formatted_phone
        time_matches = item['start_time'] && item['start_time'] >= cutoff_time.iso8601
        phone_matches && time_matches
      end
      
      recent_call_count = recent_calls.count
      
      if recent_call_count > 0
        Rails.logger.warn "🚫 FREQUENCY PROTECTION: #{formatted_phone} was called #{recent_call_count} time(s) in last #{hours_ago} hours"
        return true
      else
        Rails.logger.info "✅ FREQUENCY CHECK PASSED: #{formatted_phone} has not been called in last #{hours_ago} hours"
        return false
      end
      
    rescue Aws::DynamoDB::Errors::ServiceError => e
      Rails.logger.error "❌ DynamoDB error checking call frequency: #{e.message}"
      # Fail safe - allow the call but log the error
      return false
    end
  end
  
  # Get recent call details for a phone number
  def get_recent_calls(phone_number, hours_ago: LOOKBACK_HOURS)
    cutoff_time = Time.current - hours_ago.hours
    formatted_phone = format_phone(phone_number)
    
    begin
      # Use Rails approach: full scan then filter in Ruby
      response = @dynamodb.scan(table_name: TABLE_NAME)
      
      # Filter for matching phone and recent time, then map
      filtered_items = response.items.select do |item|
        phone_matches = item['phone_number'] == formatted_phone
        time_matches = item['start_time'] && item['start_time'] >= cutoff_time.iso8601
        phone_matches && time_matches
      end
      
      calls = filtered_items.map do |item|
        {
          call_uuid: item['call_uuid'],
          start_time: item['start_time'],
          end_time: item['end_time'],
          duration_seconds: item['duration_seconds']&.to_i,
          completion_status: item['status']
        }
      end
      
      Rails.logger.info "📞 Found #{calls.count} recent calls for #{formatted_phone}"
      calls.sort_by { |call| call[:start_time] }.reverse
      
    rescue Aws::DynamoDB::Errors::ServiceError => e
      Rails.logger.error "❌ DynamoDB error getting recent calls: #{e.message}"
      []
    end
  end
  
  # Check and log recent call activity for debugging
  def analyze_recent_activity(phone_number)
    recent_calls = get_recent_calls(phone_number)
    
    if recent_calls.any?
      Rails.logger.info "📊 RECENT CALL ANALYSIS for #{phone_number}:"
      recent_calls.each_with_index do |call, i|
        time_ago = Time.current - Time.parse(call[:start_time])
        hours_ago = (time_ago / 1.hour).round(1)
        
        Rails.logger.info "   #{i + 1}. #{hours_ago}h ago - Duration: #{call[:duration_seconds]}s - Status: #{call[:completion_status]} - UUID: #{call[:call_uuid]}"
      end
    else
      Rails.logger.info "📊 No recent calls found for #{phone_number}"
    end
    
    recent_calls
  end
  
  private
  
  def format_phone(phone)
    # DynamoDB stores numbers as "15169380383" (11 digits with leading 1)
    digits = phone.gsub(/\D/, '')
    digits = digits.last(10) if digits.length > 10
    "1#{digits}"
  end
end