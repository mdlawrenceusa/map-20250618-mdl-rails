import { Vonage } from '@vonage/server-sdk';
import { Auth } from '@vonage/auth';
import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

export interface OutboundCallConfig {
  apiKey: string;
  apiSecret: string;
  applicationId?: string;
  privateKey?: string;
  fromNumber?: string;
}

export interface CallRequest {
  to: string;
  message?: string;
  useAI?: boolean;
  systemPrompt?: string;
  initialMessage?: string;
}

export interface CallEvent {
  uuid: string;
  conversation_uuid: string;
  status: string;
  direction: string;
  timestamp: string;
}

export class OutboundCallManager {
  private vonage: Vonage | null = null;
  private config: OutboundCallConfig | null = null;
  private activeCalls = new Map<string, any>();

  constructor(config?: OutboundCallConfig) {
    if (config) {
      this.initializeWithConfig(config);
    } else {
      console.log('OutboundCallManager created without config - call configure() to set credentials');
    }
  }

  private initializeWithConfig(config: OutboundCallConfig) {
    this.config = config;
    
    // Initialize Vonage client with Auth
    let auth;
    
    if (config.applicationId && config.privateKey) {
      // Use JWT authentication with Application ID
      console.log('Using JWT authentication with Application ID');
      
      // Create custom JWT with correct claims
      const now = Math.round(Date.now() / 1000);
      const payload = {
        iss: config.apiKey,                    // API Key as issuer
        sub: config.apiKey,                    // API Key as subject  
        iat: now,                              // Issued at
        exp: now + 900,                        // Expires in 15 minutes
        jti: uuidv4(),                         // JWT ID
        application_id: config.applicationId   // Application ID
      };
      
      const customJWT = jwt.sign(payload, config.privateKey, { algorithm: 'RS256' });
      console.log('Generated custom JWT with iss claim');
      
      auth = new Auth({
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        applicationId: config.applicationId,
        privateKey: config.privateKey
      });
      
      // Override the JWT generation method
      (auth as any).createJWT = () => customJWT;
      
    } else {
      // Use basic API Key + Secret authentication
      console.log('Using basic API Key + Secret authentication');
      auth = new Auth({
        apiKey: config.apiKey,
        apiSecret: config.apiSecret
      });
    }
    
    this.vonage = new Vonage(auth);
    console.log('OutboundCallManager initialized with config');
  }

  configure(config: OutboundCallConfig) {
    this.initializeWithConfig(config);
  }

  private ensureConfigured() {
    if (!this.vonage || !this.config) {
      throw new Error('OutboundCallManager not configured. Call configure() with credentials first.');
    }
  }

  isConfigured(): boolean {
    return !!(this.vonage && this.config);
  }

  /**
   * Make a basic outbound call with simple TTS
   */
  async makeSimpleCall(to: string, message: string = "Hello, this is a test call from Nova Sonic."): Promise<any> {
    this.ensureConfigured();
    
    try {
      console.log(`Initiating outbound call to ${to}`);

      const call = await this.vonage!.voice.createOutboundCall({
        to: [{
          type: 'phone',
          number: to
        }],
        from: {
          type: 'phone',
          number: this.config!.fromNumber || 'VONAGE'
        },
        answerUrl: [`${this.getServerUrl()}/outbound/webhooks/answer`],
        eventUrl: [`${this.getServerUrl()}/outbound/webhooks/events`]
      });

      // Store call information
      this.activeCalls.set(call.uuid, {
        uuid: call.uuid,
        to: to,
        message: message,
        status: 'initiated',
        timestamp: new Date(),
        useAI: false
      });

      console.log(`Call initiated successfully. UUID: ${call.uuid}`);
      return call;

    } catch (error) {
      console.error('Error making outbound call:', error);
      throw error;
    }
  }

  /**
   * Make an AI-powered outbound call
   */
  async makeAICall(to: string, initialMessage?: string, systemPrompt?: string): Promise<any> {
    this.ensureConfigured();
    
    try {
      console.log(`Initiating AI-powered outbound call to ${to}`);

      const call = await this.vonage!.voice.createOutboundCall({
        to: [{
          type: 'phone',
          number: to
        }],
        from: {
          type: 'phone',
          number: this.config!.fromNumber || 'VONAGE'
        },
        answerUrl: [`${this.getServerUrl()}/outbound/webhooks/answer`],
        eventUrl: [`${this.getServerUrl()}/outbound/webhooks/events`]
      });

      // Store call information
      this.activeCalls.set(call.uuid, {
        uuid: call.uuid,
        to: to,
        message: initialMessage || "Hello, this is Esther calling from Mike Lawrence Productions. Could I please speak with your senior pastor or lead pastor?",
        systemPrompt: systemPrompt,
        status: 'initiated',
        timestamp: new Date(),
        useAI: true
      });

      console.log(`AI call initiated successfully. UUID: ${call.uuid}`);
      return call;

    } catch (error) {
      console.error('Error making AI outbound call:', error);
      throw error;
    }
  }

  /**
   * Handle answer webhook for simple calls
   */
  handleSimpleAnswer(req: Request, res: Response): void {
    const callUuid = req.query.uuid as string;
    const callInfo = this.activeCalls.get(callUuid);

    console.log(`Handling simple answer for call ${callUuid}`);

    const ncco = [
      {
        action: 'talk',
        text: callInfo?.message || 'Hello, this is a test call from Nova Sonic.',
        voiceName: 'Amy'
      },
      {
        action: 'record',
        endOnSilence: 3,
        endOnKey: '#',
        timeOut: 10,
        beepStart: true
      },
      {
        action: 'talk',
        text: 'Thank you for your time. Goodbye!'
      }
    ];

    if (callInfo) {
      callInfo.status = 'answered';
      this.activeCalls.set(callUuid, callInfo);
    }

    res.json(ncco);
  }

  /**
   * Handle answer webhook for AI calls
   */
  handleAIAnswer(req: Request, res: Response): void {
    const callUuid = req.query.uuid as string;
    const callInfo = this.activeCalls.get(callUuid);

    console.log(`Handling AI answer for call ${callUuid}`);

    const ncco = [
      {
        action: 'talk',
        text: callInfo?.message || 'Hello, I am an AI assistant. Please wait while I connect you to our speech system.',
        voiceName: 'Amy'
      },
      {
        action: 'connect',
        from: 'AI Assistant',
        endpoint: [
          {
            type: 'websocket',
            uri: `wss://${req.get('host')}/outbound/ai-websocket/${callUuid}`,
            'content-type': 'audio/l16;rate=16000'
          }
        ]
      }
    ];

    if (callInfo) {
      callInfo.status = 'connected_ai';
      this.activeCalls.set(callUuid, callInfo);
    }

    res.json(ncco);
  }

  /**
   * Handle call events
   */
  handleCallEvents(req: Request, res: Response): void {
    const event = req.body;
    console.log('Call event received:', event);

    if (event.uuid && this.activeCalls.has(event.uuid)) {
      const callInfo = this.activeCalls.get(event.uuid);
      if (callInfo) {
        callInfo.status = event.status;
        callInfo.lastEvent = event;
        this.activeCalls.set(event.uuid, callInfo);
      }
    }

    // Log important events
    if (event.status === 'completed') {
      console.log(`Call ${event.uuid} completed. Duration: ${event.duration}s`);
      // Optionally remove from active calls after some time
      setTimeout(() => {
        this.activeCalls.delete(event.uuid);
      }, 60000); // Remove after 1 minute
    }

    res.status(200).send('OK');
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): any[] {
    return Array.from(this.activeCalls.values());
  }

  getCallInfo(uuid: string): any {
    return this.activeCalls.get(uuid);
  }

  handleCallEvent(event: any): void {
    const uuid = event.uuid;
    if (this.activeCalls.has(uuid)) {
      const callInfo = this.activeCalls.get(uuid);
      if (callInfo) {
        callInfo.status = event.status;
        callInfo.lastEvent = event;
        this.activeCalls.set(uuid, callInfo);
        console.log(`Call ${uuid} status updated to: ${event.status}`);
      }
    }
  }

  /**
   * Get call information by UUID
   */
  getCall(uuid: string): any {
    return this.activeCalls.get(uuid);
  }

  /**
   * Hangup a call
   */
  async hangupCall(uuid: string): Promise<any> {
    this.ensureConfigured();
    
    try {
      console.log(`Hanging up call ${uuid}`);
      const result = await this.vonage!.voice.hangupCall(uuid);
      
      if (this.activeCalls.has(uuid)) {
        const callInfo = this.activeCalls.get(uuid);
        if (callInfo) {
          callInfo.status = 'completed';
          this.activeCalls.set(uuid, callInfo);
        }
      }

      return result;
    } catch (error) {
      console.error(`Error hanging up call ${uuid}:`, error);
      throw error;
    }
  }

  /**
   * Get server URL for webhooks
   */
  private getServerUrl(): string {
    // Use CloudFront domain for webhooks
    return process.env.SERVER_URL || 'https://gospelshare.io';
  }
}

export default OutboundCallManager;