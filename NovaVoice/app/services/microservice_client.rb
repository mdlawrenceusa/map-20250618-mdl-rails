# app/services/microservice_client.rb
require 'net/http'
require 'json'
require 'uri'

class MicroserviceClient
  class Error < StandardError; end

  def initialize
    @base_url = ENV['MICROSERVICE_URL'] || 'http://microservice:8080'
    @timeout = 30
  end

  def initiate_outbound_call(phone_number, prompt = nil, lead_id: nil, campaign_id: nil, nova_sonic_params: {})
    Rails.logger.info "Initiating outbound call to #{phone_number} (lead: #{lead_id}, campaign: #{campaign_id})"
    
    payload = {
      phoneNumber: phone_number,
      novaSonicParams: nova_sonic_params
    }
    
    # Only include these fields if they have values
    payload[:prompt] = prompt if prompt.present?
    payload[:leadId] = lead_id if lead_id.present?
    payload[:campaignId] = campaign_id if campaign_id.present?
    
    response = post_request('/calls', payload)

    if response[:success]
      response[:data]
    else
      raise Error, response[:error]
    end
  end

  def handle_inbound_call(call_id, from, to)
    Rails.logger.info "Handling inbound call #{call_id} from #{from}"
    
    response = post_request('/inbound', {
      callId: call_id,
      from: from,
      to: to
    })

    if response[:success]
      response[:data]
    else
      raise Error, response[:error]
    end
  end

  def get_call_status(call_id)
    Rails.logger.info "Getting status for call #{call_id}"
    
    response = get_request("/calls/#{call_id}")

    if response[:success]
      response[:data]
    else
      raise Error, response[:error]
    end
  end

  private

  def post_request(path, body)
    uri = URI.parse("#{@base_url}#{path}")
    http = Net::HTTP.new(uri.host, uri.port)
    http.read_timeout = @timeout
    http.open_timeout = @timeout

    request = Net::HTTP::Post.new(uri.path)
    request['Content-Type'] = 'application/json'
    request.body = body.to_json

    begin
      response = http.request(request)
      
      if response.code.to_i >= 200 && response.code.to_i < 300
        { success: true, data: JSON.parse(response.body, symbolize_names: true) }
      else
        error_data = JSON.parse(response.body, symbolize_names: true) rescue { error: response.body }
        { success: false, error: error_data[:error] || "HTTP #{response.code}" }
      end
    rescue StandardError => e
      Rails.logger.error "Microservice request failed: #{e.message}"
      { success: false, error: e.message }
    end
  end

  def get_request(path)
    uri = URI.parse("#{@base_url}#{path}")
    http = Net::HTTP.new(uri.host, uri.port)
    http.read_timeout = @timeout
    http.open_timeout = @timeout

    request = Net::HTTP::Get.new(uri.path)
    request['Accept'] = 'application/json'

    begin
      response = http.request(request)
      
      if response.code.to_i >= 200 && response.code.to_i < 300
        { success: true, data: JSON.parse(response.body, symbolize_names: true) }
      else
        error_data = JSON.parse(response.body, symbolize_names: true) rescue { error: response.body }
        { success: false, error: error_data[:error] || "HTTP #{response.code}" }
      end
    rescue StandardError => e
      Rails.logger.error "Microservice request failed: #{e.message}"
      { success: false, error: e.message }
    end
  end
end