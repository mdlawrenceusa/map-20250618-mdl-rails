import consumer from "channels/consumer"

// Simple, direct connection to Rails with REAL Nova Sonic
consumer.subscriptions.create("AudioStreamChannel", {
  connected() {
    console.log("✅ Connected to Rails AudioStream with REAL Nova Sonic");
    updateStatus("Connected to Nova Sonic");
  },

  disconnected() {
    console.log("🔌 Disconnected from Rails AudioStream");
    updateStatus("Disconnected");
  },

  received(data) {
    console.log("📨 Received from Nova Sonic:", data);
    
    if (data.message) {
      if (data.message.audio) {
        playAudio(data.message.audio);
      }
      if (data.message.text) {
        displayText(data.message.text);
      }
    }
    
    if (data.error) {
      console.error("❌ Nova Sonic error:", data.error);
      displayError(data.error);
    }
  }
});

let mediaRecorder = null;
let isRecording = false;

function startRecording() {
  if (isRecording) return;
  
  console.log("🎤 Starting recording for REAL Nova Sonic...");
  
  navigator.mediaDevices.getUserMedia({ 
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    } 
  })
  .then(stream => {
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        sendAudioToNovaSonic(event.data);
      }
    };
    
    mediaRecorder.start(100); // Send chunks every 100ms
    isRecording = true;
    
    updateRecordButton();
    updateStatus("Recording... speak to Nova Sonic");
    
  })
  .catch(error => {
    console.error("❌ Microphone error:", error);
    displayError("Microphone access denied");
  });
}

function stopRecording() {
  if (!isRecording) return;
  
  console.log("🛑 Stopping recording...");
  
  if (mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    mediaRecorder = null;
  }
  
  isRecording = false;
  updateRecordButton();
  updateStatus("Stopped recording");
}

function sendAudioToNovaSonic(audioBlob) {
  const reader = new FileReader();
  reader.onload = () => {
    const base64Data = reader.result.split(',')[1];
    
    // Send directly to Rails -> Nova Sonic
    const subscription = consumer.subscriptions.subscriptions[0];
    if (subscription) {
      subscription.send({ audio: base64Data });
    }
  };
  reader.readAsDataURL(audioBlob);
}

function playAudio(base64Audio) {
  try {
    const audioData = atob(base64Audio);
    const audioArray = new Uint8Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      audioArray[i] = audioData.charCodeAt(i);
    }
    
    const audioBlob = new Blob([audioArray], { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    audio.play().then(() => {
      console.log("🔊 Playing Nova Sonic response");
    }).catch(error => {
      console.error("❌ Audio playback error:", error);
    });
    
  } catch (error) {
    console.error("❌ Audio processing error:", error);
  }
}

function displayText(text) {
  console.log("💬 Nova Sonic says:", text);
  
  const responseDiv = document.getElementById('esther-response');
  if (responseDiv) {
    responseDiv.textContent = text;
  }
}

function displayError(error) {
  console.error("❌ Error:", error);
  
  const errorDiv = document.getElementById('error-message');
  if (errorDiv) {
    errorDiv.textContent = error;
    errorDiv.style.display = 'block';
  }
}

function updateStatus(status) {
  const statusDiv = document.getElementById('connection-status');
  if (statusDiv) {
    statusDiv.innerHTML = `<span class="status connected">${status}</span>`;
  }
}

function updateRecordButton() {
  const button = document.getElementById('record-button');
  if (button) {
    button.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
    button.onclick = isRecording ? stopRecording : startRecording;
  }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  console.log("🚀 Initializing REAL Nova Sonic interface...");
  updateRecordButton();
  updateStatus("Ready - Click Start Recording to talk to Nova Sonic");
});
