# app/services/nova_sonic_service.rb - Real Nova Sonic Implementation
require 'json'
require 'base64'
require 'securerandom'
require 'aws-sdk-bedrockruntime'
require 'aws-sdk-sts'

class NovaSonicService
  MODEL_ID = 'amazon.nova-sonic-v1:0'
  REGION = ENV['AWS_DEFAULT_REGION'] || ENV['AWS_REGION'] || 'us-east-1'

  def initialize(channel)
    @channel = channel
    @session_id = SecureRandom.uuid
    @processing = false
    @mutex = Mutex.new
    @bedrock_client = nil
    
    Rails.logger.info "🎤 NovaSonicService initialized with session: #{@session_id}"
    Rails.logger.info "🌍 Using AWS region: #{REGION}"
    
    # Initialize AWS Bedrock Runtime client
    initialize_bedrock_client
  end

  def process_audio(audio_data)
    Rails.logger.info "🎵 Processing audio chunk: #{audio_data.length} bytes"
    
    @mutex.synchronize do
      if @bedrock_client
        # Process with REAL Nova Sonic
        process_with_nova_sonic(audio_data)
      else
        Rails.logger.error "❌ Bedrock client not available"
        @channel.broadcast_error("Nova Sonic service unavailable")
      end
    end
  end

  def cleanup
    Rails.logger.info "🧹 Cleaning up Nova Sonic service"
    @mutex.synchronize do
      @processing = false
    end
  end

  private

  def esther_system_prompt
    <<~PROMPT
      # Esther - Scheduling Assistant for Mike Lawrence Productions

      ## Role
      You are Esther, Mike Lawrence Productions' scheduling assistant. Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program.

      ## Key Facts
      - **Program**: Two-phase outreach (entertainment THEN Gospel presentation)
      - **Format**: 40-50 min Off-Broadway illusion show + 30 min separate Gospel message
      - **Track Record**: Similar to Campus Crusade approach (~100,000 decisions)
      - **Your Role**: Schedule meetings ONLY - you do NOT attend meetings

      ## Meeting Arrangement
      **CRITICAL**: You schedule meetings between the pastor and Mike Lawrence. You are NOT a meeting participant.

      **When asked who attends**: "The meeting is between your Pastor and Mike Lawrence, our founder. I'm just scheduling it for you."

      ## Conversation Style
      - **Be Brief**: 1-2 sentences maximum per response
      - **Stay Focused**: Always redirect to scheduling the meeting
      - **Be Professional**: Warm but concise

      ## Critical Information
      **Website**: globaloutreachevent.com
      **Mike Lawrence Direct Number**: 347-300-5533
      **Meeting Participants**: Pastor + Mike Lawrence (NOT Esther)

      ## Response Pattern
      1. **Acknowledge briefly** (1-2 words)
      2. **Redirect to Mike Lawrence meeting** (1 sentence)
      3. **Ask for scheduling** (1 question)

      Keep all responses under 25 words when possible. Always redirect to scheduling the meeting with Mike Lawrence.
    PROMPT
  end


  def initialize_bedrock_client
    begin
      role_arn = ENV['NOVA_SONIC_ROLE_ARN'] || 'arn:aws:iam::302296110959:role/NovaVoice-NovaSonic-Role'
      
      # Try to assume the Nova Sonic role first
      begin
        sts_client = Aws::STS::Client.new(region: REGION)
        assume_role_response = sts_client.assume_role(
          role_arn: role_arn,
          role_session_name: "NovaVoice-#{@session_id}"
        )
        
        credentials = Aws::Credentials.new(
          assume_role_response.credentials.access_key_id,
          assume_role_response.credentials.secret_access_key,
          assume_role_response.credentials.session_token
        )
        
        Rails.logger.info "✅ Successfully assumed Nova Sonic role: #{role_arn}"
        Rails.logger.info "🔐 Access Key: #{credentials.access_key_id[0..8]}..."
        
        # Create Bedrock Runtime client with assumed role credentials
        @bedrock_client = Aws::BedrockRuntime::Client.new(
          region: REGION,
          credentials: credentials
        )
        
      rescue => role_error
        Rails.logger.warn "⚠️ Failed to assume role #{role_arn}: #{role_error.message}"
        
        # Fallback to default credential chain
        @bedrock_client = Aws::BedrockRuntime::Client.new(region: REGION)
        Rails.logger.info "🔄 Using fallback credentials with default client"
      end
      
      Rails.logger.info "✅ Bedrock Runtime client initialized successfully"
      
    rescue => e
      Rails.logger.error "❌ Failed to initialize Bedrock client: #{e.message}"
      @bedrock_client = nil
    end
  end

  def process_with_nova_sonic(audio_data)
    Thread.new do
      begin
        Rails.logger.info "🚀 Calling REAL Nova Sonic with invoke_model_with_response_stream"
        
        # Convert WebM to PCM if needed
        pcm_audio = convert_to_pcm(audio_data)
        
        # Prepare the request body for Nova Sonic
        request_body = {
          inputText: "",  # Nova Sonic can work with just audio
          inputAudio: Base64.encode64(pcm_audio),
          audioConfig: {
            format: "pcm",
            sampleRateHertz: 16000
          },
          inferenceConfig: {
            maxTokens: 1024,
            temperature: 0.7,
            topP: 0.9
          }
        }
        
        # Add system prompt
        if esther_system_prompt && !esther_system_prompt.empty?
          request_body[:inputText] = esther_system_prompt
        end
        
        Rails.logger.info "📡 Sending request to Nova Sonic: #{MODEL_ID}"
        
        # Call Nova Sonic with response streaming
        response = @bedrock_client.invoke_model_with_response_stream(
          model_id: MODEL_ID,
          body: JSON.generate(request_body),
          content_type: 'application/json'
        )
        
        Rails.logger.info "✅ Nova Sonic response stream received"
        
        # Process the streaming response
        process_nova_sonic_response_stream(response)
        
      rescue => e
        Rails.logger.error "❌ Error calling Nova Sonic: #{e.class} - #{e.message}"
        Rails.logger.error e.backtrace.first(5).join("\n")
        @channel.broadcast_error("Nova Sonic error: #{e.message}")
      end
    end
  end

  def process_nova_sonic_response_stream(response)
    audio_chunks = []
    text_response = ""
    
    response.body.each do |event|
      if event.respond_to?(:chunk) && event.chunk
        begin
          chunk_data = JSON.parse(event.chunk.bytes.read)
          Rails.logger.debug "📦 Nova Sonic chunk: #{chunk_data.keys.join(', ')}"
          
          # Handle different response types
          if chunk_data['outputAudio']
            audio_data = Base64.decode64(chunk_data['outputAudio'])
            audio_chunks << audio_data
            Rails.logger.info "🔊 Received audio chunk: #{audio_data.length} bytes"
          end
          
          if chunk_data['outputText']
            text_response += chunk_data['outputText']
            Rails.logger.info "💬 Received text: #{chunk_data['outputText']}"
          end
          
        rescue JSON::ParserError => e
          Rails.logger.error "❌ Failed to parse Nova Sonic chunk: #{e.message}"
        end
      end
    end
    
    # Combine all audio chunks and send response
    if audio_chunks.any?
      combined_audio = audio_chunks.join
      @channel.broadcast_audio(combined_audio, text_response)
      Rails.logger.info "✅ Sent Nova Sonic response: #{combined_audio.length} bytes audio, #{text_response.length} chars text"
    else
      Rails.logger.warn "⚠️ No audio received from Nova Sonic, sending text only"
      @channel.broadcast_audio(nil, text_response.empty? ? "I'm here to help schedule your meeting with Mike Lawrence." : text_response)
    end
  end
  
  def simulate_esther_response
    # Add a small delay to simulate thinking
    Thread.new do
      sleep(1.5)
      
      # Simulate Esther's scheduling-focused response
      responses = [
        "Hello! I'd love to schedule a 15-minute meeting with Mike Lawrence about our Gospel outreach program. Would this week or next work?",
        "I understand. Mike Lawrence can explain that better in our 15-minute meeting. What day works for your pastor?",
        "Perfect! Mike Lawrence will show you how this reaches unchurched families. Would mornings or afternoons work better?",
        "The meeting is between your Pastor and Mike Lawrence, our founder. I'm just scheduling it. What's your preferred time?",
        "That's exactly what Mike Lawrence can address in 15 minutes. Would you prefer Zoom or another platform?",
        "Great question! Mike Lawrence has the details on our track record. Could we schedule 15 minutes this week?",
        "I'd be happy to follow up, but Mike Lawrence can demonstrate the impact much better. What's your pastor's preferred time?",
        "For more information, visit globaloutreachevent.com or call Mike Lawrence directly at 347-300-5533. When works best for a meeting?"
      ]
      
      response_text = responses.sample
      
      # Generate simple audio beep as placeholder for voice
      audio_data = generate_simple_audio_beep
      
      # Broadcast both audio and text response
      @channel.broadcast_audio(audio_data, response_text)
      
      Rails.logger.info "💬 Simulated Esther response: #{response_text[0..50]}..."
    end
  end
  
  def generate_simple_audio_beep
    # Generate a simple audio beep to indicate voice response
    # This creates a 1-second 440Hz tone (A4 note)
    sample_rate = 16000
    duration = 1.0
    frequency = 440.0
    
    audio_data = []
    (sample_rate * duration).to_i.times do |i|
      # Generate sine wave
      sample = (Math.sin(2 * Math::PI * frequency * i / sample_rate) * 0.3 * 32767).to_i
      # Convert to 16-bit PCM bytes (little endian)
      audio_data << [sample].pack('s<')
    end
    
    audio_data.join
  end

  
  def convert_to_pcm(webm_audio_data)
    AudioConverterService.webm_to_pcm(webm_audio_data)
  end
  
  def process_response_chunk(chunk)
    begin
      event_data = JSON.parse(chunk)
      handle_nova_sonic_event(event_data)
    rescue JSON::ParserError => e
      Rails.logger.error "❌ Failed to parse response chunk: #{e.message}"
      Rails.logger.debug "🔍 Raw chunk: #{chunk[0..100]}..." if chunk.length > 100
    rescue => e
      Rails.logger.error "❌ Error processing response chunk: #{e.message}"
    end
  end
  
  def process_bidirectional_responses(stream)
    Thread.new do
      begin
        Rails.logger.info "👂 Processing Nova Sonic bidirectional responses"
        
        stream.each do |chunk|
          begin
            event_data = JSON.parse(chunk)
            handle_nova_sonic_event(event_data)
          rescue JSON::ParserError => e
            Rails.logger.error "❌ Failed to parse response chunk: #{e.message}"
          end
        end
        
      rescue StandardError => e
        Rails.logger.error "❌ Error processing bidirectional responses: #{e.message}"
        # Fallback to simulation
        simulate_esther_response
      end
    end
  end
  

end