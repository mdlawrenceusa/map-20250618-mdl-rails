#!/usr/bin/env python3
"""
Synchronous Nova Sonic service that works properly with Flask
Uses threading instead of asyncio to avoid event loop conflicts
"""

import os
import base64
import json
import uuid
import logging
import threading
import queue
import time
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

class NovaSonicSyncSession:
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
        self.audio_queue = queue.Queue()
        self.text_responses = []
        self.stream_thread = None
        self.processing_lock = threading.Lock()
        
        logger.info(f"Nova Sonic sync session {session_id} initialized")
    
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
    
    def send_event_sync(self, event_json):
        """Send an event to the bidirectional stream synchronously"""
        try:
            import asyncio
            
            # Get or create event loop for this thread
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            
            # Send event
            event = InvokeModelWithBidirectionalStreamInputChunk(
                value=BidirectionalInputPayloadPart(bytes_=event_json.encode('utf-8'))
            )
            
            async def send_async():
                await self.stream.input_stream.send(event)
            
            loop.run_until_complete(send_async())
            logger.debug(f"Sent event to session {self.session_id}")
            
        except Exception as e:
            logger.error(f"Error sending event: {e}")
    
    def start_session_sync(self, system_prompt):
        """Start Nova Sonic bidirectional streaming session synchronously"""
        try:
            if not self.client:
                self._initialize_client()
            
            logger.info(f"Starting Nova Sonic bidirectional stream for session {self.session_id}")
            
            import asyncio
            
            # Get or create event loop for this thread
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            
            async def initialize_stream():
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
                await self.stream.input_stream.send(InvokeModelWithBidirectionalStreamInputChunk(
                    value=BidirectionalInputPayloadPart(bytes_=session_start.encode('utf-8'))
                ))
                
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
                await self.stream.input_stream.send(InvokeModelWithBidirectionalStreamInputChunk(
                    value=BidirectionalInputPayloadPart(bytes_=prompt_start.encode('utf-8'))
                ))
                
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
                await self.stream.input_stream.send(InvokeModelWithBidirectionalStreamInputChunk(
                    value=BidirectionalInputPayloadPart(bytes_=text_content_start.encode('utf-8'))
                ))
                
                text_input = json.dumps({
                    "event": {
                        "textInput": {
                            "promptName": self.prompt_name,
                            "contentName": self.content_name,
                            "content": system_prompt
                        }
                    }
                })
                await self.stream.input_stream.send(InvokeModelWithBidirectionalStreamInputChunk(
                    value=BidirectionalInputPayloadPart(bytes_=text_input.encode('utf-8'))
                ))
                
                text_content_end = json.dumps({
                    "event": {
                        "contentEnd": {
                            "promptName": self.prompt_name,
                            "contentName": self.content_name
                        }
                    }
                })
                await self.stream.input_stream.send(InvokeModelWithBidirectionalStreamInputChunk(
                    value=BidirectionalInputPayloadPart(bytes_=text_content_end.encode('utf-8'))
                ))
                
                # Start audio input
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
                await self.stream.input_stream.send(InvokeModelWithBidirectionalStreamInputChunk(
                    value=BidirectionalInputPayloadPart(bytes_=audio_content_start.encode('utf-8'))
                ))
            
            loop.run_until_complete(initialize_stream())
            
            # Start response processing in separate thread
            self.stream_thread = threading.Thread(target=self._process_responses_thread, daemon=True)
            self.stream_thread.start()
            
            logger.info(f"Nova Sonic session {self.session_id} started successfully")
            
        except Exception as e:
            logger.error(f"Error starting session: {e}")
            raise
    
    def _process_responses_thread(self):
        """Process responses from Nova Sonic in separate thread"""
        try:
            import asyncio
            
            # Create new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            async def process_responses():
                try:
                    while self.is_active:
                        output = await self.stream.await_output()
                        result = await output[1].receive()
                        
                        if result.value and result.value.bytes_:
                            response_data = result.value.bytes_.decode('utf-8')
                            json_data = json.loads(response_data)
                            
                            if 'event' in json_data:
                                # Handle text output
                                if 'textOutput' in json_data['event']:
                                    text = json_data['event']['textOutput']['content']
                                    self.text_responses.append(text)
                                    logger.info(f"Nova Sonic text: {text}")
                                
                                # Handle audio output
                                elif 'audioOutput' in json_data['event']:
                                    audio_content = json_data['event']['audioOutput']['content']
                                    audio_bytes = base64.b64decode(audio_content)
                                    self.audio_queue.put(audio_bytes)
                                    logger.debug(f"Received audio: {len(audio_bytes)} bytes")
                                    
                except Exception as e:
                    logger.error(f"Error processing responses: {e}")
            
            loop.run_until_complete(process_responses())
            
        except Exception as e:
            logger.error(f"Error in response thread: {e}")
    
    def send_audio_sync(self, audio_base64):
        """Send audio chunk to Nova Sonic synchronously"""
        if not self.is_active:
            return {"error": "Session not active"}
        
        try:
            with self.processing_lock:
                import asyncio
                
                # Get event loop for this thread
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                
                audio_event = json.dumps({
                    "event": {
                        "audioInput": {
                            "promptName": self.prompt_name,
                            "contentName": self.audio_content_name,
                            "content": audio_base64
                        }
                    }
                })
                
                async def send_audio():
                    await self.stream.input_stream.send(InvokeModelWithBidirectionalStreamInputChunk(
                        value=BidirectionalInputPayloadPart(bytes_=audio_event.encode('utf-8'))
                    ))
                
                loop.run_until_complete(send_audio())
                logger.debug(f"Sent audio chunk to session {self.session_id}")
                
                # Wait for response (with timeout)
                try:
                    audio_response = self.audio_queue.get(timeout=3.0)
                    return {
                        'audio': base64.b64encode(audio_response).decode('utf-8'),
                        'text': self.text_responses[-1] if self.text_responses else None
                    }
                except queue.Empty:
                    return {
                        'audio': None,
                        'text': self.text_responses[-1] if self.text_responses else None
                    }
                
        except Exception as e:
            logger.error(f"Error sending audio: {e}")
            return {"error": str(e)}

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
    
    try:
        session = NovaSonicSyncSession(session_id)
        sessions[session_id] = session
        
        # Start the session with system prompt
        system_prompt = """You are Esther, Mike Lawrence Productions' scheduling assistant. 
        Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program. 
        Be Brief: 1-2 sentences maximum per response. Always redirect to scheduling the meeting."""
        
        session.start_session_sync(system_prompt)
        
        logger.info(f"Started Nova Sonic session {session_id}")
        return jsonify({'status': 'started', 'sessionId': session_id})
        
    except Exception as e:
        logger.error(f"Error starting session: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/session/<session_id>/audio', methods=['POST'])
def process_audio(session_id):
    if session_id not in sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    audio_base64 = data.get('audio')
    
    if not audio_base64:
        return jsonify({'error': 'audio data required'}), 400
    
    session = sessions[session_id]
    result = session.send_audio_sync(audio_base64)
    
    return jsonify(result)

@app.route('/session/<session_id>/end', methods=['POST'])
def end_session(session_id):
    if session_id in sessions:
        session = sessions[session_id]
        session.is_active = False
        del sessions[session_id]
        logger.info(f"Ended Nova Sonic session {session_id}")
    
    return jsonify({'status': 'ended'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3001, debug=False)