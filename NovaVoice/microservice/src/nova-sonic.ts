import { EventEmitter } from 'events';
import { createHash, createHmac } from 'crypto';
import https from 'https';
import { URL } from 'url';
import { logger } from './logger';
import { PromptService } from './services/PromptService';

interface NovaSonicConfig {
  region?: string;
  modelId?: string;
  systemPrompt?: string;
}

interface StreamEvent {
  type: string;
  data?: any;
}

export class NovaSonicService extends EventEmitter {
  private region: string;
  private modelId: string;
  private systemPrompt: string;
  private sessionId?: string;
  private stream?: any;
  private isStreaming: boolean = false;
  private promptService: PromptService;

  constructor(config: NovaSonicConfig = {}) {
    super();
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.modelId = config.modelId || 'amazon.nova-sonic-v1:0';
    this.systemPrompt = config.systemPrompt || '';
    this.promptService = new PromptService();
    
    logger.info('NovaSonicService initialized', {
      region: this.region,
      modelId: this.modelId
    });
  }

  async initializePrompt(assistantName: string = 'default'): Promise<void> {
    if (!this.systemPrompt) {
      this.systemPrompt = await this.promptService.getPrompt(assistantName);
      logger.info('Initialized system prompt', { 
        assistantName, 
        promptLength: this.systemPrompt.length 
      });
    }
  }

  async startBidirectionalStream(callId: string, assistantName: string = 'default'): Promise<void> {
    if (this.isStreaming) {
      logger.warn('Stream already active');
      return;
    }

    try {
      // Initialize prompt if not set
      await this.initializePrompt(assistantName);
      
      this.sessionId = callId;
      this.isStreaming = true;
      
      // Create the request for bidirectional streaming
      const endpoint = `https://bedrock-runtime.${this.region}.amazonaws.com`;
      const path = `/model/${this.modelId}/invoke-with-bidirectional-stream`;
      
      logger.info('Starting Nova Sonic bidirectional stream', {
        endpoint,
        path,
        sessionId: this.sessionId
      });

      // Initialize the HTTP/2 connection
      const url = new URL(endpoint + path);
      
      // Prepare the initial request with system prompt
      const initialEvent = {
        type: 'sessionStart',
        data: {
          systemPrompt: this.systemPrompt,
          sessionId: this.sessionId,
          inferenceConfig: {
            maxTokens: 1024,
            temperature: 0.7,
            topP: 0.9
          }
        }
      };

      // Send initial event
      this.sendEvent(initialEvent);
      
      // Emit ready event
      this.emit('ready', { sessionId: this.sessionId });
      
    } catch (error: any) {
      logger.error('Failed to start Nova Sonic stream', {
        error: error.message,
        stack: error.stack
      });
      this.isStreaming = false;
      throw error;
    }
  }

  async sendAudio(audioData: Buffer): Promise<void> {
    if (!this.isStreaming) {
      logger.warn('Cannot send audio - stream not active');
      return;
    }

    try {
      // Nova Sonic expects PCM 16-bit, 16kHz audio
      const audioEvent = {
        type: 'audioInput',
        data: {
          audio: audioData.toString('base64')
        }
      };

      this.sendEvent(audioEvent);
      
    } catch (error: any) {
      logger.error('Failed to send audio to Nova Sonic', {
        error: error.message
      });
    }
  }

  private async sendEvent(event: StreamEvent): Promise<void> {
    logger.debug('Sending event to Nova Sonic', {
      type: event.type,
      dataSize: JSON.stringify(event.data || {}).length
    });

    // For audio input, call the real Nova Sonic API
    if (event.type === 'audioInput' && event.data?.audio) {
      try {
        await this.callNovaSonicAPI(event.data.audio);
      } catch (error: any) {
        logger.error('Failed to call Nova Sonic API', { error: error.message });
        this.emit('error', error);
      }
    }
  }

  private async callNovaSonicAPI(audioBase64: string): Promise<void> {
    try {
      const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = await import('@aws-sdk/client-bedrock-runtime');
      
      const client = new BedrockRuntimeClient({
        region: this.region
      });

      const requestBody = {
        inputText: this.systemPrompt,
        inputAudio: audioBase64,
        audioConfig: {
          format: "pcm",
          sampleRateHertz: 16000
        },
        inferenceConfig: {
          maxTokens: 1024,
          temperature: 0.7,
          topP: 0.9
        }
      };

      const command = new InvokeModelWithResponseStreamCommand({
        modelId: this.modelId,
        body: JSON.stringify(requestBody),
        contentType: 'application/json'
      });

      logger.info('Calling real Nova Sonic API', {
        modelId: this.modelId,
        audioSize: audioBase64.length
      });

      const response = await client.send(command);

      if (response.body) {
        for await (const event of response.body) {
          if (event.chunk) {
            try {
              const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
              
              // Handle audio output
              if (chunkData.outputAudio) {
                const audioBuffer = Buffer.from(chunkData.outputAudio, 'base64');
                this.emit('audio', audioBuffer);
                logger.debug('Received audio from Nova Sonic', { 
                  size: audioBuffer.length 
                });
              }

              // Handle text output
              if (chunkData.outputText) {
                this.emit('transcript', chunkData.outputText);
                logger.info('Received text from Nova Sonic', { 
                  text: chunkData.outputText 
                });
              }

            } catch (parseError: any) {
              logger.error('Failed to parse Nova Sonic response', { 
                error: parseError.message 
              });
            }
          }
        }
      }

    } catch (error: any) {
      logger.error('Nova Sonic API call failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  private handleStreamEvent(event: StreamEvent): void {
    logger.debug('Received Nova Sonic event', {
      type: event.type
    });

    switch (event.type) {
      case 'audioOutput':
        if (event.data?.audio) {
          const audioBuffer = Buffer.from(event.data.audio, 'base64');
          this.emit('audio', audioBuffer);
        }
        break;
        
      case 'textOutput':
        if (event.data?.text) {
          this.emit('transcript', event.data.text);
        }
        break;
        
      case 'error':
        logger.error('Nova Sonic error', event.data);
        this.emit('error', new Error(event.data?.message || 'Unknown error'));
        break;
        
      case 'contentEnd':
        logger.info('Nova Sonic stream ended');
        this.emit('end');
        this.cleanup();
        break;
    }
  }

  async stopStream(): Promise<void> {
    if (!this.isStreaming) {
      return;
    }

    try {
      const endEvent = {
        type: 'sessionEnd',
        data: {
          sessionId: this.sessionId
        }
      };

      this.sendEvent(endEvent);
      this.cleanup();
      
    } catch (error: any) {
      logger.error('Error stopping Nova Sonic stream', {
        error: error.message
      });
    }
  }

  private cleanup(): void {
    this.isStreaming = false;
    this.sessionId = undefined;
    this.removeAllListeners();
  }
}