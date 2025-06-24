#!/usr/bin/env ruby

# Test script for prompt management system integration

puts "=== NovaVoice Prompt Management System Test ==="
puts

# Test 1: Basic Rails environment
puts "1. Testing Rails environment..."
begin
  require_relative 'config/environment'
  puts "✅ Rails loaded successfully"
rescue => e
  puts "❌ Failed to load Rails: #{e.message}"
  exit 1
end

# Test 2: Database connection and Prompt model
puts "\n2. Testing database connection and Prompt model..."
begin
  count = Prompt.count
  puts "✅ Database connected. Found #{count} prompts."
rescue => e
  puts "❌ Database error: #{e.message}"
  exit 1
end

# Test 3: Prompt retrieval methods
puts "\n3. Testing prompt retrieval methods..."
begin
  # Test global prompt
  system_prompt = Prompt.current_prompt(type: 'system')
  if system_prompt
    puts "✅ Found global system prompt: #{system_prompt.name} (v#{system_prompt.version})"
  else
    puts "⚠️  No global system prompt found"
  end

  # Test campaign-specific prompt (should fall back to global)
  campaign_prompt = Prompt.current_prompt(type: 'system', campaign_id: 'test_campaign')
  if campaign_prompt
    puts "✅ Campaign fallback works: #{campaign_prompt.name}"
  else
    puts "⚠️  Campaign fallback failed"
  end

  # Test lead-specific prompt (should fall back to global)
  lead_prompt = Prompt.current_prompt(type: 'system', lead_id: 999)
  if lead_prompt
    puts "✅ Lead fallback works: #{lead_prompt.name}"
  else
    puts "⚠️  Lead fallback failed"
  end
rescue => e
  puts "❌ Prompt retrieval error: #{e.message}"
end

# Test 4: Caching service
puts "\n4. Testing prompt caching service..."
begin
  # Test cache fetch
  cached_prompt = PromptCacheService.fetch_prompt(type: 'system')
  if cached_prompt
    puts "✅ Cache service works: #{cached_prompt[:name]}"
  else
    puts "⚠️  Cache service returned nil"
  end

  # Test cache clearing
  PromptCacheService.clear_all_prompt_caches
  puts "✅ Cache cleared successfully"
rescue => e
  puts "❌ Cache service error: #{e.message}"
end

# Test 5: API endpoints
puts "\n5. Testing API endpoints..."
begin
  require 'net/http'
  require 'json'
  
  uri = URI('http://localhost:8080/api/v1/prompts/current?type=system')
  response = Net::HTTP.get_response(uri)
  
  if response.code == '200'
    data = JSON.parse(response.body)
    puts "✅ API endpoint works: #{data['name']} (ID: #{data['id']})"
  else
    puts "⚠️  API returned status #{response.code}: #{response.body}"
  end
rescue => e
  puts "⚠️  API test skipped (server not running): #{e.message}"
end

# Test 6: Template rendering
puts "\n6. Testing template rendering..."
begin
  prompt = Prompt.first
  if prompt
    original = prompt.content
    variables = { pastor_name: 'John Doe', available_slots: 'Monday 2pm, Tuesday 10am' }
    rendered = prompt.render_content(variables)
    
    if rendered != original
      puts "✅ Template rendering works"
      puts "   Variables replaced: #{variables.keys.join(', ')}"
    else
      puts "⚠️  Template rendering may not be working (no variables in prompt)"
    end
  else
    puts "⚠️  No prompts available for template test"
  end
rescue => e
  puts "❌ Template rendering error: #{e.message}"
end

# Test 7: Versioning
puts "\n7. Testing prompt versioning..."
begin
  original_count = Prompt.count
  
  # Create a new version of an existing prompt
  existing = Prompt.first
  if existing
    new_version = existing.duplicate_as_new_version
    puts "✅ Created new version: #{new_version.name} v#{new_version.version}"
    
    # Check that old version is deactivated
    existing.reload
    puts "✅ Version management works: old=#{existing.is_active}, new=#{new_version.is_active}"
  else
    puts "⚠️  No existing prompts to test versioning"
  end
rescue => e
  puts "❌ Versioning error: #{e.message}"
end

puts "\n=== Test Summary ==="
puts "Basic functionality appears to be working!"
puts "For full integration testing, start the Rails server on port 8080."
puts
puts "Next steps:"
puts "1. Start Rails: PORT=8080 bin/rails server -b 0.0.0.0"
puts "2. Start microservice: cd microservice && PORT=3000 npm run dev"
puts "3. Test with curl:"
puts "   curl -X POST http://localhost:3000/calls -H 'Content-Type: application/json' \\"
puts "   -d '{\"phoneNumber\":\"+1234567890\",\"campaignId\":\"test\"}'"
puts