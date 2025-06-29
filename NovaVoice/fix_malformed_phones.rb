#!/usr/bin/env ruby

# Fix the 2 remaining malformed phone numbers
require_relative 'config/environment'

puts "=== FIXING MALFORMED PHONE NUMBERS ==="
puts

# Find the two problematic leads
malformed_leads = Lead.where("phone NOT LIKE ? AND phone != ?", "+1 (%", "")

malformed_leads.each do |lead|
  puts "Lead: #{lead.name}"
  puts "Current phone: #{lead.phone.inspect}"
  
  case lead.phone
  when "+5166272270213"
    # This looks like it should be +1 (516) 627-2270 with extra digits
    # Extract the first 11 digits and format properly
    digits = lead.phone.gsub(/\D/, '')[1..-1] # Remove + and first digit
    if digits.length >= 10
      formatted = "+1 (#{digits[0..2]}) #{digits[3..5]}-#{digits[6..9]}"
      puts "Proposed fix: #{formatted}"
      lead.update_column(:phone, formatted)
      puts "✓ Updated"
    else
      puts "✗ Cannot fix - insufficient digits"
    end
  when "+1234567890"
    # This is clearly a placeholder/test number
    puts "This appears to be a test number - setting to blank"
    lead.update_column(:phone, "")
    puts "✓ Cleared test number"
  else
    puts "✗ Unknown format - needs manual review"
  end
  
  puts
end

puts "=== CLEANUP COMPLETE ==="