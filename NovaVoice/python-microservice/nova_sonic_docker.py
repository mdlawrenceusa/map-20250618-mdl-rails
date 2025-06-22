#!/usr/bin/env python3
"""
Nova Sonic service using Python 3.12+ with proper AWS SDK
Runs in Docker container with bidirectional streaming support
"""

import os
import asyncio
import base64
import json
import uuid
import logging
import threading
import queue
from flask import Flask, request, jsonify

# Import proper AWS SDK for bidirectional streaming
from aws_sdk_bedrock_runtime.client import BedrockRuntimeClient, InvokeModelWithBidirectionalStreamOperationInput
from aws_sdk_bedrock_runtime.models import InvokeModelWithBidirectionalStreamInputChunk, BidirectionalInputPayloadPart
from aws_sdk_bedrock_runtime.config import Config, HTTPAuthSchemeResolver, SigV4AuthScheme
from smithy_aws_core.credentials_resolvers.environment import EnvironmentCredentialsResolver

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
sessions = {}

class NovaSonicSession:
    def __init__(self, session_id):
        self.session_id = session_id
        self.model_id = 'amazon.nova-sonic-v1:0'
        self.region = 'us-east-1'
        self.client = None
        self.stream = None
        self.is_active = False
        self.prompt_name = str(uuid.uuid4())
        self.content_name = str(uuid.uuid4())
        self.audio_content_name = str(uuid.uuid4())
        self.audio_queue = asyncio.Queue()
        self.transcript = []
        self.role = None
        self.display_assistant_text = False
        
        logger.info(f"Nova Sonic session {session_id} initialized")
    
    def _initialize_client(self):
        """Initialize the Bedrock client with proper config"""
        config = Config(
            endpoint_uri=f"https://bedrock-runtime.{self.region}.amazonaws.com",
            region=self.region,
            aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
            http_auth_scheme_resolver=HTTPAuthSchemeResolver(),
            http_auth_schemes={"aws.auth#sigv4": SigV4AuthScheme()}
        )
        self.client = BedrockRuntimeClient(config=config)
        logger.info(f"Bedrock client initialized for session {self.session_id}")
    
    async def send_event(self, event_json):
        """Send an event to the bidirectional stream"""
        event = InvokeModelWithBidirectionalStreamInputChunk(
            value=BidirectionalInputPayloadPart(bytes_=event_json.encode('utf-8'))
        )
        await self.stream.input_stream.send(event)
        logger.debug(f"Sent event to session {self.session_id}")
    
    async def start_session(self, system_prompt):
        """Start Nova Sonic bidirectional streaming session"""
        if not self.client:
            self._initialize_client()
        
        logger.info(f"Starting Nova Sonic bidirectional stream for session {self.session_id}")
        
        # Initialize the bidirectional stream
        self.stream = await self.client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
        )
        self.is_active = True
        
        # Send session start event
        session_start = json.dumps({
            "event": {
                "sessionStart": {
                    "inferenceConfiguration": {
                        "maxTokens": 1024,
                        "topP": 0.9,
                        "temperature": 0.7
                    }
                }
            }
        })
        await self.send_event(session_start)
        
        # Send prompt start event
        prompt_start = json.dumps({
            "event": {
                "promptStart": {
                    "promptName": self.prompt_name,
                    "textOutputConfiguration": {
                        "mediaType": "text/plain"
                    },
                    "audioOutputConfiguration": {
                        "mediaType": "audio/lpcm",
                        "sampleRateHertz": 24000,
                        "sampleSizeBits": 16,
                        "channelCount": 1,
                        "voiceId": "matthew",
                        "encoding": "base64",
                        "audioType": "SPEECH"
                    }
                }
            }
        })
        await self.send_event(prompt_start)
        
        # Send system prompt
        text_content_start = json.dumps({
            "event": {
                "contentStart": {
                    "promptName": self.prompt_name,
                    "contentName": self.content_name,
                    "type": "TEXT",
                    "interactive": True,
                    "role": "SYSTEM",
                    "textInputConfiguration": {
                        "mediaType": "text/plain"
                    }
                }
            }
        })
        await self.send_event(text_content_start)
        
        text_input = json.dumps({
            "event": {
                "textInput": {
                    "promptName": self.prompt_name,
                    "contentName": self.content_name,
                    "content": system_prompt
                }
            }
        })
        await self.send_event(text_input)
        
        text_content_end = json.dumps({
            "event": {
                "contentEnd": {
                    "promptName": self.prompt_name,
                    "contentName": self.content_name
                }
            }
        })
        await self.send_event(text_content_end)
        
        # Start audio input
        await self.start_audio_input()
        
        # Start processing responses
        asyncio.create_task(self._process_responses())
        
        logger.info(f"Nova Sonic session {self.session_id} started successfully")
    
    async def start_audio_input(self):
        """Start audio input stream"""
        audio_content_start = json.dumps({
            "event": {
                "contentStart": {
                    "promptName": self.prompt_name,
                    "contentName": self.audio_content_name,
                    "type": "AUDIO",
                    "interactive": True,
                    "role": "USER",
                    "audioInputConfiguration": {
                        "mediaType": "audio/lpcm",
                        "sampleRateHertz": 16000,
                        "sampleSizeBits": 16,
                        "channelCount": 1,
                        "audioType": "SPEECH",
                        "encoding": "base64"
                    }
                }
            }
        })
        await self.send_event(audio_content_start)
        logger.debug(f"Started audio input for session {self.session_id}")
    
    async def send_audio_chunk(self, audio_base64):
        """Send audio chunk to Nova Sonic"""
        if not self.is_active:
            return
        
        audio_event = json.dumps({
            "event": {
                "audioInput": {
                    "promptName": self.prompt_name,
                    "contentName": self.audio_content_name,
                    "content": audio_base64
                }
            }
        })
        await self.send_event(audio_event)
        logger.debug(f"Sent audio chunk to session {self.session_id}")
    
    async def _process_responses(self):
        """Process responses from Nova Sonic"""
        try:
            while self.is_active:
                output = await self.stream.await_output()
                result = await output[1].receive()
                
                if result.value and result.value.bytes_:
                    response_data = result.value.bytes_.decode('utf-8')
                    json_data = json.loads(response_data)
                    
                    if 'event' in json_data:
                        # Handle content start
                        if 'contentStart' in json_data['event']:
                            content_start = json_data['event']['contentStart']
                            self.role = content_start.get('role')
                            
                        # Handle text output
                        elif 'textOutput' in json_data['event']:
                            text = json_data['event']['textOutput']['content']
                            if self.role == "ASSISTANT":
                                self.transcript.append(f"Assistant: {text}")
                                logger.info(f"Nova Sonic text: {text}")
                            
                        # Handle audio output
                        elif 'audioOutput' in json_data['event']:
                            audio_content = json_data['event']['audioOutput']['content']
                            audio_bytes = base64.b64decode(audio_content)
                            await self.audio_queue.put(audio_bytes)
                            logger.debug(f"Received audio: {len(audio_bytes)} bytes")
                            
        except Exception as e:
            logger.error(f"Error processing responses: {e}")
    
    async def get_audio_response(self):
        """Get audio response from queue (non-blocking)"""
        try:
            return await asyncio.wait_for(self.audio_queue.get(), timeout=5.0)
        except asyncio.TimeoutError:
            return None
    
    async def end_session(self):
        """End the Nova Sonic session"""
        if not self.is_active:
            return
        
        logger.info(f"Ending Nova Sonic session {self.session_id}")
        self.is_active = False
        
        try:
            # End audio content
            audio_content_end = json.dumps({
                "event": {
                    "contentEnd": {
                        "promptName": self.prompt_name,
                        "contentName": self.audio_content_name
                    }
                }
            })
            await self.send_event(audio_content_end)
            
            # End prompt
            prompt_end = json.dumps({
                "event": {
                    "promptEnd": {
                        "promptName": self.prompt_name
                    }
                }
            })
            await self.send_event(prompt_end)
            
            # End session
            session_end = json.dumps({
                "event": {
                    "sessionEnd": {}
                }
            })
            await self.send_event(session_end)
            
            # Close stream
            await self.stream.input_stream.close()
            
        except Exception as e:
            logger.error(f"Error ending session: {e}")

# Flask endpoints
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'sessions': len(sessions)})

@app.route('/session/start', methods=['POST'])
def start_session():
    data = request.json
    session_id = data.get('sessionId')
    
    if not session_id:
        return jsonify({'error': 'sessionId required'}), 400
    
    session = NovaSonicSession(session_id)
    sessions[session_id] = session
    
    # Start the session with system prompt
    system_prompt = """You are Esther, Mike Lawrence Productions' scheduling assistant. 
    Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program. 
    Be Brief: 1-2 sentences maximum per response. Always redirect to scheduling the meeting."""
    
    # Run async session start in thread
    def start_async():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(session.start_session(system_prompt))
    
    threading.Thread(target=start_async, daemon=True).start()
    
    logger.info(f"Started Nova Sonic session {session_id}")
    return jsonify({'status': 'started', 'sessionId': session_id})

@app.route('/session/<session_id>/audio', methods=['POST'])
def process_audio(session_id):
    if session_id not in sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    audio_base64 = data.get('audio')
    
    if not audio_base64:
        return jsonify({'error': 'audio data required'}), 400
    
    session = sessions[session_id]
    
    # Process audio and get response
    def process_async():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Send audio
        loop.run_until_complete(session.send_audio_chunk(audio_base64))
        
        # Get response
        audio_response = loop.run_until_complete(session.get_audio_response())
        
        return {
            'audio': base64.b64encode(audio_response).decode('utf-8') if audio_response else None,
            'text': session.transcript[-1] if session.transcript else None
        }
    
    try:
        result = process_async()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error processing audio: {e}")
        return jsonify({'error': str(e)})

@app.route('/session/<session_id>/end', methods=['POST'])
def end_session(session_id):
    if session_id in sessions:
        session = sessions[session_id]
        
        def end_async():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(session.end_session())
        
        threading.Thread(target=end_async, daemon=True).start()
        del sessions[session_id]
        logger.info(f"Ended Nova Sonic session {session_id}")
    
    return jsonify({'status': 'ended'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3001, debug=False)