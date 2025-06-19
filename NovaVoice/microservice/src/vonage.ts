import { Vonage } from '@vonage/server-sdk';
import { Auth } from '@vonage/auth';
import { CallResponse, InboundResponse } from './types';
import { logger } from './logger';
import fs from 'fs';

export class VonageService {
  private vonageOutbound: Vonage;
  private vonageInbound: Vonage;
  private webhookBaseUrl: string;
  private outboundNumber: string;

  constructor() {
    this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://gospelshare.io';
    this.outboundNumber = process.env.VONAGE_OUTBOUND_NUMBER || '';

    // Read the shared private key
    const privateKey = process.env.VONAGE_OUTBOUND_PRIVATE_KEY_PATH
      ? fs.readFileSync(process.env.VONAGE_OUTBOUND_PRIVATE_KEY_PATH, 'utf8')
      : '';

    // Initialize outbound Vonage client
    this.vonageOutbound = new Vonage(
      new Auth({
        apiKey: process.env.VONAGE_API_KEY!,
        apiSecret: process.env.VONAGE_API_SECRET!,
        applicationId: process.env.VONAGE_OUTBOUND_APPLICATION_ID!,
        privateKey: privateKey
      })
    );

    // Initialize inbound Vonage client (same credentials, different app ID)
    this.vonageInbound = new Vonage(
      new Auth({
        apiKey: process.env.VONAGE_API_KEY!,
        apiSecret: process.env.VONAGE_API_SECRET!,
        applicationId: process.env.VONAGE_INBOUND_APPLICATION_ID!,
        privateKey: privateKey
      })
    );

    logger.info('VonageService initialized', {
      outboundNumber: this.outboundNumber,
      webhookBaseUrl: this.webhookBaseUrl
    });
  }

  async initiateOutboundCall(phoneNumber: string, callId: string): Promise<CallResponse> {
    try {
      logger.info('Initiating outbound call', { phoneNumber, callId });

      const ncco = [
        {
          action: 'talk',
          text: 'Connecting you now.',
          language: 'en-US',
          bargeIn: false
        },
        {
          action: 'connect',
          endpoint: [
            {
              type: 'websocket',
              uri: `wss://${this.webhookBaseUrl}/ws/${callId}`,
              contentType: 'audio/l16;rate=16000',
              headers: {}
            }
          ]
        }
      ];

      const response = await this.vonageOutbound.voice.createOutboundCall({
        to: [{ type: 'phone', number: phoneNumber }],
        from: { type: 'phone', number: this.outboundNumber },
        ncco,
        eventUrl: [`${this.webhookBaseUrl}/outbound/webhooks/events`],
        answerUrl: [`${this.webhookBaseUrl}/outbound/webhooks/answer`]
      });

      logger.info('Outbound call initiated', { 
        callId: response.uuid,
        status: response.status 
      });

      return {
        phoneNumber,
        callStatus: response.status || 'started',
        callId: response.uuid,
        transcript: ''
      };
    } catch (error: any) {
      logger.error('Failed to initiate outbound call', { error: error.message });
      return {
        phoneNumber,
        callStatus: 'failed',
        callId: '',
        transcript: '',
        error: `Failed to initiate Vonage call: ${error.message}`
      };
    }
  }

  async handleInboundCall(callId: string, from: string, to: string): Promise<InboundResponse> {
    logger.info('Handling inbound call', { callId, from, to });

    const ncco = [
      {
        action: 'talk',
        text: 'Hello, I am Esther from Mike Lawrence Productions. How may I help you today?',
        language: 'en-US',
        bargeIn: true
      },
      {
        action: 'connect',
        endpoint: [
          {
            type: 'websocket',
            uri: `wss://${this.webhookBaseUrl}/ws/${callId}`,
            contentType: 'audio/l16;rate=16000',
            headers: {}
          }
        ]
      }
    ];

    return { ncco };
  }

  async streamAudioToCall(callId: string, audioUrl: string): Promise<void> {
    try {
      logger.info('Streaming audio to call', { callId, audioUrl });
      
      // Try outbound first, then inbound
      try {
        await this.vonageOutbound.voice.streamAudio(callId, audioUrl);
      } catch (error) {
        // If outbound fails, try inbound
        await this.vonageInbound.voice.streamAudio(callId, audioUrl);
      }
    } catch (error: any) {
      logger.error('Failed to stream audio to call', { 
        callId, 
        error: error.message 
      });
    }
  }

  async endCall(callId: string): Promise<void> {
    try {
      logger.info('Ending call', { callId });
      
      // Try to end call using both clients
      try {
        await this.vonageOutbound.voice.hangupCall(callId);
      } catch (error) {
        await this.vonageInbound.voice.hangupCall(callId);
      }
    } catch (error: any) {
      logger.error('Failed to end call', { 
        callId, 
        error: error.message 
      });
    }
  }
}