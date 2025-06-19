# app/controllers/vonage_webhooks_controller.rb
class VonageWebhooksController < ApplicationController
  skip_before_action :verify_authenticity_token
  before_action :initialize_client
  before_action :log_webhook

  # Outbound call answer webhook
  def outbound_answer
    # The microservice handles the NCCO generation
    # We just need to forward the request
    call_id = params[:uuid]
    
    # Forward to microservice which will return the NCCO
    response = forward_to_microservice('/vonage/outbound/answer')
    render json: response
  rescue StandardError => e
    Rails.logger.error "Outbound answer webhook error: #{e.message}"
    render json: default_error_ncco
  end

  # Inbound call answer webhook
  def inbound_answer
    call_id = params[:uuid]
    from = params[:from]
    to = params[:to]
    
    # Get NCCO from microservice
    result = @client.handle_inbound_call(call_id, from, to)
    render json: result[:ncco]
  rescue StandardError => e
    Rails.logger.error "Inbound answer webhook error: #{e.message}"
    render json: default_error_ncco
  end

  # Outbound call events webhook
  def outbound_events
    # Forward events to microservice for tracking
    forward_to_microservice('/vonage/outbound/events')
    head :ok
  rescue StandardError => e
    Rails.logger.error "Outbound events webhook error: #{e.message}"
    head :ok
  end

  # Inbound call events webhook
  def inbound_events
    # Forward events to microservice for tracking
    forward_to_microservice('/vonage/inbound/events')
    head :ok
  rescue StandardError => e
    Rails.logger.error "Inbound events webhook error: #{e.message}"
    head :ok
  end

  private

  def initialize_client
    @client = MicroserviceClient.new
  end

  def log_webhook
    Rails.logger.info "Vonage webhook received: #{action_name}", {
      params: params.except(:controller, :action).to_h,
      headers: {
        'X-Nexmo-Signature' => request.headers['X-Nexmo-Signature'],
        'Content-Type' => request.headers['Content-Type']
      }
    }
  end

  def forward_to_microservice(path)
    uri = URI.parse("#{ENV['MICROSERVICE_URL'] || 'http://microservice:8080'}#{path}")
    http = Net::HTTP.new(uri.host, uri.port)
    
    request = Net::HTTP::Post.new(uri.path)
    request['Content-Type'] = 'application/json'
    request.body = params.except(:controller, :action).to_json
    
    response = http.request(request)
    JSON.parse(response.body)
  rescue StandardError => e
    Rails.logger.error "Failed to forward to microservice: #{e.message}"
    nil
  end

  def default_error_ncco
    [
      {
        action: 'talk',
        text: 'We apologize, but we are experiencing technical difficulties. Please try again later.',
        language: 'en-US'
      }
    ]
  end
end