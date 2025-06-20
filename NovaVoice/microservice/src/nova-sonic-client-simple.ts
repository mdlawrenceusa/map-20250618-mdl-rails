/**
 * Simplified Nova Sonic Client based on working PoC
 */

import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { EventEmitter } from 'events';
import { logger } from './logger';

interface SessionData {
  sessionId: string;
  isActive: boolean;
  startTime: number;
  transcript: string[];
}

export class NovaSonicClient extends EventEmitter {
  private client: BedrockRuntimeClient;
  private sessions = new Map<string, SessionData>();
  private modelId = 'amazon.nova-sonic-v1:0';

  constructor() {
    super();
    
    // Initialize with standard HTTP handler for now
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      requestHandler: new NodeHttp2Handler({
        maxConcurrentStreams: 10,
      }),
    });

    logger.info('Nova Sonic Client initialized', {
      region: process.env.AWS_REGION || 'us-east-1',
      modelId: this.modelId
    });
  }

  async startSession(sessionId: string, systemPrompt: string): Promise<void> {
    try {
      logger.info('Starting Nova Sonic session', { sessionId });

      // Create session data
      const sessionData: SessionData = {
        sessionId,
        isActive: true,
        startTime: Date.now(),
        transcript: []
      };

      this.sessions.set(sessionId, sessionData);
      this.emit('sessionStarted', sessionId);
      
      logger.info('Nova Sonic session started', { sessionId });

    } catch (error: any) {
      logger.error('Failed to start Nova Sonic session', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async sendAudio(sessionId: string, audioData: Buffer): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      logger.warn('Attempted to send audio to inactive session', { sessionId });
      return;
    }

    try {
      // Convert audio to base64
      const audioBase64 = audioData.toString('base64');

      // Get the system prompt for this session
      const systemPrompt = `You are Esther, Mike Lawrence Productions' scheduling assistant. 
      Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program. 
      Key Facts: Program is two-phase outreach (entertainment THEN Gospel presentation), 
      Format is 40-50 min Off-Broadway illusion show + 30 min separate Gospel message, 
      Track Record similar to Campus Crusade approach (~100,000 decisions).
      When asked who attends: The meeting is between your Pastor and Mike Lawrence, our founder. I'm just scheduling it for you.
      Be Brief: 1-2 sentences maximum per response. Always redirect to scheduling the meeting.
      Website: globaloutreachevent.com, Mike Lawrence Direct Number: 347-300-5533
      
      IMPORTANT: Respond with both speech audio and text. Provide clear, natural speech responses.`;

      // Prepare the request body for Nova Sonic
      const requestBody = {
        inputText: systemPrompt,
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

      logger.debug('Calling Nova Sonic API', {
        sessionId,
        audioSize: audioData.length
      });

      const response = await this.client.send(command);

      if (response.body) {
        for await (const event of response.body) {
          if (event.chunk) {
            try {
              const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
              
              // Handle audio output
              if (chunkData.outputAudio) {
                const audioBuffer = Buffer.from(chunkData.outputAudio, 'base64');
                this.emit('audioOutput', sessionId, audioBuffer);
                logger.debug('Received audio from Nova Sonic', { 
                  sessionId,
                  size: audioBuffer.length 
                });
              }

              // Handle text output
              if (chunkData.outputText) {
                session.transcript.push(chunkData.outputText);
                this.emit('textOutput', sessionId, chunkData.outputText);
                logger.info('Received text from Nova Sonic', { 
                  sessionId,
                  text: chunkData.outputText 
                });
              }

            } catch (parseError: any) {
              logger.error('Failed to parse Nova Sonic response', { 
                sessionId,
                error: parseError.message 
              });
            }
          }
        }
      }

    } catch (error: any) {
      logger.error('Failed to send audio to Nova Sonic', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
      this.emit('error', sessionId, error);
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      session.isActive = false;
      this.sessions.delete(sessionId);
      
      logger.info('Nova Sonic session ended', { 
        sessionId,
        duration: Date.now() - session.startTime,
        transcriptLength: session.transcript.length
      });

      this.emit('sessionEnded', sessionId);

    } catch (error: any) {
      logger.error('Error ending Nova Sonic session', {
        sessionId,
        error: error.message
      });
    }
  }

  getSessionTranscript(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    return session ? session.transcript : [];
  }

  isSessionActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.isActive : false;
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys()).filter(sessionId => 
      this.sessions.get(sessionId)?.isActive
    );
  }
}