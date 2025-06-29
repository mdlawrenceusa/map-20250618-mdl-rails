# Aurora DSQL Sync Service
# Manages data synchronization between dev and production environments
class AuroraSyncService
  class << self
    # Sync specific data from dev to prod (with approval)
    def sync_to_production(resource_type, resource_ids, user:)
      raise "Not in development!" unless Rails.env.development?
      
      case resource_type
      when 'prompts'
        sync_prompts_to_production(resource_ids, user)
      when 'campaigns'
        sync_campaigns_to_production(resource_ids, user)
      when 'leads'
        # Leads require special handling
        sync_leads_to_production(resource_ids, user)
      else
        raise "Unknown resource type: #{resource_type}"
      end
    end
    
    # View what would be synced (dry run)
    def preview_sync(resource_type, resource_ids = nil)
      case resource_type
      when 'prompts'
        prompts = resource_ids ? Prompt.where(id: resource_ids) : Prompt.active.limit(20)
        prompts.map do |prompt|
          {
            id: prompt.id,
            name: prompt.name,
            prompt_type: prompt.prompt_type,
            content_preview: prompt.content.to_s.truncate(100),
            would_override: false # In SQLite dev mode, always false
          }
        end
      when 'campaigns'
        campaigns = resource_ids ? Campaign.where(id: resource_ids) : Campaign.limit(20)
        campaigns.map do |campaign|
          {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            description: campaign.description.to_s.truncate(50),
            would_override: false # In SQLite dev mode, always false
          }
        end
      when 'leads'
        leads = resource_ids ? Lead.where(id: resource_ids) : Lead.limit(20)
        leads.map do |lead|
          {
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            company: lead.company,
            would_override: false
          }
        end
      else
        []
      end
    end
    
    # Copy production data to dev for testing
    def copy_from_production(resource_type, resource_ids)
      raise "Not in development!" unless Rails.env.development?
      
      ActiveRecord::Base.transaction do
        case resource_type
        when 'call_transcripts'
          copy_transcripts_from_production(resource_ids)
        when 'analytics'
          copy_analytics_from_production(resource_ids)
        end
      end
    end
    
    private
    
    def sync_prompts_to_production(prompt_ids, user)
      synced = []
      
      ActiveRecord::Base.transaction do
        Prompt.where(id: prompt_ids).each do |dev_prompt|
          # Create sync record
          sync_record = create_sync_record('prompt', dev_prompt.id, user)
          
          # Copy to production schema
          prod_prompt = execute_in_schema('prod') do
            Prompt.find_or_initialize_by(
              name: dev_prompt.name,
              prompt_type: dev_prompt.prompt_type,
              lead_id: dev_prompt.lead_id,
              campaign_id: dev_prompt.campaign_id
            )
            
            prod_prompt.assign_attributes(
              content: dev_prompt.content,
              active: false, # Start inactive in production
              version: (prod_prompt.version || 0) + 1,
              synced_from_dev_at: Time.current,
              synced_by: user.name
            )
            
            prod_prompt.save!
            prod_prompt
          end
          
          synced << {
            dev_id: dev_prompt.id,
            prod_id: prod_prompt.id,
            sync_record_id: sync_record.id
          }
        end
      end
      
      synced
    end
    
    def sync_campaigns_to_production(campaign_ids, user)
      synced = []
      
      ActiveRecord::Base.transaction do
        Campaign.where(id: campaign_ids).each do |dev_campaign|
          # Don't sync active campaigns
          next if dev_campaign.status == 'running'
          
          sync_record = create_sync_record('campaign', dev_campaign.id, user)
          
          # Copy campaign without leads initially
          prod_campaign = execute_in_schema('prod') do
            campaign = Campaign.find_or_initialize_by(name: dev_campaign.name)
            campaign.assign_attributes(
              description: dev_campaign.description,
              status: 'draft', # Always start as draft in production
              batch_size: dev_campaign.batch_size,
              synced_from_dev_at: Time.current
            )
            campaign.save!
            campaign
          end
          
          synced << {
            dev_id: dev_campaign.id,
            prod_id: prod_campaign.id,
            sync_record_id: sync_record.id,
            note: "Campaign synced without leads. Add leads manually in production."
          }
        end
      end
      
      synced
    end
    
    def sync_leads_to_production(lead_ids, user)
      # Leads are sensitive - require additional confirmation
      raise "Lead sync requires SYNC_LEADS_ENABLED=true" unless ENV['SYNC_LEADS_ENABLED'] == 'true'
      
      synced = []
      
      ActiveRecord::Base.transaction do
        Lead.where(id: lead_ids).each do |dev_lead|
          # Check if phone number already exists in production
          existing = execute_in_schema('prod') do
            Lead.find_by(phone: dev_lead.phone)
          end
          
          if existing
            synced << {
              dev_id: dev_lead.id,
              status: 'skipped',
              reason: 'Phone number already exists in production'
            }
            next
          end
          
          # Create in production with sync metadata
          prod_lead = execute_in_schema('prod') do
            lead = Lead.create!(
              dev_lead.attributes.except('id', 'created_at', 'updated_at').merge(
                synced_from_dev: true,
                synced_at: Time.current,
                synced_by: user.name,
                calling_schedule_enabled: false # Start disabled
              )
            )
            lead
          end
          
          synced << {
            dev_id: dev_lead.id,
            prod_id: prod_lead.id,
            status: 'synced'
          }
        end
      end
      
      synced
    end
    
    def copy_transcripts_from_production(call_ids)
      copied = []
      
      execute_in_schema('prod') do
        CallTranscript.where(id: call_ids).each do |prod_transcript|
          # Copy to dev schema for analysis
          dev_copy = execute_in_schema('dev') do
            DevCallTranscript.create!(
              original_id: prod_transcript.id,
              call_id: prod_transcript.call_id,
              phone_number: prod_transcript.phone_number,
              transcript: prod_transcript.transcript,
              duration: prod_transcript.duration,
              status: prod_transcript.status,
              copied_from_prod_at: Time.current
            )
          end
          
          copied << dev_copy
        end
      end
      
      copied
    end
    
    def execute_in_schema(schema_name)
      old_schema = ActiveRecord::Base.connection.schema_search_path
      ActiveRecord::Base.connection.schema_search_path = schema_name
      
      yield
    ensure
      ActiveRecord::Base.connection.schema_search_path = old_schema
    end
    
    def create_sync_record(resource_type, resource_id, user)
      SyncRecord.create!(
        resource_type: resource_type,
        resource_id: resource_id,
        synced_by: user.name,
        synced_at: Time.current,
        environment: "dev_to_prod"
      )
    end
    
    def production_prompt_exists?(prompt)
      execute_in_schema('prod') do
        Prompt.exists?(
          name: prompt.name,
          prompt_type: prompt.prompt_type,
          lead_id: prompt.lead_id,
          campaign_id: prompt.campaign_id
        )
      end
    end
    
    def production_campaign_exists?(campaign)
      execute_in_schema('prod') do
        Campaign.exists?(name: campaign.name)
      end
    end
  end
end