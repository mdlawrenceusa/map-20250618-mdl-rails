# Phone Number Normalization Service
# Standardizes phone numbers to +1 (XXX) XXX-XXXX format for NovaVoice
class PhoneNormalizationService
  # Standard US phone number format for NovaVoice system
  STANDARD_FORMAT = /\A\+1 \(\d{3}\) \d{3}-\d{4}\z/
  
  class << self
    # Normalize a phone number to +1 (XXX) XXX-XXXX format
    def normalize(phone_number)
      return nil if phone_number.blank?
      
      # Remove all non-digit characters first
      digits = phone_number.gsub(/\D/, '')
      
      # Handle different digit counts
      case digits.length
      when 10
        # US number without country code: 5169380383 -> +1 (516) 938-0383
        format_us_number(digits)
      when 11
        # US number with country code: 15169380383 -> +1 (516) 938-0383
        if digits.start_with?('1')
          format_us_number(digits[1..-1])
        else
          nil # Invalid: 11 digits but doesn't start with 1
        end
      when 7
        # Local number (no area code) - cannot normalize without area code
        nil
      else
        # Invalid length
        nil
      end
    end
    
    # Check if phone number is already in standard format
    def normalized?(phone_number)
      return false if phone_number.blank?
      phone_number.match?(STANDARD_FORMAT)
    end
    
    # Validate that a phone number can be normalized
    def valid?(phone_number)
      normalize(phone_number).present?
    end
    
    # Extract just the digits for API calls (E.164 format without formatting)
    def to_e164(phone_number)
      return nil if phone_number.blank?
      
      normalized = normalize(phone_number)
      return nil if normalized.blank?
      
      # Extract digits and prepend +1
      digits = normalized.gsub(/\D/, '')
      "+1#{digits}"
    end
    
    # Extract 10-digit number for internal use
    def to_digits_only(phone_number)
      return nil if phone_number.blank?
      
      normalized = normalize(phone_number)
      return nil if normalized.blank?
      
      # Extract just the 10 digits
      normalized.gsub(/\D/, '')[1..-1] # Remove country code
    end
    
    # Bulk normalize phone numbers with statistics
    def bulk_normalize(phone_numbers)
      results = {
        total: phone_numbers.length,
        normalized: 0,
        already_normalized: 0,
        failed: 0,
        details: []
      }
      
      phone_numbers.each do |original|
        if normalized?(original)
          results[:already_normalized] += 1
          results[:details] << { original: original, normalized: original, status: :already_normalized }
        elsif (normalized = normalize(original))
          results[:normalized] += 1
          results[:details] << { original: original, normalized: normalized, status: :normalized }
        else
          results[:failed] += 1
          results[:details] << { original: original, normalized: nil, status: :failed }
        end
      end
      
      results
    end
    
    private
    
    # Format 10 digits to +1 (XXX) XXX-XXXX
    def format_us_number(ten_digits)
      return nil unless ten_digits.length == 10
      return nil unless ten_digits.match?(/\A\d{10}\z/)
      
      # Validate area code (first 3 digits)
      area_code = ten_digits[0..2]
      return nil if area_code.start_with?('0', '1') # Invalid area codes
      
      # Validate exchange (next 3 digits)  
      exchange = ten_digits[3..5]
      return nil if exchange.start_with?('0', '1') # Invalid exchanges
      
      # Format: +1 (XXX) XXX-XXXX
      "+1 (#{area_code}) #{exchange}-#{ten_digits[6..9]}"
    end
  end
end