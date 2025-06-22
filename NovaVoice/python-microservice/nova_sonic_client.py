import os
import asyncio
import base64
import json
import uuid
import logging
from aws_sdk_bedrock_runtime.client import BedrockRuntimeClient, InvokeModelWithBidirectionalStreamOperationInput
from aws_sdk_bedrock_runtime.models import InvokeModelWithBidirectionalStreamInputChunk, BidirectionalInputPayloadPart
from aws_sdk_bedrock_runtime.config import Config, HTTPAuthSchemeResolver, SigV4AuthScheme
from smithy_aws_core.credentials_resolvers.environment import EnvironmentCredentialsResolver

logger = logging.getLogger(__name__)

class NovaSonicClient:
    def __init__(self, session_id: str, model_id='amazon.nova-sonic-v1:0', region='us-east-1'):
        self.session_id = session_id
        self.model_id = model_id
        self.region = region
        self.client = None
        self.stream = None
        self.response = None
        self.is_active = False
        self.prompt_name = str(uuid.uuid4())
        self.content_name = str(uuid.uuid4())
        self.audio_content_name = str(uuid.uuid4())
        self.audio_queue = asyncio.Queue()
        self.transcript = []
        self.role = None
        self.display_assistant_text = False
        
    def _initialize_client(self):
        """Initialize the Bedrock client."""
        config = Config(
            endpoint_uri=f"https://bedrock-runtime.{self.region}.amazonaws.com",
            region=self.region,
            aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
            http_auth_scheme_resolver=HTTPAuthSchemeResolver(),
            http_auth_schemes={"aws.auth#sigv4": SigV4AuthScheme()}
        )
        self.client = BedrockRuntimeClient(config=config)
        logger.info(f"Nova Sonic client initialized for session {self.session_id}")
    
    async def send_event(self, event_json):
        """Send an event to the stream."""
        event = InvokeModelWithBidirectionalStreamInputChunk(
            value=BidirectionalInputPayloadPart(bytes_=event_json.encode('utf-8'))
        )
        await self.stream.input_stream.send(event)
        logger.debug(f"Sent event for session {self.session_id}: {event_json[:100]}...")
    
    async def start_session(self, system_prompt: str):
        """Start a new session with Nova Sonic."""
        if not self.client:
            self._initialize_client()
            
        logger.info(f"Starting Nova Sonic session {self.session_id}")
            
        # Initialize the stream
        self.stream = await self.client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
        )
        self.is_active = True
        
        # Send session start event
        session_start = '''
        {
          "event": {
            "sessionStart": {
              "inferenceConfiguration": {
                "maxTokens": 1024,
                "topP": 0.9,
                "temperature": 0.7
              }
            }
          }
        }
        '''
        await self.send_event(session_start)
        
        # Send prompt start event with voice configuration
        prompt_start = f'''
        {{
          "event": {{
            "promptStart": {{
              "promptName": "{self.prompt_name}",
              "textOutputConfiguration": {{
                "mediaType": "text/plain"
              }},
              "audioOutputConfiguration": {{
                "mediaType": "audio/lpcm",
                "sampleRateHertz": 24000,
                "sampleSizeBits": 16,
                "channelCount": 1,
                "voiceId": "matthew",
                "encoding": "base64",
                "audioType": "SPEECH"
              }}
            }}
          }}
        }}
        '''
        await self.send_event(prompt_start)
        
        # Send system prompt
        text_content_start = f'''
        {{
            "event": {{
                "contentStart": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.content_name}",
                    "type": "TEXT",
                    "interactive": true,
                    "role": "SYSTEM",
                    "textInputConfiguration": {{
                        "mediaType": "text/plain"
                    }}
                }}
            }}
        }}
        '''
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
        
        text_content_end = f'''
        {{
            "event": {{
                "contentEnd": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.content_name}"
                }}
            }}
        }}
        '''
        await self.send_event(text_content_end)
        
        # Start audio input immediately
        await self.start_audio_input()
        
        # Start processing responses
        self.response = asyncio.create_task(self._process_responses())
        
        logger.info(f"Nova Sonic session {self.session_id} started successfully")
    
    async def start_audio_input(self):
        """Start audio input stream."""
        audio_content_start = f'''
        {{
            "event": {{
                "contentStart": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.audio_content_name}",
                    "type": "AUDIO",
                    "interactive": true,
                    "role": "USER",
                    "audioInputConfiguration": {{
                        "mediaType": "audio/lpcm",
                        "sampleRateHertz": 16000,
                        "sampleSizeBits": 16,
                        "channelCount": 1,
                        "audioType": "SPEECH",
                        "encoding": "base64"
                    }}
                }}
            }}
        }}
        '''
        await self.send_event(audio_content_start)
        logger.debug(f"Started audio input for session {self.session_id}")
    
    async def send_audio_chunk(self, audio_bytes):
        """Send an audio chunk to the stream."""
        if not self.is_active:
            return
            
        blob = base64.b64encode(audio_bytes)
        audio_event = f'''
        {{
            "event": {{
                "audioInput": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.audio_content_name}",
                    "content": "{blob.decode('utf-8')}"
                }}
            }}
        }}
        '''
        await self.send_event(audio_event)
    
    async def end_audio_input(self):
        """End audio input stream."""
        audio_content_end = f'''
        {{
            "event": {{
                "contentEnd": {{
                    "promptName": "{self.prompt_name}",
                    "contentName": "{self.audio_content_name}"
                }}
            }}
        }}
        '''
        await self.send_event(audio_content_end)
        logger.debug(f"Ended audio input for session {self.session_id}")
    
    async def end_session(self):
        """End the session."""
        if not self.is_active:
            return
            
        logger.info(f"Ending Nova Sonic session {self.session_id}")
        self.is_active = False
        
        try:
            # End audio input first
            await self.end_audio_input()
            
            # End prompt
            prompt_end = f'''
            {{
                "event": {{
                    "promptEnd": {{
                        "promptName": "{self.prompt_name}"
                    }}
                }}
            }}
            '''
            await self.send_event(prompt_end)
            
            # End session
            session_end = '''
            {
                "event": {
                    "sessionEnd": {}
                }
            }
            '''
            await self.send_event(session_end)
            
            # Close the stream
            await self.stream.input_stream.close()
            
            # Cancel response processing
            if self.response and not self.response.done():
                self.response.cancel()
                
        except Exception as e:
            logger.error(f"Error ending session {self.session_id}: {e}")
    
    async def _process_responses(self):
        """Process responses from the stream."""
        try:
            while self.is_active:
                output = await self.stream.await_output()
                result = await output[1].receive()
                
                if result.value and result.value.bytes_:
                    response_data = result.value.bytes_.decode('utf-8')
                    json_data = json.loads(response_data)
                    
                    if 'event' in json_data:
                        # Handle content start event
                        if 'contentStart' in json_data['event']:
                            content_start = json_data['event']['contentStart'] 
                            self.role = content_start['role']
                            
                            # Check for speculative content
                            if 'additionalModelFields' in content_start:
                                additional_fields = json.loads(content_start['additionalModelFields'])
                                if additional_fields.get('generationStage') == 'SPECULATIVE':
                                    self.display_assistant_text = True
                                else:
                                    self.display_assistant_text = False
                                
                        # Handle text output event
                        elif 'textOutput' in json_data['event']:
                            text = json_data['event']['textOutput']['content']    
                            
                            if self.role == "ASSISTANT" and self.display_assistant_text:
                                self.transcript.append(f"Assistant: {text}")
                                logger.info(f"Nova Sonic text response: {text}")
                            elif self.role == "USER":
                                self.transcript.append(f"User: {text}")
                                logger.info(f"User transcript: {text}")
                        
                        # Handle audio output
                        elif 'audioOutput' in json_data['event']:
                            audio_content = json_data['event']['audioOutput']['content']
                            audio_bytes = base64.b64decode(audio_content)
                            await self.audio_queue.put(audio_bytes)
                            logger.debug(f"Received audio response: {len(audio_bytes)} bytes")
                            
                        # Handle content end
                        elif 'contentEnd' in json_data['event']:
                            logger.debug(f"Content end for session {self.session_id}")
                            
                        # Handle errors
                        elif 'error' in json_data['event']:
                            logger.error(f"Nova Sonic error: {json_data['event']['error']}")
                            
        except asyncio.CancelledError:
            logger.info(f"Response processing cancelled for session {self.session_id}")
        except Exception as e:
            logger.error(f"Error processing responses for session {self.session_id}: {e}")