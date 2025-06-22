import os
import asyncio
import base64
import json
import uuid
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

class NovaSonicClient:
    def __init__(self, session_id: str, model_id='amazon.nova-sonic-v1:0', region='us-east-1'):
        self.session_id = session_id
        self.model_id = model_id
        self.region = region
        self.bedrock_runtime = boto3.client(
            service_name='bedrock-runtime',
            region_name=region
        )
        self.is_active = False
        self.prompt_name = str(uuid.uuid4())
        self.content_name = str(uuid.uuid4())
        self.audio_content_name = str(uuid.uuid4())
        self.audio_queue = asyncio.Queue()
        self.transcript = []
        
        logger.info(f"Nova Sonic client initialized for session {self.session_id}")
    
    async def start_session(self, system_prompt: str):
        """Start a new session with Nova Sonic using invoke_model_with_response_stream for now"""
        logger.info(f"Starting Nova Sonic session {self.session_id}")
        self.is_active = True
        
        # Store system prompt for use in audio processing
        self.system_prompt = system_prompt
        
        logger.info(f"Nova Sonic session {self.session_id} ready for audio")
    
    async def send_audio_chunk(self, audio_bytes):
        """Process audio chunk and generate response"""
        if not self.is_active:
            return
            
        try:
            # Convert audio to base64
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
            
            # Prepare request body for Nova Sonic
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
            
            # Call Nova Sonic with response stream
            response = self.bedrock_runtime.invoke_model_with_response_stream(
                modelId=self.model_id,
                body=json.dumps(request_body),
                contentType='application/json'
            )
            
            # Process the streaming response
            for event in response['body']:
                if 'chunk' in event:
                    chunk_data = json.loads(event['chunk']['bytes'].decode())
                    
                    # Handle audio output
                    if 'outputAudio' in chunk_data:
                        audio_data = base64.b64decode(chunk_data['outputAudio'])
                        await self.audio_queue.put(audio_data)
                        logger.debug(f"Received audio response: {len(audio_data)} bytes")
                    
                    # Handle text output
                    if 'outputText' in chunk_data:
                        text = chunk_data['outputText']
                        self.transcript.append(f"Assistant: {text}")
                        logger.info(f"Nova Sonic text response: {text}")
                        
        except ClientError as e:
            logger.error(f"AWS Bedrock error: {e}")
        except Exception as e:
            logger.error(f"Error processing audio chunk: {e}")
    
    async def end_session(self):
        """End the session."""
        if not self.is_active:
            return
            
        logger.info(f"Ending Nova Sonic session {self.session_id}")
        self.is_active = False