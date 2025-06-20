import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { VonageService } from './vonage';
import { BedrockService } from './bedrock';
import { AudioProcessor } from './audio-processor';
import { NovaSonicProperClient } from './nova-sonic-proper';
import { CallRequest, CallResponse, InboundRequest, InboundResponse, ActiveCall } from './types';
import { IsString, IsOptional, IsNumber, validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { logger } from './logger';
import dotenv from 'dotenv';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Validation classes
class CallRequestDTO {
  @IsString()
  phoneNumber!: string;

  @IsString()
  prompt!: string;

  @IsOptional()
  novaSonicParams?: {
    maxTokens?: number;
    topP?: number;
    temperature?: number;
  };
}

class InboundRequestDTO {
  @IsString()
  callId!: string;

  @IsString()
  from!: string;

  @IsString()
  to!: string;
}

// Initialize services
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = createServer(app);
const wss = new WebSocketServer({ server });

const vonageService = new VonageService();
const novaSonicClient = new NovaSonicProperClient();
const activeCalls = new Map<string, ActiveCall>();

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    activeCalls: activeCalls.size,
    uptime: process.uptime()
  });
});

// Test NCCO endpoint
app.get('/test-ncco', (req: Request, res: Response) => {
  const testCallId = 'test-call-123';
  res.json([
    {
      action: 'talk',
      text: 'Hello, this is Esther from Mike Lawrence Productions. This is a test message.',
      bargeIn: true
    },
    {
      action: 'talk',
      text: 'Unfortunately, we cannot connect to the WebSocket because SSL is not configured yet. Please try again later.',
      bargeIn: false
    }
  ]);
});

// Outbound call endpoint
app.post('/calls', async (req: Request, res: Response) => {
  try {
    const callRequest = plainToClass(CallRequestDTO, req.body);
    const errors = await validate(callRequest);
    
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: errors.map(e => Object.values(e.constraints || {})).flat()
      });
    }

    const { phoneNumber, prompt, novaSonicParams } = callRequest;
    const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Creating outbound call', { phoneNumber, callId });

    // Initialize call tracking
    const bedrock = new BedrockService();
    const audioProcessor = new AudioProcessor();
    
    activeCalls.set(callId, {
      bedrock,
      ws: null,
      prompt,
      params: novaSonicParams || {},
      phoneNumber,
      startTime: new Date(),
      transcript: []
    });

    // Initiate Vonage call
    const callResponse = await vonageService.initiateOutboundCall(phoneNumber, callId);
    
    if (callResponse.error) {
      activeCalls.delete(callId);
      return res.status(500).json(callResponse);
    }

    res.status(200).json({
      ...callResponse,
      message: 'Call initiated. Audio streaming will begin when call is answered.'
    });

  } catch (error: any) {
    logger.error('Error in /calls endpoint', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Inbound call endpoint
app.post('/inbound', async (req: Request, res: Response) => {
  try {
    const inboundRequest = plainToClass(InboundRequestDTO, req.body);
    const errors = await validate(inboundRequest);
    
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: errors.map(e => Object.values(e.constraints || {})).flat()
      });
    }

    const { callId, from, to } = inboundRequest;
    
    logger.info('Handling inbound call', { callId, from, to });

    // Initialize call tracking with default prompt for inbound
    const bedrock = new BedrockService();
    const audioProcessor = new AudioProcessor();
    const prompt = process.env.DEFAULT_INBOUND_PROMPT || `You are Esther, Mike Lawrence Productions' scheduling assistant. 
    Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program.
    Keep responses brief (under 25 words) and always redirect to scheduling.`;
    
    activeCalls.set(callId, {
      bedrock,
      ws: null,
      prompt,
      params: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
      phoneNumber: from,
      startTime: new Date(),
      transcript: []
    });

    const response = await vonageService.handleInboundCall(callId, from, to);
    res.status(200).json(response);

  } catch (error: any) {
    logger.error('Error in /inbound endpoint', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Vonage webhook endpoints
app.post('/vonage/outbound/answer', async (req: Request, res: Response) => {
  logger.info('Vonage outbound answer webhook', { body: req.body });
  
  const callId = req.body.uuid;
  const call = activeCalls.get(callId);
  
  if (!call) {
    return res.json([{ action: 'talk', text: 'Call configuration error.' }]);
  }

  // Return NCCO for WebSocket connection
  res.json([
    {
      action: 'connect',
      endpoint: [{
        type: 'websocket',
        uri: `wss://${process.env.WEBHOOK_BASE_URL || req.hostname}/ws/${callId}`,
        'content-type': 'audio/l16;rate=16000'
      }]
    }
  ]);
});

// Vonage webhook endpoints that match the configured URLs
// IMPORTANT: Answer webhook uses GET method, not POST!
app.get('/webhooks/answer', async (req: Request, res: Response) => {
  // Parameters come as query string, not JSON body
  const { uuid: callId, from, to, conversation_uuid } = req.query as any;
  
  logger.info('Vonage inbound answer webhook', { 
    query: req.query,
    callId,
    from,
    to,
    conversation_uuid 
  });
  
  // Create call tracking if not exists
  if (!activeCalls.has(callId)) {
    const bedrock = new BedrockService();
    const audioProcessor = new AudioProcessor();
    const prompt = process.env.DEFAULT_INBOUND_PROMPT || `You are Esther from Mike Lawrence Productions.`;
    
    activeCalls.set(callId, {
      bedrock,
      ws: null,
      prompt,
      params: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
      phoneNumber: from,
      startTime: new Date(),
      transcript: []
    });
  }

  // Return NCCO for WebSocket connection
  // CloudFront provides SSL termination, so WSS will work
  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://gospelshare.io';
  
  res.json([
    {
      action: 'connect',
      endpoint: [{
        type: 'websocket',
        uri: `wss://${webhookBaseUrl.replace('https://', '')}/ws/${callId}`,
        'content-type': 'audio/l16;rate=16000',
        headers: {}
      }]
    }
  ]);
});

// IMPORTANT: Answer webhook uses GET method, not POST!
app.get('/outbound/webhooks/answer', async (req: Request, res: Response) => {
  // Parameters come as query string, not JSON body
  const { uuid: callId, from, to, conversation_uuid } = req.query as any;
  
  logger.info('Vonage outbound answer webhook', { 
    query: req.query,
    callId,
    from,
    to,
    conversation_uuid 
  });
  
  // Create call tracking if not exists
  if (!activeCalls.has(callId)) {
    const bedrock = new BedrockService();
    const audioProcessor = new AudioProcessor();
    const prompt = process.env.DEFAULT_INBOUND_PROMPT || `You are Esther from Mike Lawrence Productions.`;
    
    activeCalls.set(callId, {
      bedrock,
      ws: null,
      prompt,
      params: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
      phoneNumber: to, // For outbound, 'to' is the target number
      startTime: new Date(),
      transcript: []
    });
  }

  // Return NCCO for WebSocket connection
  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://gospelshare.io';
  
  res.json([
    {
      action: 'connect',
      endpoint: [{
        type: 'websocket',
        uri: `wss://${webhookBaseUrl.replace('https://', '')}/ws/${callId}`,
        'content-type': 'audio/l16;rate=16000',
        headers: {}
      }]
    }
  ]);
});

// Keep the old endpoint for compatibility
app.post('/vonage/inbound/answer', async (req: Request, res: Response) => {
  logger.info('Vonage inbound answer webhook', { body: req.body });
  
  const { uuid: callId, from, to } = req.body;
  
  // Create call tracking if not exists
  if (!activeCalls.has(callId)) {
    const bedrock = new BedrockService();
    const audioProcessor = new AudioProcessor();
    const prompt = process.env.DEFAULT_INBOUND_PROMPT || `You are Esther from Mike Lawrence Productions.`;
    
    activeCalls.set(callId, {
      bedrock,
      ws: null,
      prompt,
      params: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
      phoneNumber: from,
      startTime: new Date(),
      transcript: []
    });
  }

  // Return NCCO
  res.json([
    {
      action: 'talk',
      text: 'Hello, this is Esther from Mike Lawrence Productions.',
      bargeIn: true
    },
    {
      action: 'connect',
      endpoint: [{
        type: 'websocket',
        uri: `wss://${process.env.WEBHOOK_BASE_URL || req.hostname}/ws/${callId}`,
        'content-type': 'audio/l16;rate=16000'
      }]
    }
  ]);
});

// Recording webhook endpoint
app.post('/webhooks/recording', (req: Request, res: Response) => {
  logger.info('Vonage recording webhook', { body: req.body });
  
  const { recording_url, uuid: callId, duration } = req.body;
  
  const call = activeCalls.get(callId);
  if (call) {
    call.transcript.push(`Recording received: ${recording_url} (${duration}s)`);
  }
  
  res.status(200).send('OK');
});

// Vonage events endpoints that match the configured URLs
app.post('/webhooks/events', (req: Request, res: Response) => {
  logger.info('Vonage inbound event', { body: req.body });
  
  const { uuid: callId, status } = req.body;
  
  if (status === 'completed' || status === 'failed') {
    const call = activeCalls.get(callId);
    if (call) {
      logger.info('Inbound call ended', {
        callId,
        status,
        phoneNumber: call.phoneNumber,
        duration: Date.now() - call.startTime.getTime(),
        transcript: call.transcript
      });
      
      // TODO: Store transcript in DynamoDB and JSON log
      
      activeCalls.delete(callId);
    }
  }
  
  res.status(200).send('OK');
});

app.post('/outbound/webhooks/events', (req: Request, res: Response) => {
  logger.info('Vonage outbound event', { body: req.body });
  
  const { uuid: callId, status } = req.body;
  
  if (status === 'completed' || status === 'failed') {
    const call = activeCalls.get(callId);
    if (call) {
      logger.info('Outbound call ended', {
        callId,
        status,
        phoneNumber: call.phoneNumber,
        duration: Date.now() - call.startTime.getTime(),
        transcript: call.transcript
      });
      
      // TODO: Store transcript in DynamoDB and JSON log
      
      activeCalls.delete(callId);
    }
  }
  
  res.status(200).send('OK');
});

// Keep the old endpoint for compatibility
app.post('/vonage/:type/events', (req: Request, res: Response) => {
  const eventType = req.params.type;
  logger.info(`Vonage ${eventType} event`, { body: req.body });
  
  const { uuid: callId, status } = req.body;
  
  if (status === 'completed' || status === 'failed') {
    const call = activeCalls.get(callId);
    if (call) {
      logger.info('Call ended', {
        callId,
        duration: (new Date().getTime() - call.startTime.getTime()) / 1000,
        transcript: call.transcript.join(' ')
      });
      
      // Clean up
      activeCalls.delete(callId);
    }
  }
  
  res.sendStatus(200);
});

// WebSocket handling
wss.on('connection', (ws: WebSocket, req) => {
  // Extract call ID from URL path: /ws/callId
  const urlMatch = req.url?.match(/^\/ws\/(.+)$/);
  const callId = urlMatch?.[1];
  
  logger.info('WebSocket connection attempt', { 
    url: req.url,
    callId,
    headers: req.headers
  });
  
  if (!callId || !activeCalls.has(callId)) {
    logger.error('WebSocket connection for unknown call', { callId, url: req.url });
    ws.close();
    return;
  }

  logger.info('WebSocket connected', { callId });
  
  const call = activeCalls.get(callId)!;
  call.ws = ws;
  
  // Create stream session for this call
  const streamSession = novaSonicClient.createStreamSession(callId);
  
  // Store stream session reference for cleanup
  (call as any).streamSession = streamSession;
  
  // Set up event handlers using the PoC pattern
  streamSession
    .onEvent('audioOutput', (data: any) => {
      if (ws.readyState === WebSocket.OPEN && data.content) {
        const audioBuffer = Buffer.from(data.content, 'base64');
        ws.send(audioBuffer);
        logger.debug('Sent audio response to caller', { 
          callId, 
          audioSize: audioBuffer.length 
        });
      }
    })
    .onEvent('textOutput', (data: any) => {
      if (data.content) {
        call.transcript.push(data.content);
        logger.info('Nova Sonic response', { callId, text: data.content });
      }
    })
    .onEvent('error', (data: any) => {
      logger.error('Nova Sonic error', { callId, error: data });
    });

  // Initialize session following PoC pattern
  (async () => {
    try {
      await streamSession.setupPromptStart();
      await streamSession.setupSystemPrompt(undefined, call.prompt);
      await streamSession.setupStartAudio();
      await novaSonicClient.initiateSession(callId);
      logger.info('Nova Sonic bidirectional stream started', { callId });
    } catch (error: any) {
      logger.error('Failed to start Nova Sonic stream', { callId, error: error.message });
    }
  })();

  ws.on('message', async (data: Buffer) => {
    try {
      // Vonage sends raw audio data (L16 PCM 16kHz)
      logger.debug('Received audio from caller', { 
        callId, 
        audioSize: data.length 
      });
      
      // Send audio to Nova Sonic for processing
      await streamSession.streamAudio(data);
      
    } catch (error: any) {
      logger.error('Error processing WebSocket audio', { 
        callId, 
        error: error.message 
      });
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket disconnected', { callId });
    
    const call = activeCalls.get(callId);
    if (call) {
      call.ws = null;
    }
    
    // Clean up Nova Sonic session
    const sessionToClose = (call as any)?.streamSession;
    if (sessionToClose) {
      sessionToClose.close().catch((error: any) => {
        logger.error('Error ending Nova Sonic session', { callId, error: error.message });
      });
    }
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error', { callId, error: error.message });
  });
});

// Get call status endpoint
app.get('/calls/:callId', (req: Request, res: Response) => {
  const { callId } = req.params;
  const call = activeCalls.get(callId);
  
  if (!call) {
    return res.status(404).json({ error: 'Call not found' });
  }

  res.json({
    callId,
    phoneNumber: call.phoneNumber,
    startTime: call.startTime,
    duration: (new Date().getTime() - call.startTime.getTime()) / 1000,
    transcript: call.transcript.join(' '),
    status: call.ws ? 'active' : 'ended'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8081;

server.listen(Number(PORT), '0.0.0.0', () => {
  logger.info(`Microservice running on http://0.0.0.0:${PORT}`);
  logger.info(`WebSocket server available on ws://0.0.0.0:${PORT}/ws`);
  logger.info('Environment:', {
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    outboundNumber: process.env.VONAGE_OUTBOUND_NUMBER
  });
});