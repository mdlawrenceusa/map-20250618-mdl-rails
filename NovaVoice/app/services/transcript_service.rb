require 'aws-sdk-dynamodb'

class TranscriptService
  def initialize
    @dynamodb = Aws::DynamoDB::Client.new(
      region: ENV['AWS_REGION'] || 'us-east-1'
    )
    @table_name = 'nova-sonic-call-records'
  end

  def get_recent_calls(limit: 50)
    begin
      # Scan ALL records then sort by timestamp to get truly recent calls
      response = @dynamodb.scan(
        table_name: @table_name
        # Remove limit to get all records for proper sorting
      )
      
      calls = response.items.map do |item|
        {
          call_id: item['call_uuid'],
          phone_number: item['phone_number'],
          start_time: item['start_time'],
          end_time: item['end_time'],
          duration: item['duration_seconds'],
          status: item['status'],
          transcript: item['transcript']
        }
      end
      
      # Sort by start_time (most recent first) and take the limit
      sorted_calls = calls.sort_by { |call| call[:start_time] || '' }.reverse
      sorted_calls.first(limit)
      
    rescue Aws::DynamoDB::Errors::ServiceError => e
      Rails.logger.error "DynamoDB error: #{e.message}"
      []
    end
  end

  def get_all_calls
    begin
      # Scan ALL records without any limit
      response = @dynamodb.scan(
        table_name: @table_name
      )
      
      calls = response.items.map do |item|
        {
          call_id: item['call_uuid'],
          phone_number: item['phone_number'],
          start_time: item['start_time'],
          end_time: item['end_time'],
          duration: item['duration_seconds'],
          status: item['status'],
          transcript: item['transcript']
        }
      end
      
      # Sort by start_time (most recent first)
      calls.sort_by { |call| call[:start_time] || '' }.reverse
      
    rescue Aws::DynamoDB::Errors::ServiceError => e
      Rails.logger.error "DynamoDB error: #{e.message}"
      []
    end
  end

  def get_call(call_id)
    begin
      response = @dynamodb.get_item(
        table_name: @table_name,
        key: { 'call_uuid' => call_id }
      )
      
      return nil unless response.item
      
      {
        call_id: response.item['call_uuid'],
        phone_number: response.item['phone_number'],
        start_time: response.item['start_time'],
        end_time: response.item['end_time'],
        duration: response.item['duration_seconds'],
        status: response.item['status'],
        transcript: response.item['transcript']
      }
      
    rescue Aws::DynamoDB::Errors::ServiceError => e
      Rails.logger.error "DynamoDB error getting call #{call_id}: #{e.message}"
      nil
    end
  end

  def search_calls(query: nil, phone_number: nil, date_from: nil, date_to: nil, limit: 50)
    begin
      scan_params = {
        table_name: @table_name,
        limit: limit
      }
      
      # Add filter expressions if needed
      filter_expressions = []
      expression_values = {}
      
      if phone_number.present?
        filter_expressions << "phone_number = :phone"
        expression_values[':phone'] = phone_number
      end
      
      if query.present?
        filter_expressions << "contains(transcript, :query)"
        expression_values[':query'] = query
      end
      
      if filter_expressions.any?
        scan_params[:filter_expression] = filter_expressions.join(' AND ')
        scan_params[:expression_attribute_values] = expression_values
      end
      
      response = @dynamodb.scan(scan_params)
      
      calls = response.items.map do |item|
        {
          call_id: item['call_uuid'],
          phone_number: item['phone_number'],
          start_time: item['start_time'],
          end_time: item['end_time'],
          duration: item['duration_seconds'],
          status: item['status'],
          transcript: item['transcript']
        }
      end
      
      # Sort by start_time (most recent first)
      calls.sort_by { |call| call[:start_time] || '' }.reverse
      
    rescue Aws::DynamoDB::Errors::ServiceError => e
      Rails.logger.error "DynamoDB search error: #{e.message}"
      []
    end
  end

  def get_call_stats
    begin
      response = @dynamodb.scan(
        table_name: @table_name,
        projection_expression: 'call_uuid, duration_seconds, #status, start_time',
        expression_attribute_names: {
          '#status' => 'status'
        }
      )
      
      total_calls = response.items.count
      completed_calls = response.items.count { |item| item['status'] == 'completed' }
      total_duration = response.items.sum { |item| (item['duration_seconds'] || 0).to_f }
      
      {
        total_calls: total_calls,
        completed_calls: completed_calls,
        average_duration: total_calls > 0 ? (total_duration.to_f / total_calls).round(1) : 0,
        total_duration: total_duration
      }
      
    rescue Aws::DynamoDB::Errors::ServiceError => e
      Rails.logger.error "DynamoDB stats error: #{e.message}"
      {
        total_calls: 0,
        completed_calls: 0,
        average_duration: 0,
        total_duration: 0
      }
    end
  end
end