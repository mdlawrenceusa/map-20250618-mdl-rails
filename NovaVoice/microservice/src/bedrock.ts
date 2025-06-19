import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { CallRequest } from './types';
import { logger } from './logger';

export class BedrockService {
  private client: BedrockRuntimeClient;
  private transcript: string[] = [];
  private modelId = 'amazon.nova-sonic-v1:0';

  constructor() {
    // Use IAM role if available, otherwise use environment variables
    const credentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      : undefined;

    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      ...(credentials && { credentials })
    });

    logger.info('BedrockService initialized', { 
      region: process.env.AWS_REGION || 'us-east-1',
      modelId: this.modelId 
    });
  }

  async processAudioStream(
    callId: string,
    prompt: string,
    params: CallRequest['novaSonicParams'],
    audioData: Buffer,
    onAudio: (audio: Buffer) => void,
    onTranscript: (text: string) => void
  ): Promise<void> {
    try {
      logger.info('Processing audio with Nova Sonic', { 
        callId, 
        audioSize: audioData.length,
        prompt: prompt.substring(0, 50) + '...'
      });

      // Convert audio to base64
      const audioBase64 = audioData.toString('base64');

      // Prepare the request body for Nova Sonic
      const requestBody = {
        inputText: prompt,
        inputAudio: audioBase64,
        audioConfig: {
          format: "pcm",
          sampleRateHertz: 16000
        },
        inferenceConfig: {
          maxTokens: params?.maxTokens || 1024,
          temperature: params?.temperature || 0.7,
          topP: params?.topP || 0.9
        }
      };

      const command = new InvokeModelWithResponseStreamCommand({
        modelId: this.modelId,
        body: JSON.stringify(requestBody),
        contentType: 'application/json'
      });

      const response = await this.client.send(command);

      // Process the streaming response
      if (response.body) {
        for await (const event of response.body) {
          if (event.chunk) {
            try {
              const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
              
              // Handle audio output
              if (chunkData.outputAudio) {
                const audioData = Buffer.from(chunkData.outputAudio, 'base64');
                onAudio(audioData);
                logger.debug('Received audio chunk from Nova Sonic', { 
                  size: audioData.length 
                });
              }

              // Handle text output
              if (chunkData.outputText) {
                this.transcript.push(chunkData.outputText);
                onTranscript(chunkData.outputText);
                logger.debug('Received text from Nova Sonic', { 
                  text: chunkData.outputText 
                });
              }

            } catch (parseError: any) {
              logger.error('Failed to parse Nova Sonic chunk', { 
                error: parseError.message 
              });
            }
          }
        }
      }

    } catch (error: any) {
      logger.error('Error processing audio with Nova Sonic', { 
        callId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  getTranscript(): string {
    return this.transcript.join(' ');
  }

  clearTranscript(): void {
    this.transcript = [];
  }
}