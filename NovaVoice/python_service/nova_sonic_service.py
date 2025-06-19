#!/usr/bin/env python3
"""
Nova Sonic Bidirectional Streaming Service
FastAPI service that provides WebSocket interface for Nova Sonic bidirectional streaming
"""

import asyncio
import base64
import json
import logging
import os
from typing import Dict, Any
import uuid

import boto3
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Nova Sonic Streaming Service", version="1.0.0")

# Enable CORS for Rails app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your Rails domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class NovaSonicSession:
    """Manages a single Nova Sonic bidirectional streaming session"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.bedrock_client = None
        self.stream = None
        self.websocket = None
        self.is_active = False
        
        # Initialize Bedrock client
        self._init_bedrock_client()
        
    def _init_bedrock_client(self):
        """Initialize AWS Bedrock Runtime client with role assumption"""
        try:
            # Try to assume the Nova Sonic role
            role_arn = os.getenv('NOVA_SONIC_ROLE_ARN', 'arn:aws:iam::302296110959:role/NovaVoice-NovaSonic-Role')
            region = os.getenv('AWS_REGION', 'us-east-1')
            
            sts_client = boto3.client('sts', region_name=region)
            assumed_role = sts_client.assume_role(
                RoleArn=role_arn,
                RoleSessionName=f"NovaVoice-Python-{self.session_id}"
            )
            
            credentials = assumed_role['Credentials']
            self.bedrock_client = boto3.client(
                'bedrock-runtime',
                region_name=region,
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )
            
            logger.info(f"✅ Bedrock client initialized with assumed role for session {self.session_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize Bedrock client: {e}")
            # Fallback to default credentials
            self.bedrock_client = boto3.client('bedrock-runtime', region_name=region)
            logger.info(f"🔄 Using default credentials for session {self.session_id}")
    
    async def start_stream(self, websocket: WebSocket):
        """Start bidirectional stream with Nova Sonic"""
        self.websocket = websocket
        
        try:
            logger.info(f"🚀 Starting Nova Sonic bidirectional stream for session {self.session_id}")
            
            # Note: The Python SDK also doesn't have invoke_model_with_bidirectional_stream yet
            # This is a placeholder for when it becomes available
            # For now, we'll simulate the bidirectional streaming behavior
            
            # Send session start confirmation
            await self.websocket.send_text(json.dumps({
                "type": "session_started",
                "session_id": self.session_id,
                "message": "Nova Sonic session started (simulated)"
            }))
            
            self.is_active = True
            logger.info(f"✅ Session {self.session_id} started successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to start session {self.session_id}: {e}")
            await self.websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Failed to start session: {str(e)}"
            }))
    
    async def process_audio(self, audio_data: str):
        """Process incoming audio data and send to Nova Sonic"""
        if not self.is_active:
            logger.warning(f"⚠️ Session {self.session_id} not active, ignoring audio")
            return
        
        try:
            # Decode base64 audio
            audio_bytes = base64.b64decode(audio_data)
            logger.info(f"🎵 Processing audio chunk: {len(audio_bytes)} bytes for session {self.session_id}")
            
            # TODO: When bidirectional streaming is available, send audio to Nova Sonic here
            # For now, simulate Esther's response
            await self._simulate_esther_response()
            
        except Exception as e:
            logger.error(f"❌ Error processing audio for session {self.session_id}: {e}")
            await self.websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Audio processing failed: {str(e)}"
            }))
    
    async def _simulate_esther_response(self):
        """Simulate Esther's scheduling-focused response"""
        import random
        
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
        
        response_text = random.choice(responses)
        
        # Generate simple audio tone as placeholder
        audio_data = self._generate_simple_audio_beep()
        
        # Send response back to Rails via WebSocket
        await self.websocket.send_text(json.dumps({
            "type": "audio_response",
            "audio": base64.b64encode(audio_data).decode('utf-8'),
            "text": response_text,
            "session_id": self.session_id
        }))
        
        logger.info(f"💬 Sent simulated response for session {self.session_id}: {response_text[:50]}...")
    
    def _generate_simple_audio_beep(self) -> bytes:
        """Generate a simple audio beep (1-second 440Hz tone)"""
        import struct
        import math
        
        sample_rate = 16000
        duration = 1.0
        frequency = 440.0
        
        audio_data = b''
        for i in range(int(sample_rate * duration)):
            # Generate sine wave
            sample = int(math.sin(2 * math.pi * frequency * i / sample_rate) * 0.3 * 32767)
            # Convert to 16-bit PCM bytes (little endian)
            audio_data += struct.pack('<h', sample)
        
        return audio_data
    
    async def close(self):
        """Close the streaming session"""
        self.is_active = False
        if self.stream:
            # TODO: Close actual stream when available
            pass
        logger.info(f"🧹 Session {self.session_id} closed")

# Global session manager
sessions: Dict[str, NovaSonicSession] = {}

@app.websocket("/ws/nova-sonic")
async def nova_sonic_websocket(websocket: WebSocket):
    """WebSocket endpoint for Nova Sonic bidirectional streaming"""
    session_id = str(uuid.uuid4())
    session = NovaSonicSession(session_id)
    sessions[session_id] = session
    
    await websocket.accept()
    logger.info(f"🔌 WebSocket connected for session {session_id}")
    
    try:
        # Start the Nova Sonic stream
        await session.start_stream(websocket)
        
        # Listen for incoming messages
        while True:
            message = await websocket.receive_text()
            data = json.loads(message)
            
            if data.get("type") == "audio":
                await session.process_audio(data.get("audio", ""))
            elif data.get("type") == "close":
                break
            else:
                logger.warning(f"⚠️ Unknown message type: {data.get('type')}")
                
    except WebSocketDisconnect:
        logger.info(f"🔌 WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"❌ WebSocket error for session {session_id}: {e}")
    finally:
        # Cleanup
        await session.close()
        if session_id in sessions:
            del sessions[session_id]
        logger.info(f"🧹 Session {session_id} cleaned up")

def _generate_simple_audio_beep() -> bytes:
    """Generate a simple audio beep (1-second 440Hz tone)"""
    import struct
    import math
    
    sample_rate = 16000
    duration = 1.0
    frequency = 440.0
    
    audio_data = b''
    for i in range(int(sample_rate * duration)):
        # Generate sine wave
        sample = int(math.sin(2 * math.pi * frequency * i / sample_rate) * 0.3 * 32767)
        # Convert to 16-bit PCM bytes (little endian)
        audio_data += struct.pack('<h', sample)
    
    return audio_data

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "active_sessions": len(sessions)}

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Nova Sonic Streaming Service", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8001))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"🚀 Starting Nova Sonic service on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")