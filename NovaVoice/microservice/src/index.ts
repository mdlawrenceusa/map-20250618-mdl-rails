import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { VonageService } from './vonage';
import { BedrockService } from './bedrock';
import { AudioProcessor } from './audio-processor';
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
const wss = new WebSocketServer({ server, path: '/ws' });

const vonageService = new VonageService();
const activeCalls = new Map<string, ActiveCall>();

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    activeCalls: activeCalls.size,
    uptime: process.uptime()
  });
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
        contentType: 'audio/l16;rate=16000'
      }]
    }
  ]);
});

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
        contentType: 'audio/l16;rate=16000'
      }]
    }
  ]);
});

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
  const urlParts = req.url?.split('/');
  const callId = urlParts?.[urlParts.length - 1];
  
  if (!callId || !activeCalls.has(callId)) {
    logger.error('WebSocket connection for unknown call', { callId });
    ws.close();
    return;
  }

  logger.info('WebSocket connected', { callId });
  
  const call = activeCalls.get(callId)!;
  call.ws = ws;
  
  const audioProcessor = new AudioProcessor();
  let processingAudio = false;

  ws.on('message', async (data: Buffer) => {
    try {
      // Vonage sends raw audio data (L16 PCM 16kHz)
      if (!processingAudio) {
        processingAudio = true;
        
        audioProcessor.queueAudio(data);
        const audioChunk = audioProcessor.getQueuedAudio();
        
        if (audioChunk) {
          // Process with Nova Sonic
          await call.bedrock.processAudioStream(
            callId,
            call.prompt,
            call.params,
            audioChunk,
            (responseAudio: Buffer) => {
              // Send audio back through WebSocket
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(responseAudio);
              }
            },
            (text: string) => {
              // Store transcript
              call.transcript.push(text);
              logger.debug('Transcript update', { callId, text });
            }
          );
        }
        
        processingAudio = false;
      }
    } catch (error: any) {
      logger.error('Error processing WebSocket audio', { 
        callId, 
        error: error.message 
      });
      processingAudio = false;
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket disconnected', { callId });
    
    const call = activeCalls.get(callId);
    if (call) {
      call.ws = null;
      audioProcessor.clearQueue();
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
const PORT = process.env.PORT || 8080;
const WS_PORT = process.env.WS_PORT || 8081;

server.listen(PORT, () => {
  logger.info(`Microservice running on http://0.0.0.0:${PORT}`);
  logger.info(`WebSocket server available on ws://0.0.0.0:${PORT}/ws`);
  logger.info('Environment:', {
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    outboundNumber: process.env.VONAGE_OUTBOUND_NUMBER
  });
});