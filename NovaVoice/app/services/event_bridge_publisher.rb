require 'aws-sdk-eventbridge'

class EventBridgePublisher
  def initialize
    @client = Aws::EventBridge::Client.new(
      region: ENV['AWS_REGION'] || 'us-east-1'
    )
    @bus_name = ENV['EVENTBRIDGE_BUS_NAME'] || 'default'
  end

  # Publish a single call request
  def publish_single_call(phone_number, lead_id = nil, campaign_id = nil)
    formatted_phone = format_phone(phone_number)
    Rails.logger.info "Publishing single call request for #{formatted_phone}"
    
    # Check call frequency protection
    guard = CallFrequencyGuard.new
    if guard.recently_called?(formatted_phone)
      Rails.logger.warn "🚫 CALL BLOCKED: #{formatted_phone} was recently called (24h protection)"
      guard.analyze_recent_activity(formatted_phone)
      raise "Phone number #{formatted_phone} was called within the last 24 hours. Call blocked to prevent harassment."
    end
    
    event = {
      source: 'nova-voice.rails',
      detail_type: 'SingleCallRequested',
      detail: {
        phoneNumber: formatted_phone,
        leadId: lead_id,
        campaignId: campaign_id,
        timestamp: Time.current.iso8601,
        priority: 'immediate'
      }.to_json,
      event_bus_name: @bus_name
    }
    
    publish_event(event)
  end

  # Publish campaign launch with scheduled calls
  def publish_campaign_launch(campaign, leads)
    Rails.logger.info "Publishing campaign launch for #{campaign.name} with #{leads.count} leads"
    
    # Filter out recently called numbers
    guard = CallFrequencyGuard.new
    filtered_leads = leads.select do |lead|
      formatted_phone = format_phone(lead.phone)
      if guard.recently_called?(formatted_phone)
        Rails.logger.warn "🚫 CAMPAIGN FILTER: Skipping #{formatted_phone} - recently called (24h protection)"
        false
      else
        true
      end
    end
    
    skipped_count = leads.count - filtered_leads.count
    if skipped_count > 0
      Rails.logger.warn "⚠️ Skipped #{skipped_count} leads due to recent call protection"
    end
    
    events = []
    
    filtered_leads.each_with_index do |lead, index|
      # Calculate scheduled time with spacing
      scheduled_time = Time.current + (index * campaign.call_spacing_seconds).seconds
      
      # Create campaign_call record
      campaign_call = campaign.campaign_calls.create!(
        lead: lead,
        phone_number: format_phone(lead.phone),
        status: 'scheduled',
        attempt_number: 1,
        scheduled_for: scheduled_time
      )
      
      # Create EventBridge event
      events << {
        source: 'nova-voice.rails',
        detail_type: 'CampaignCallScheduled',
        detail: {
          campaignCallId: campaign_call.id,
          campaignId: campaign.id,
          campaignName: campaign.name,
          leadId: lead.id,
          leadName: lead.name,
          churchName: lead.company,
          phoneNumber: campaign_call.phone_number,
          scheduledFor: scheduled_time.iso8601,
          batchIndex: index,
          totalInBatch: leads.count,
          attemptNumber: 1,
          promptOverride: campaign.prompt_override
        }.to_json,
        event_bus_name: @bus_name
      }
    end
    
    # Publish events in batches (EventBridge limit is 10 per request)
    events.each_slice(10) do |event_batch|
      publish_events(event_batch)
    end
    
    # Publish campaign status event
    publish_campaign_status(campaign, 'launched', {
      totalCalls: filtered_leads.count,
      skippedDueToFrequency: skipped_count,
      originalLeadCount: leads.count,
      firstCallAt: Time.current.iso8601,
      lastCallAt: filtered_leads.any? ? (Time.current + ((filtered_leads.count - 1) * campaign.call_spacing_seconds).seconds).iso8601 : Time.current.iso8601
    })
    
    Rails.logger.info "Published #{events.count} events for campaign #{campaign.name} (#{skipped_count} skipped due to frequency protection)"
  end

  # Publish campaign status updates
  def publish_campaign_status(campaign, status, metadata = {})
    event = {
      source: 'nova-voice.rails',
      detail_type: 'CampaignStatusChanged',
      detail: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: status,
        timestamp: Time.current.iso8601,
        metadata: metadata
      }.to_json,
      event_bus_name: @bus_name
    }
    
    publish_event(event)
  end

  # Publish call result events (for tracking)
  def publish_call_result(campaign_call, result_type, metadata = {})
    event = {
      source: 'nova-voice.rails',
      detail_type: 'CallResultRecorded',
      detail: {
        campaignCallId: campaign_call.id,
        campaignId: campaign_call.campaign_id,
        leadId: campaign_call.lead_id,
        phoneNumber: campaign_call.phone_number,
        callUuid: campaign_call.call_uuid,
        resultType: result_type, # 'initiated', 'completed', 'failed'
        timestamp: Time.current.iso8601,
        metadata: metadata
      }.to_json,
      event_bus_name: @bus_name
    }
    
    publish_event(event)
  end

  private

  def format_phone(phone)
    # Convert "+1 (347) 200-5533" to "+13472005533"
    return phone if phone.start_with?('+1') && phone.length == 12 && phone.match?(/^\+1\d{10}$/)
    
    digits = phone.gsub(/\D/, '')
    digits = digits.last(10) if digits.length > 10
    "+1#{digits}"
  end

  def publish_event(event)
    response = @client.put_events(entries: [event])
    
    if response.failed_entry_count > 0
      Rails.logger.error "EventBridge publish failed: #{response.entries}"
      raise "Failed to publish event to EventBridge"
    end
    
    Rails.logger.debug "Published event to EventBridge: #{event[:detail_type]}"
    response
  end

  def publish_events(events)
    response = @client.put_events(entries: events)
    
    if response.failed_entry_count > 0
      Rails.logger.error "EventBridge batch publish failed: #{response.entries}"
      raise "Failed to publish events to EventBridge"
    end
    
    Rails.logger.debug "Published #{events.count} events to EventBridge"
    response
  end
end