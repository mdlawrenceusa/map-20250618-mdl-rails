require 'aws-sdk-s3'

class PromptPublishService
  def initialize
    @s3_client = Aws::S3::Client.new(
      region: ENV['AWS_REGION'] || 'us-east-1'
    )
    @bucket_name = ENV['PROMPTS_S3_BUCKET'] || 'nova-sonic-prompts'
  end

  def publish_pending_changes
    # Get ALL active prompts (stateless - ignore current publish status)
    active_prompts = Prompt.where(is_active: true)
    
    return { 
      success: false, 
      message: "No active prompts to publish",
      published_count: 0,
      errors: []
    } if active_prompts.empty?

    published_count = 0
    errors = []
    published_assistants = []

    # Group by assistant name and process each
    active_prompts.group_by(&:assistant_name).each do |assistant_name, prompts|
      begin
        # Combine ALL active prompts into a single comprehensive document
        combined_content = build_combined_prompt_content(prompts)
        
        if combined_content.present?
          sync_prompt_to_s3(assistant_name, combined_content)
          published_assistants << assistant_name unless published_assistants.include?(assistant_name)
          Rails.logger.info "Published combined prompt for assistant '#{assistant_name}' to S3 (#{prompts.length} prompts combined)"
        end
        
        # Process each prompt type separately for database tracking
        prompts.group_by(&:prompt_type).each do |prompt_type, type_prompts|
          
          # Mark ALL active prompts as published (regardless of type or previous status)
          type_prompts.each do |prompt|
            # Use update_columns to avoid triggering updated_at callback
            prompt.update_columns(
              published_at: Time.current,
              published_content: prompt.content
            )
            published_count += 1
            Rails.logger.info "Published #{prompt_type} prompt '#{prompt.name}'"
          end
        end
      rescue => e
        error_msg = "Failed to publish prompts for #{assistant_name}: #{e.message}"
        errors << error_msg
        Rails.logger.error error_msg
        Rails.logger.error e.backtrace.join("\n")
      end
    end

    # Clear prompt cache after successful publish
    if published_count > 0
      clear_microservice_cache
    end

    {
      success: errors.empty?,
      published_count: published_count,
      published_assistants: published_assistants,
      errors: errors,
      message: build_success_message(published_count, published_assistants)
    }
  end

  def check_s3_status
    begin
      # Check if bucket exists and we can access it
      @s3_client.head_bucket(bucket: @bucket_name)
      
      # List current assistants in S3
      response = @s3_client.list_objects_v2(
        bucket: @bucket_name,
        prefix: 'assistants/',
        delimiter: '/'
      )
      
      assistants = response.contents.map do |object|
        File.basename(object.key, '.md')
      end.reject(&:empty?)
      
      {
        success: true,
        bucket_exists: true,
        assistants_in_s3: assistants,
        last_modified: response.contents.map(&:last_modified).max
      }
    rescue Aws::S3::Errors::NoSuchBucket
      {
        success: false,
        bucket_exists: false,
        error: "S3 bucket '#{@bucket_name}' does not exist"
      }
    rescue => e
      {
        success: false,
        bucket_exists: false,
        error: "S3 access error: #{e.message}"
      }
    end
  end

  def get_published_prompt(assistant_name)
    begin
      key = "assistants/#{assistant_name}.md"
      
      response = @s3_client.get_object(
        bucket: @bucket_name,
        key: key
      )
      
      {
        success: true,
        content: response.body.read,
        last_modified: response.last_modified,
        metadata: response.metadata
      }
    rescue Aws::S3::Errors::NoSuchKey
      {
        success: false,
        error: "No published prompt found for assistant '#{assistant_name}'"
      }
    rescue => e
      {
        success: false,
        error: "Failed to retrieve prompt: #{e.message}"
      }
    end
  end

  private

  def sync_prompt_to_s3(assistant_name, content)
    key = "assistants/#{assistant_name}.md"
    
    @s3_client.put_object(
      bucket: @bucket_name,
      key: key,
      body: content,
      content_type: 'text/markdown',
      metadata: {
        'published-at' => Time.current.iso8601,
        'published-by' => 'rails-admin',
        'assistant-name' => assistant_name,
        'content-length' => content.length.to_s
      }
    )
    
    Rails.logger.info "Uploaded prompt to s3://#{@bucket_name}/#{key} (#{content.length} characters)"
  end

  def clear_microservice_cache
    # Optional: Send webhook to microservice to clear cache
    # This would require implementing a cache invalidation endpoint in the microservice
    microservice_url = ENV['MICROSERVICE_URL']
    
    if microservice_url.present?
      begin
        uri = URI("#{microservice_url}/api/cache/clear-prompts")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = uri.scheme == 'https'
        
        request = Net::HTTP::Post.new(uri)
        request['Content-Type'] = 'application/json'
        request.body = { source: 'rails-publish' }.to_json
        
        response = http.request(request)
        Rails.logger.info "Cache invalidation response: #{response.code}" if response.code == '200'
      rescue => e
        Rails.logger.warn "Failed to clear microservice cache: #{e.message}"
        # Don't fail the publish if cache clear fails
      end
    end
  end

  def build_success_message(count, assistants)
    if count == 1
      "Published prompt for #{assistants.first} to S3"
    else
      "Published #{count} prompts to S3: #{assistants.join(', ')}"
    end
  end

  def build_combined_prompt_content(prompts)
    return "" if prompts.empty?

    # Group prompts by type and build sections
    sections = []
    
    # Order prompt types by priority (system first, then others)
    type_order = ['system', 'greeting', 'scheduling', 'objection_handling', 'closing']
    
    prompts.group_by(&:prompt_type).each do |prompt_type, type_prompts|
      # Sort prompts within each type by updated_at (most recent first)
      sorted_prompts = type_prompts.sort_by(&:updated_at).reverse
      
      case prompt_type
      when 'system'
        # System prompts go first without headers (core instructions)
        sorted_prompts.each do |prompt|
          sections << prompt.content
        end
      when 'greeting'
        sections << "# GREETING INSTRUCTIONS"
        sorted_prompts.each do |prompt|
          sections << "## #{prompt.name}"
          sections << prompt.content
        end
      when 'scheduling'
        sections << "# SCHEDULING INSTRUCTIONS"
        sorted_prompts.each do |prompt|
          sections << "## #{prompt.name}"
          sections << prompt.content
        end
      when 'objection_handling'
        sections << "# OBJECTION HANDLING"
        sorted_prompts.each do |prompt|
          sections << "## #{prompt.name}"
          sections << prompt.content
        end
      when 'closing'
        sections << "# CLOSING INSTRUCTIONS"
        sorted_prompts.each do |prompt|
          sections << "## #{prompt.name}"
          sections << prompt.content
        end
      else
        # Handle any custom prompt types
        sections << "# #{prompt_type.upcase.gsub('_', ' ')} INSTRUCTIONS"
        sorted_prompts.each do |prompt|
          sections << "## #{prompt.name}"
          sections << prompt.content
        end
      end
      
      sections << "" # Add blank line between sections
    end

    # Join all sections with double line breaks
    sections.join("\n\n").strip
  end
end