#!/usr/bin/env python3
"""
Simple Nova Sonic service that the Node.js microservice can call
Uses boto3 since we can't use the newer SDK with Python 3.9
"""

import asyncio
import base64
import json
import logging
import boto3
from flask import Flask, request, jsonify, Response
import threading
import queue

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Store active sessions
sessions = {}

class NovaSonicSession:
    def __init__(self, session_id):
        self.session_id = session_id
        self.bedrock_runtime = boto3.client(
            service_name='bedrock-runtime',
            region_name='us-east-1'
        )
        self.audio_queue = queue.Queue()
        self.is_active = True
        self.system_prompt = """You are Esther, Mike Lawrence Productions' scheduling assistant. 
        Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program. 
        Be Brief: 1-2 sentences maximum per response. Always redirect to scheduling the meeting."""
        
    def process_audio(self, audio_base64):
        """Process audio and return response"""
        try:
            # Prepare request for Nova Sonic
            request_body = {
                "inputText": self.system_prompt,
                "inputAudio": audio_base64,
                "audioConfig": {
                    "format": "pcm",
                    "sampleRateHertz": 16000
                },
                "inferenceConfig": {
                    "maxTokens": 1024,
                    "temperature": 0.7,
                    "topP": 0.9
                }
            }
            
            # For now, use Nova Pro for text generation and add TTS later
            # Nova Sonic requires bidirectional streaming which needs the proper SDK
            text_request = {
                "messages": [
                    {
                        "role": "system",
                        "content": self.system_prompt
                    },
                    {
                        "role": "user", 
                        "content": "Hello, I'm calling about the Gospel outreach program."
                    }
                ],
                "max_tokens": 150,
                "temperature": 0.7,
                "top_p": 0.9
            }
            
            response = self.bedrock_runtime.invoke_model_with_response_stream(
                modelId='amazon.nova-pro-v1:0',
                body=json.dumps(text_request),
                contentType='application/json'
            )
            
            audio_response = None
            text_response = None
            
            # Process streaming response from Nova Pro
            text_chunks = []
            for event in response['body']:
                if 'chunk' in event:
                    chunk_data = json.loads(event['chunk']['bytes'].decode())
                    
                    # Nova Pro returns different format
                    if 'contentBlockDelta' in chunk_data:
                        delta = chunk_data['contentBlockDelta']
                        if 'delta' in delta and 'text' in delta['delta']:
                            text_chunks.append(delta['delta']['text'])
            
            # Combine all text chunks
            if text_chunks:
                text_response = ''.join(text_chunks)
                # For now, return text only (no audio)
                # TODO: Add TTS service to convert text to audio
                audio_response = None
            
            return {
                'audio': audio_response,
                'text': text_response
            }
            
        except Exception as e:
            logger.error(f"Error processing audio: {e}")
            return {'error': str(e)}

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'sessions': len(sessions)})

@app.route('/session/start', methods=['POST'])
def start_session():
    """Start a new Nova Sonic session"""
    data = request.json
    session_id = data.get('sessionId')
    
    if not session_id:
        return jsonify({'error': 'sessionId required'}), 400
    
    sessions[session_id] = NovaSonicSession(session_id)
    logger.info(f"Started session {session_id}")
    
    return jsonify({'status': 'started', 'sessionId': session_id})

@app.route('/session/<session_id>/audio', methods=['POST'])
def process_audio(session_id):
    """Process audio for a session"""
    if session_id not in sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    audio_base64 = data.get('audio')
    
    if not audio_base64:
        return jsonify({'error': 'audio data required'}), 400
    
    session = sessions[session_id]
    result = session.process_audio(audio_base64)
    
    return jsonify(result)

@app.route('/session/<session_id>/end', methods=['POST'])
def end_session(session_id):
    """End a session"""
    if session_id in sessions:
        sessions[session_id].is_active = False
        del sessions[session_id]
        logger.info(f"Ended session {session_id}")
    
    return jsonify({'status': 'ended'})

if __name__ == '__main__':
    # Run on a different port than the Node.js service
    app.run(host='0.0.0.0', port=3001, debug=False)