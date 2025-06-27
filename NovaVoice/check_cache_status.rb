# Check current cache status
cache_key = "prompt:system"
cached_data = Rails.cache.read(cache_key)

if cached_data
  puts "System prompt is CACHED:"
  puts "  Name: #{cached_data[:name]}"
  puts "  Version: #{cached_data[:version]}"
  puts "  Created: #{cached_data[:created_at]}"
  
  # Check how old the cache is (Rails doesn't expose TTL directly)
  # You'd need to track this separately or use Redis commands
  puts "\nCache will expire in < 1 hour"
else
  puts "System prompt is NOT cached (will fetch from DB on next request)"
end

# Check all prompt cache keys
puts "\nAll cached prompt keys:"
if Rails.cache.respond_to?(:keys)
  Rails.cache.keys("prompt:*").each do |key|
    puts "  - #{key}"
  end
else
  puts "  (Cache backend doesn't support key listing)"
end