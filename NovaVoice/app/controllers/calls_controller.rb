# app/controllers/calls_controller.rb
class CallsController < ApplicationController
  skip_before_action :verify_authenticity_token
  before_action :initialize_client

  def create
    phone_number = params[:phone_number]
    prompt = params[:prompt] || default_outbound_prompt
    nova_sonic_params = {
      maxTokens: params[:max_tokens]&.to_i || 1024,
      topP: params[:top_p]&.to_f || 0.9,
      temperature: params[:temperature]&.to_f || 0.7
    }

    unless valid_phone_number?(phone_number)
      render json: { error: 'Invalid phone number' }, status: :bad_request
      return
    end

    result = @client.initiate_outbound_call(phone_number, prompt, nova_sonic_params)
    render json: result
  rescue MicroserviceClient::Error => e
    Rails.logger.error "Failed to initiate call: #{e.message}"
    render json: { error: e.message }, status: :internal_server_error
  rescue StandardError => e
    Rails.logger.error "Unexpected error: #{e.message}"
    render json: { error: 'An unexpected error occurred' }, status: :internal_server_error
  end

  def show
    call_id = params[:id]
    
    unless call_id.present?
      render json: { error: 'Call ID is required' }, status: :bad_request
      return
    end

    result = @client.get_call_status(call_id)
    render json: result
  rescue MicroserviceClient::Error => e
    Rails.logger.error "Failed to get call status: #{e.message}"
    render json: { error: e.message }, status: :not_found
  rescue StandardError => e
    Rails.logger.error "Unexpected error: #{e.message}"
    render json: { error: 'An unexpected error occurred' }, status: :internal_server_error
  end

  private

  def initialize_client
    @client = MicroserviceClient.new
  end

  def valid_phone_number?(phone_number)
    # Basic E.164 format validation
    phone_number.present? && phone_number.match?(/^\+?[1-9]\d{1,14}$/)
  end

  def default_outbound_prompt
    <<~PROMPT
      You are Esther, Mike Lawrence Productions' scheduling assistant. 
      Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program.
      
      Key Facts:
      - Program: Two-phase outreach (entertainment THEN Gospel presentation)
      - Format: 40-50 min Off-Broadway illusion show + 30 min separate Gospel message
      - Track Record: Similar to Campus Crusade approach (~100,000 decisions)
      - Your Role: Schedule meetings ONLY - you do NOT attend meetings
      
      When asked who attends: "The meeting is between your Pastor and Mike Lawrence, our founder. I'm just scheduling it for you."
      
      Be Brief: 1-2 sentences maximum per response. Always redirect to scheduling the meeting.
      
      Website: globaloutreachevent.com
      Mike Lawrence Direct Number: 347-300-5533
    PROMPT
  end
end