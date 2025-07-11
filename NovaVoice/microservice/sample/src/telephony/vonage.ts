import { Request, Response } from "express";
import { Session } from "../types";
import { Buffer } from "node:buffer";
import { BargeInHandler } from "../barge-in-handler";
import { getTelephonyBridge } from "../nova-sonic-telephony";

export interface WebhookResponse {
  action: string;
  text?: string;
  from?: string;
  endpoint?: {
    type: string;
    uri: string;
    "content-type": string;
  }[];
}

export class VonageIntegration {
  isOn: boolean;
  private bargeInHandlers = new Map<string, BargeInHandler>();

  constructor(isOn: boolean = false) {
    this.isOn = isOn;
    if (this.isOn) console.log("Vonage integration initialized with barge-in support.");
  }

  public configureRoutes(app: any): void {
    if (!this.isOn) return;

    app.get("/webhooks/answer", this.handleWebhookAnswer.bind(this));
    app.post("/webhooks/events", this.handleWebhookEvents.bind(this));
    
    // Add outbound webhook routes to match Vonage configuration
    app.get("/outbound/webhooks/answer", this.handleWebhookAnswer.bind(this));
    app.post("/outbound/webhooks/events", this.handleWebhookEvents.bind(this));
  }

  private handleWebhookAnswer(req: Request, res: Response): void {
    // Get call details
    const from = req.query.from as string;
    const to = req.query.to as string;
    const callUuid = req.query.uuid as string;
    
    // Determine direction based on the webhook endpoint path
    const isOutbound = req.path.includes('/outbound/');
    const direction = isOutbound ? 'outbound' : 'inbound';
    
    console.log(`[WEBHOOK] Handling ${direction} call from ${from} to ${to}, UUID: ${callUuid}`);
    
    // Initialize transcript logging for this call
    const phoneNumber = direction === 'inbound' ? from : to;
    if (global.transcriptLogger && callUuid) {
      console.log(`🔔 [WEBHOOK] Starting transcript logging for ${direction} call ${callUuid}`);
      global.transcriptLogger.startCall(callUuid, phoneNumber);
    }
    
    // Determine greeting based on call direction
    let greeting: string;
    let fromName: string;
    
    if (isOutbound) {
      // Outbound call - use Esther's greeting
      greeting = "This is Esther calling from GlobalOutreachEvent.com. May I speak with your senior pastor?";
      fromName = "Esther - Mike Lawrence Productions";
    } else {
      // Inbound call - use Esther's greeting for church outreach
      greeting = "Hello, this is Esther from Mike Lawrence Productions. How can I help you today?";
      fromName = "Esther - Mike Lawrence Productions";
    }
    
    // Always use secure WebSocket through CloudFront with channel parameter
    const protocol = 'wss';
    const host = 'gospelshare.io';
    
    // Use TTS for initial greeting on all calls, then connect to WebSocket for AI conversation
    const nccoResponse: WebhookResponse[] = [
      {
        action: "talk",
        text: greeting,
      },
      {
        action: "connect",
        from: fromName,
        endpoint: [
          {
            type: "websocket",
            uri: `${protocol}://${host}/socket?channel=${callUuid}`,
            "content-type": "audio/l16;rate=16000",
          },
        ],
      },
    ];
    
    console.log(`[WEBHOOK] Responding with WebSocket URI: ${protocol}://${host}/socket?channel=${callUuid}`);
    res.status(200).json(nccoResponse);
  }

  private handleWebhookEvents(req: Request, res: Response): void {
    console.log("🔔 [WEBHOOK] Vonage event received:", JSON.stringify(req.body, null, 2));
    
    // Handle call completion events to finalize transcripts
    const { status, uuid, conversation_uuid } = req.body;
    
    console.log(`🔔 [WEBHOOK] Event details - Status: ${status}, UUID: ${uuid}, ConversationUUID: ${conversation_uuid}`);
    
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      console.log(`🔔 [WEBHOOK] Call ${uuid} ended with status: ${status} - Finalizing transcript`);
      
      // Notify the main server about call completion
      // We'll emit this as a global event that the server can listen to
      if (global.transcriptLogger && uuid) {
        console.log(`🔔 [WEBHOOK] Calling endCall for transcript logger with UUID: ${uuid}`);
        global.transcriptLogger.endCall(uuid).then(() => {
          console.log(`🔔 [WEBHOOK] Successfully finalized transcript for call ${uuid}`);
        }).catch((error: any) => {
          console.error(`🔔 [WEBHOOK] Error finalizing transcript for ${uuid}:`, error);
        });
      } else {
        console.log(`🔔 [WEBHOOK] No transcript logger or UUID missing. Logger: ${!!global.transcriptLogger}, UUID: ${uuid}`);
      }
    } else {
      console.log(`🔔 [WEBHOOK] Event status '${status}' - not a completion event, ignoring`);
    }
    
    res.sendStatus(200);
  }

  public async processAudioData(message: Buffer, session: Session): Promise<void> {
    if (!this.isOn) return;
    
    try {
      const audioBuffer = Buffer.from(message);
      const sessionId = session.getSessionId();
      
      // Get or create barge-in handler for this session
      if (!this.bargeInHandlers.has(sessionId)) {
        this.bargeInHandlers.set(sessionId, new BargeInHandler());
        console.log(`[BARGE-IN] 🎯 Created barge-in handler for session ${sessionId}`);
      }
      
      const handler = this.bargeInHandlers.get(sessionId)!;
      
      // Check for interruption
      if (handler.checkForInterruption(audioBuffer)) {
        console.log(`[BARGE-IN] 🚫 INTERRUPTION DETECTED in session ${sessionId}!`);
        
        // Stop current audio output by ending content
        try {
          await session.endAudioContent();
          console.log(`[BARGE-IN] ✅ Stopped AI audio for session ${sessionId}`);
          
          // Restart audio input
          await session.setupStartAudio();
          console.log(`[BARGE-IN] ✅ Restarted audio input for session ${sessionId}`);
        } catch (error) {
          console.error(`[BARGE-IN] ❌ Error handling interruption:`, error);
        }
      }
      
      // Continue with normal audio processing
      await session.streamAudio(audioBuffer);
    } catch (error) {
      console.error("Error processing Vonage audio data:", error);
    }
  }
  
  // Set AI speaking state for barge-in detection
  public setAISpeaking(sessionId: string, speaking: boolean): void {
    const handler = this.bargeInHandlers.get(sessionId);
    if (handler) {
      handler.setAISpeaking(speaking);
      console.log(`[BARGE-IN] 🎤 AI speaking state for ${sessionId}: ${speaking}`);
    }
  }
  
  // Clean up barge-in handler when session ends
  public cleanupSession(sessionId: string): void {
    if (this.bargeInHandlers.has(sessionId)) {
      this.bargeInHandlers.delete(sessionId);
      console.log(`[BARGE-IN] 🧹 Cleaned up barge-in handler for session ${sessionId}`);
    }
  }
}