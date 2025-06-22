import os
import asyncio
import base64
import json
import uuid
import logging
from datetime import datetime
from typing import Dict, Optional
from fastapi import FastAPI, WebSocket, Request, Response, WebSocketDisconnect
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import our Nova Sonic client
from nova_sonic_boto3 import NovaSonicClient

# Store active calls
active_calls: Dict[str, dict] = {}

# Vonage configuration
VONAGE_API_KEY = os.getenv('VONAGE_API_KEY')
VONAGE_API_SECRET = os.getenv('VONAGE_API_SECRET')
VONAGE_APPLICATION_ID = os.getenv('VONAGE_APPLICATION_ID')
VONAGE_PRIVATE_KEY = os.getenv('VONAGE_PRIVATE_KEY')
VONAGE_OUTBOUND_NUMBER = os.getenv('VONAGE_OUTBOUND_NUMBER', '+12135235735')
WEBHOOK_BASE_URL = os.getenv('WEBHOOK_BASE_URL', 'https://gospelshare.io')

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Python microservice starting up")
    logger.info(f"Webhook base URL: {WEBHOOK_BASE_URL}")
    logger.info(f"Outbound number: {VONAGE_OUTBOUND_NUMBER}")
    yield
    # Shutdown
    logger.info("Python microservice shutting down")

app = FastAPI(lifespan=lifespan)

# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "active_calls": len(active_calls),
        "timestamp": datetime.utcnow().isoformat()
    }

# Vonage webhook endpoints
@app.get("/webhooks/answer")
async def inbound_answer_webhook(request: Request):
    """Handle inbound call answer webhook (GET method)"""
    params = dict(request.query_params)
    call_id = params.get('uuid')
    from_number = params.get('from')
    to_number = params.get('to')
    conversation_uuid = params.get('conversation_uuid')
    
    logger.info(f"Inbound answer webhook: call_id={call_id}, from={from_number}, to={to_number}")
    
    # Store call info
    active_calls[call_id] = {
        'call_id': call_id,
        'from': from_number,
        'to': to_number,
        'conversation_uuid': conversation_uuid,
        'start_time': datetime.utcnow(),
        'transcript': [],
        'nova_sonic_client': None
    }
    
    # Return NCCO for WebSocket connection
    ncco = [
        {
            "action": "connect",
            "endpoint": [{
                "type": "websocket",
                "uri": f"wss://{WEBHOOK_BASE_URL.replace('https://', '')}/ws/{call_id}",
                "content-type": "audio/l16;rate=16000",
                "headers": {}
            }]
        }
    ]
    
    return JSONResponse(content=ncco)

@app.get("/outbound/webhooks/answer")
async def outbound_answer_webhook(request: Request):
    """Handle outbound call answer webhook (GET method)"""
    params = dict(request.query_params)
    call_id = params.get('uuid')
    from_number = params.get('from')
    to_number = params.get('to')
    conversation_uuid = params.get('conversation_uuid')
    
    logger.info(f"Outbound answer webhook: call_id={call_id}, from={from_number}, to={to_number}")
    
    # Store call info
    active_calls[call_id] = {
        'call_id': call_id,
        'from': from_number,
        'to': to_number,
        'conversation_uuid': conversation_uuid,
        'start_time': datetime.utcnow(),
        'transcript': [],
        'nova_sonic_client': None
    }
    
    # Return NCCO for WebSocket connection
    ncco = [
        {
            "action": "connect",
            "endpoint": [{
                "type": "websocket",
                "uri": f"wss://{WEBHOOK_BASE_URL.replace('https://', '')}/ws/{call_id}",
                "content-type": "audio/l16;rate=16000",
                "headers": {}
            }]
        }
    ]
    
    return JSONResponse(content=ncco)

@app.post("/webhooks/events")
async def inbound_events_webhook(request: Request):
    """Handle inbound call events webhook"""
    data = await request.json()
    call_id = data.get('uuid')
    status = data.get('status')
    
    logger.info(f"Inbound event: call_id={call_id}, status={status}")
    
    if status in ['completed', 'failed'] and call_id in active_calls:
        call_info = active_calls[call_id]
        duration = (datetime.utcnow() - call_info['start_time']).total_seconds()
        
        logger.info(f"Call ended: call_id={call_id}, duration={duration}s, transcript_length={len(call_info['transcript'])}")
        
        # TODO: Store transcript to DynamoDB and JSON log
        
        # Clean up
        del active_calls[call_id]
    
    return Response(status_code=200)

@app.post("/outbound/webhooks/events")
async def outbound_events_webhook(request: Request):
    """Handle outbound call events webhook"""
    data = await request.json()
    call_id = data.get('uuid')
    status = data.get('status')
    
    logger.info(f"Outbound event: call_id={call_id}, status={status}")
    
    if status in ['completed', 'failed'] and call_id in active_calls:
        call_info = active_calls[call_id]
        duration = (datetime.utcnow() - call_info['start_time']).total_seconds()
        
        logger.info(f"Call ended: call_id={call_id}, duration={duration}s, transcript_length={len(call_info['transcript'])}")
        
        # TODO: Store transcript to DynamoDB and JSON log
        
        # Clean up
        del active_calls[call_id]
    
    return Response(status_code=200)

@app.post("/webhooks/recording")
async def recording_webhook(request: Request):
    """Handle recording webhook"""
    data = await request.json()
    call_id = data.get('uuid')
    recording_url = data.get('recording_url')
    duration = data.get('duration')
    
    logger.info(f"Recording webhook: call_id={call_id}, url={recording_url}, duration={duration}s")
    
    if call_id in active_calls:
        active_calls[call_id]['transcript'].append(f"Recording: {recording_url} ({duration}s)")
    
    return Response(status_code=200)

# WebSocket endpoint for audio streaming
@app.websocket("/ws/{call_id}")
async def websocket_endpoint(websocket: WebSocket, call_id: str):
    """Handle WebSocket connection for audio streaming"""
    await websocket.accept()
    logger.info(f"WebSocket connected for call_id={call_id}")
    
    if call_id not in active_calls:
        logger.error(f"Unknown call_id: {call_id}")
        await websocket.close()
        return
    
    call_info = active_calls[call_id]
    
    # Create Nova Sonic client for this call
    nova_client = NovaSonicClient(call_id)
    call_info['nova_sonic_client'] = nova_client
    
    # System prompt for Esther
    system_prompt = """You are Esther, Mike Lawrence Productions' scheduling assistant. 
    Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program. 
    Key Facts: Program is two-phase outreach (entertainment THEN Gospel presentation), 
    Format is 40-50 min Off-Broadway illusion show + 30 min separate Gospel message, 
    Track Record similar to Campus Crusade approach (~100,000 decisions).
    When asked who attends: The meeting is between your Pastor and Mike Lawrence, our founder. I'm just scheduling it for you.
    Be Brief: 1-2 sentences maximum per response. Always redirect to scheduling the meeting.
    Website: globaloutreachevent.com, Mike Lawrence Direct Number: 347-300-5533
    
    IMPORTANT: Respond with both speech audio and text. Provide clear, natural speech responses."""
    
    try:
        # Start Nova Sonic session
        await nova_client.start_session(system_prompt)
        
        # Create tasks for handling audio
        audio_playback_task = asyncio.create_task(handle_audio_playback(websocket, nova_client, call_info))
        audio_receive_task = asyncio.create_task(handle_audio_receive(websocket, nova_client))
        
        # Wait for either task to complete or fail
        done, pending = await asyncio.wait(
            [audio_playback_task, audio_receive_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel remaining tasks
        for task in pending:
            task.cancel()
            
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for call_id={call_id}")
    except Exception as e:
        logger.error(f"Error in WebSocket handler: {e}")
    finally:
        # Clean up Nova Sonic session
        if nova_client:
            await nova_client.end_session()
        logger.info(f"WebSocket closed for call_id={call_id}")

async def handle_audio_playback(websocket: WebSocket, nova_client: NovaSonicClient, call_info: dict):
    """Handle playing audio from Nova Sonic to the caller"""
    try:
        while True:
            audio_data = await nova_client.audio_queue.get()
            # Vonage expects raw L16 PCM audio at 16kHz
            # Nova Sonic outputs at 24kHz, so we need to resample
            resampled_audio = resample_audio(audio_data, 24000, 16000)
            await websocket.send_bytes(resampled_audio)
            logger.debug(f"Sent {len(resampled_audio)} bytes to caller")
    except Exception as e:
        logger.error(f"Error in audio playback: {e}")

async def handle_audio_receive(websocket: WebSocket, nova_client: NovaSonicClient):
    """Handle receiving audio from the caller"""
    try:
        while True:
            data = await websocket.receive_bytes()
            # Vonage sends L16 PCM audio at 16kHz
            # Send directly to Nova Sonic (it expects 16kHz)
            await nova_client.send_audio_chunk(data)
            logger.debug(f"Received {len(data)} bytes from caller")
    except Exception as e:
        logger.error(f"Error in audio receive: {e}")

def resample_audio(audio_data: bytes, from_rate: int, to_rate: int) -> bytes:
    """Simple audio resampling (basic implementation)"""
    # For now, just return the original audio
    # Nova Sonic outputs at 24kHz but we need 16kHz for Vonage
    # In production, use scipy.signal.resample
    # This is a placeholder that just returns the original
    return audio_data

# Outbound call endpoint
@app.post("/calls")
async def create_outbound_call(request: Request):
    """Create an outbound call"""
    data = await request.json()
    phone_number = data.get('phoneNumber')
    prompt = data.get('prompt', 'Default prompt')
    nova_sonic_params = data.get('novaSonicParams', {})
    
    logger.info(f"Creating outbound call to {phone_number}")
    
    # TODO: Implement Vonage outbound call creation
    # For now, return a placeholder response
    call_id = f"call-{uuid.uuid4()}"
    
    return JSONResponse(content={
        "callId": call_id,
        "status": "initiated",
        "phoneNumber": phone_number,
        "message": "Call initiated. Audio streaming will begin when call is answered."
    })

# Get call status endpoint
@app.get("/calls/{call_id}")
async def get_call_status(call_id: str):
    """Get status of a specific call"""
    if call_id not in active_calls:
        return JSONResponse(status_code=404, content={"error": "Call not found"})
    
    call_info = active_calls[call_id]
    duration = (datetime.utcnow() - call_info['start_time']).total_seconds()
    
    return JSONResponse(content={
        "callId": call_id,
        "phoneNumber": call_info['from'],
        "startTime": call_info['start_time'].isoformat(),
        "duration": duration,
        "transcript": ' '.join(call_info['transcript']),
        "status": "active"
    })

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv('PORT', 3000))
    uvicorn.run(app, host="0.0.0.0", port=port)