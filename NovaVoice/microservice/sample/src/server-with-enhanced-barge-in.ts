/**
 * Nova Sonic Server with Enhanced Barge-in Integration
 * Shows how to integrate the new barge-in handler with existing server
 */

import express from 'express';
import WebSocket from 'ws';
import { Server } from 'http';
import path from 'path';
import fs from 'fs';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { Vonage } from '@vonage/server-sdk';
import { BargeInHandler, BargeInSessionManager, ConversationState } from './barge-in-handler.js';
import { s3PromptLoader } from './utils/s3-prompt-loader.js';

interface SessionInfo {
  sessionId: string;
  callId: string;
  websocket: WebSocket;
  bargeInHandler: BargeInHandler;
  bedrockStream?: any;
  lastActivity: number;
}

class NovaServerWithBargeIn {
  private app: express.Application;
  private server: Server;
  private wss: WebSocket.Server;
  private sessions: Map<string, SessionInfo> = new Map();
  private bargeInManager: BargeInSessionManager;
  private bedrockClient: BedrockRuntimeClient;
  private vonage: Vonage;
  private churchPrompt: string = '';

  constructor() {
    this.app = express();
    this.server = new Server(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.bargeInManager = new BargeInSessionManager();
    
    this.bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    this.vonage = new Vonage({
      apiKey: process.env.VONAGE_API_KEY!,
      apiSecret: process.env.VONAGE_API_SECRET!,
      applicationId: process.env.VONAGE_APPLICATION_ID!,
      privateKey: process.env.VONAGE_PRIVATE_KEY_PATH!
    });

    this.setupRoutes();
    this.setupWebSocketHandlers();
  }

  private async loadPrompt(): Promise<void> {
    try {
      const promptPath = path.join(__dirname, '../../../church-outreach-prompt.txt');
      console.log(`[PROMPT DEBUG] Attempting to load prompt...`);
      
      this.churchPrompt = await s3PromptLoader.getPromptWithFallback(promptPath);
      console.log(`[PROMPT DEBUG] Successfully loaded church prompt, length: ${this.churchPrompt.length} characters`);
    } catch (error) {
      console.error('[PROMPT DEBUG] Failed to load prompt:', error.message);
      process.exit(1);
    }
  }

  private setupRoutes(): void {
    this.app.use(express.json());
    this.app.use(express.raw({ type: 'audio/l16', limit: '1mb' }));

    // Health check with barge-in stats
    this.app.get('/health', (req, res) => {
      const sessionStats = this.bargeInManager.getAllStats();
      const totalQueueSize = this.bargeInManager.getTotalQueueSize();
      
      res.json({ 
        status: 'healthy', 
        activeSessions: this.sessions.size,
        totalAudioQueueSize: totalQueueSize,
        bargeInStats: Object.fromEntries(sessionStats),
        timestamp: new Date().toISOString()
      });
    });

    // Barge-in statistics endpoint
    this.app.get('/barge-in/stats', (req, res) => {
      const stats = this.bargeInManager.getAllStats();
      res.json({
        totalSessions: this.sessions.size,
        totalQueueSize: this.bargeInManager.getTotalQueueSize(),
        sessionStats: Object.fromEntries(stats)
      });
    });

    // Standard Vonage webhooks
    this.app.get('/webhooks/answer', (req, res) => {
      const { from } = req.query;
      console.log(`[WEBHOOK] Incoming call from: ${from}`);
      
      const sessionId = this.generateSessionId();
      const wsUrl = `wss://${req.get('host')}/ws/${sessionId}`;
      
      const ncco = [
        {
          action: 'connect',
          eventUrl: [`https://${req.get('host')}/webhooks/events`],
          from: process.env.VONAGE_FROM_NUMBER,
          endpoint: [{
            type: 'websocket',
            uri: wsUrl,
            'content-type': 'audio/l16;rate=16000',
            headers: {
              'call-id': req.query.uuid || sessionId
            }
          }]
        }
      ];

      res.json(ncco);
    });

    this.app.post('/webhooks/events', (req, res) => {
      console.log('[EVENTS]', req.body);
      res.status(200).send('OK');
    });

    // Call initiation
    this.app.post('/call/ai', async (req, res) => {
      try {
        const { to, initialMessage } = req.body;
        
        const call = await this.vonage.voice.createOutboundCall({
          to: [{ type: 'phone', number: to }],
          from: { type: 'phone', number: process.env.VONAGE_FROM_NUMBER! },
          answer_url: [`https://${req.get('host')}/webhooks/answer`],
          event_url: [`https://${req.get('host')}/webhooks/events`]
        });

        res.json({ 
          success: true, 
          callId: call.uuid,
          message: 'Call initiated with enhanced barge-in support'
        });
      } catch (error) {
        console.error('[CALL ERROR]', error);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws, req) => {
      const urlParts = req.url?.split('/');
      const sessionId = urlParts?.[2] || this.generateSessionId();
      
      console.log(`[WS] New connection with enhanced barge-in: ${sessionId}`);
      
      // Create barge-in handler for this session
      const bargeInHandler = this.bargeInManager.getHandler(sessionId, {
        vadThreshold: 0.01,
        silenceThreshold: 1500,
        interruptionDelay: 500,
        maxQueueSize: 100,
        enableSpeculative: true,
        batchProcessingMs: 100
      });

      // Set up barge-in event handlers
      this.setupBargeInEventHandlers(bargeInHandler, sessionId);

      const session: SessionInfo = {
        sessionId,
        callId: req.headers['call-id'] as string || sessionId,
        websocket: ws,
        bargeInHandler,
        lastActivity: Date.now()
      };

      this.sessions.set(sessionId, session);
      this.initializeBedrockStream(session);

      ws.on('message', (data) => {
        this.handleIncomingAudio(session, data as Buffer);
      });

      ws.on('close', () => {
        console.log(`[WS] Connection closed: ${sessionId}`);
        this.cleanupSession(sessionId);
      });

      ws.on('error', (error) => {
        console.error(`[WS ERROR] ${sessionId}:`, error);
        this.cleanupSession(sessionId);
      });
    });
  }

  private setupBargeInEventHandlers(handler: BargeInHandler, sessionId: string): void {
    // Handle barge-in detection
    handler.on('bargeInDetected', (data) => {
      console.log(`[${sessionId}] 🚫 BARGE-IN: User interrupted AI at ${data.timestamp}`);
      
      const session = this.sessions.get(sessionId);
      if (session?.bedrockStream) {
        // Stop current AI generation
        session.bedrockStream.stopGeneration?.();
        console.log(`[${sessionId}] Stopped AI generation due to barge-in`);
      }
    });

    // Handle silence detection
    handler.on('silenceDetected', (data) => {
      console.log(`[${sessionId}] 🔇 SILENCE: ${data.silenceDuration}ms of silence detected`);
      
      // Could trigger AI to start speaking if appropriate
      const session = this.sessions.get(sessionId);
      if (session?.bedrockStream && data.silenceDuration > 2000) {
        // AI can resume or start new response after sufficient silence
        this.triggerAIResponse(session);
      }
    });

    // Handle audio batch processing
    handler.on('audioBatchReady', (data) => {
      const session = this.sessions.get(sessionId);
      if (session?.bedrockStream) {
        // Send batch to Bedrock for processing
        session.bedrockStream.sendAudioBatch?.(data.combinedAudio);
      }
    });
  }

  private async initializeBedrockStream(session: SessionInfo): Promise<void> {
    try {
      console.log(`[BEDROCK] Initializing enhanced stream for session ${session.sessionId}`);
      
      // Initialize Bedrock streaming (mock implementation)
      session.bedrockStream = {
        sendAudio: async (audioData: Buffer) => {
          // Send audio to Bedrock Nova Sonic
          console.log(`[BEDROCK] Processing ${audioData.length} bytes of audio`);
        },
        
        sendAudioBatch: async (batchData: Buffer) => {
          // Send batched audio
          console.log(`[BEDROCK] Processing audio batch: ${batchData.length} bytes`);
        },
        
        stopGeneration: () => {
          // Stop current generation
          console.log(`[BEDROCK] Stopping generation for session ${session.sessionId}`);
          session.bargeInHandler.setListening();
        },
        
        startListening: () => {
          // Start listening mode
          console.log(`[BEDROCK] Starting listening mode for session ${session.sessionId}`);
          session.bargeInHandler.setListening();
        }
      };

      // Simulate AI responses
      this.simulateAIResponses(session);
      
    } catch (error) {
      console.error(`[BEDROCK ERROR] ${session.sessionId}:`, error);
    }
  }

  private simulateAIResponses(session: SessionInfo): void {
    // Simulate periodic AI responses for testing
    const responseInterval = setInterval(() => {
      if (!this.sessions.has(session.sessionId)) {
        clearInterval(responseInterval);
        return;
      }

      const state = session.bargeInHandler.getConversationState();
      
      // Only respond if we're in listening mode and not recently interrupted
      if (state.mode === 'listening' && Date.now() - state.lastSpeechDetected > 3000) {
        this.triggerAIResponse(session);
      }
    }, 10000); // Check every 10 seconds
  }

  private triggerAIResponse(session: SessionInfo): void {
    // Simulate AI starting to speak
    const responseText = "This is a simulated AI response for testing barge-in functionality.";
    
    session.bargeInHandler.setAISpeaking(true, responseText);
    console.log(`[${session.sessionId}] AI starting response: "${responseText.substring(0, 50)}..."`);
    
    // Simulate sending audio back to user
    const simulatedAudioResponse = Buffer.alloc(1600); // 100ms of silence
    if (session.websocket.readyState === WebSocket.OPEN) {
      session.websocket.send(simulatedAudioResponse);
    }
    
    // Simulate AI finishing after 3 seconds
    setTimeout(() => {
      if (this.sessions.has(session.sessionId)) {
        session.bargeInHandler.setAISpeaking(false);
        console.log(`[${session.sessionId}] AI finished speaking`);
      }
    }, 3000);
  }

  private handleIncomingAudio(session: SessionInfo, audioData: Buffer): void {
    session.lastActivity = Date.now();
    
    // Use enhanced barge-in handler for all audio processing
    session.bargeInHandler.addAudioChunk(audioData);
    
    // Traditional processing for backward compatibility
    const hasVoiceActivity = session.bargeInHandler.detectVoiceActivity(audioData);
    const isInterruption = session.bargeInHandler.checkForInterruption(audioData);
    
    if (isInterruption) {
      console.log(`[${session.sessionId}] Traditional barge-in detection also triggered`);
    }
    
    // Send to Bedrock for processing
    if (session.bedrockStream) {
      session.bedrockStream.sendAudio(audioData);
    }
  }

  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.bedrockStream) {
        session.bedrockStream.close?.();
      }
      if (session.websocket.readyState === WebSocket.OPEN) {
        session.websocket.close();
      }
      this.sessions.delete(sessionId);
    }
    
    // Cleanup barge-in handler
    this.bargeInManager.removeHandler(sessionId);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public async start(port: number = 3001): Promise<void> {
    await this.loadPrompt();
    
    this.server.listen(port, () => {
      console.log(`[SERVER] 🎉 Nova Sonic with Enhanced Barge-in listening on port ${port}`);
      console.log(`[SERVER] ✅ Features enabled:`);
      console.log(`[SERVER]   - Async audio queue processing`);
      console.log(`[SERVER]   - Real-time barge-in detection`);
      console.log(`[SERVER]   - Speculative content handling`);
      console.log(`[SERVER]   - Bidirectional streaming`);
      console.log(`[SERVER]   - Session-aware conversation tracking`);
      console.log(`[SERVER] 📊 Monitor at: /health and /barge-in/stats`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private shutdown(): void {
    console.log('[SERVER] Shutting down...');
    
    // Cleanup all sessions
    for (const sessionId of this.sessions.keys()) {
      this.cleanupSession(sessionId);
    }
    
    // Shutdown barge-in manager
    this.bargeInManager.shutdown();
    
    // Close server
    this.server.close(() => {
      console.log('[SERVER] Shutdown complete');
      process.exit(0);
    });
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new NovaServerWithBargeIn();
  server.start().catch(console.error);
}

export default NovaServerWithBargeIn;