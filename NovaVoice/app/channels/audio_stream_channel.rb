# app/channels/audio_stream_channel.rb
class AudioStreamChannel < ApplicationCable::Channel
  def subscribed
    @stream_id = "audio_stream_#{current_user&.id || SecureRandom.uuid}"
    stream_from @stream_id
    Rails.logger.info "🎧 AudioStream subscribed: #{@stream_id}"
  end

  def unsubscribed
    Rails.logger.info "🔌 AudioStream unsubscribed: #{@stream_id}"
    # Cleanup any ongoing Nova Sonic streams
    if @nova_service
      Rails.logger.info "🧹 Cleaning up Nova Sonic service on unsubscribe"
      @nova_service.cleanup
    end
  end

  def receive(data)
    Rails.logger.info "📨 AudioStream received data"
    Rails.logger.info "📊 Data keys: #{data.keys.join(', ')}"
    Rails.logger.info "📊 Audio data present: #{data['audio'] ? 'YES' : 'NO'}"
    
    begin
      # Decode incoming audio data (base64)
      unless data['audio']
        Rails.logger.error "❌ No audio data in received message"
        broadcast_error("No audio data received")
        return
      end
      
      Rails.logger.info "🔓 Decoding base64 audio data..."
      audio_data = Base64.decode64(data['audio'])
      Rails.logger.info "✅ Audio decoded: #{audio_data.length} bytes"
      
      # Reuse or create Nova Sonic service instance
      unless @nova_service
        Rails.logger.info "🆕 Creating Nova Sonic service instance"
        @nova_service = NovaSonicService.new(self)
        Rails.logger.info "✅ Nova Sonic service created"
      end
      
      # Process audio with Nova Sonic
      Rails.logger.info "🎵 Sending audio to Nova Sonic service..."
      @nova_service.process_audio(audio_data)
      Rails.logger.info "✅ Audio sent to Nova Sonic service"
      
    rescue StandardError => e
      Rails.logger.error "❌ Error in AudioStream receive: #{e.class} - #{e.message}"
      Rails.logger.error "📍 Backtrace: #{e.backtrace.first(5).join("\n")}"
      broadcast_error("Audio processing failed: #{e.message}")
    end
  end

  def broadcast_audio(audio_data, text = nil)
    Rails.logger.info "📡 Broadcasting to client - Audio: #{audio_data ? 'YES' : 'NO'}, Text: #{text ? 'YES' : 'NO'}"
    
    message = {}
    if audio_data
      Rails.logger.info "🔊 Encoding audio data: #{audio_data.length} bytes"
      message[:audio] = Base64.encode64(audio_data)
    end
    if text
      Rails.logger.info "💬 Adding text: '#{text[0..50]}#{'...' if text.length > 50}'"
      message[:text] = text
    end
    
    Rails.logger.info "📤 Sending broadcast to #{@stream_id}"
    ActionCable.server.broadcast(@stream_id, { message: message })
    Rails.logger.info "✅ Broadcast completed"
  end

  def broadcast_error(error_message)
    Rails.logger.error "📢 Broadcasting error: #{error_message}"
    ActionCable.server.broadcast(@stream_id, { error: error_message })
  end

  def broadcast_nova_sonic_config(config)
    Rails.logger.info "⚙️ Broadcasting Nova Sonic configuration: #{config}"
    ActionCable.server.broadcast(@stream_id, { nova_sonic_config: config })
  end

  private

  def current_user
    # If you have user authentication, implement this method
    # For now, return nil for anonymous users
    nil
  end
end