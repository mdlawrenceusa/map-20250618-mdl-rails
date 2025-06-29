class NormalizeExistingPhoneNumbers < ActiveRecord::Migration[8.0]
  def up
    puts "\n=== NORMALIZING EXISTING PHONE NUMBERS ==="
    
    # Get all leads with phone numbers
    leads_with_phones = Lead.where.not(phone: [nil, ''])
    total_count = leads_with_phones.count
    
    puts "Found #{total_count} leads with phone numbers"
    
    # Track statistics
    stats = {
      total: total_count,
      already_normalized: 0,
      successfully_normalized: 0,
      failed: 0,
      updated: []
    }
    
    # Process each lead
    leads_with_phones.find_each do |lead|
      original_phone = lead.phone
      
      # Check if already normalized
      if PhoneNormalizationService.normalized?(original_phone)
        stats[:already_normalized] += 1
        next
      end
      
      # Attempt to normalize
      normalized_phone = PhoneNormalizationService.normalize(original_phone)
      
      if normalized_phone.present?
        # Update without callbacks to avoid validation during migration
        lead.update_column(:phone, normalized_phone)
        stats[:successfully_normalized] += 1
        stats[:updated] << {
          id: lead.id,
          name: lead.name,
          original: original_phone,
          normalized: normalized_phone
        }
        puts "✓ #{lead.name}: #{original_phone} → #{normalized_phone}"
      else
        stats[:failed] += 1
        puts "✗ FAILED to normalize #{lead.name}: #{original_phone.inspect}"
      end
    end
    
    puts "\n=== NORMALIZATION COMPLETE ==="
    puts "Total leads processed: #{stats[:total]}"
    puts "Already normalized: #{stats[:already_normalized]}"
    puts "Successfully normalized: #{stats[:successfully_normalized]}"
    puts "Failed to normalize: #{stats[:failed]}"
    
    if stats[:failed] > 0
      puts "\n⚠️  WARNING: #{stats[:failed]} phone numbers could not be normalized"
      puts "These records may need manual review"
    end
    
    puts "\n✅ Phone normalization migration completed successfully!"
  end
  
  def down
    puts "This migration cannot be reversed."
    puts "Phone numbers have been normalized and original formats are not stored."
    puts "If you need to revert, restore from backup."
  end
end
