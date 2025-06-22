// Enhanced logging class that writes to DynamoDB directly when logging events
import { dynamoDBService, CallRecord } from "./dynamodb-service";

interface SessionData {
  callUuid?: string;
  conversationUuid?: string;
  phoneNumber?: string;
  direction?: 'inbound' | 'outbound';
  transcript: string[];
  metrics: {
    interruptions: number;
    bargeIns: number;
    eventCount: number;
  };
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
  startTime: string;
}

export class EnhancedLogger {
  private sessions = new Map<string, SessionData>();
  private updateQueue = new Map<string, NodeJS.Timeout>();
  
  constructor() {
    console.log("🔊 Enhanced logger with direct DynamoDB integration initialized");
  }
  
  /**
   * Main logging method that writes to console and DynamoDB
   */
  async log(level: string, message: string, data?: any) {
    // Always log to console first
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (data) {
      console.log(logMessage, JSON.stringify(data, null, 2));
    } else {
      console.log(logMessage);
    }
    
    // Process DynamoDB writes based on message content
    try {
      if (message.includes('Vonage answer webhook')) {
        await this.handleAnswerWebhook(data);
      } else if (message.includes('Session created')) {
        await this.handleSessionCreated(data);
      } else if (message.includes('User said:')) {
        await this.handleUserInput(data);
      } else if (message.includes('AI response:')) {
        await this.handleAIResponse(data);
      } else if (message.includes('Call completed')) {
        await this.handleCallCompleted(data);
      } else if (message.includes('Vonage event:')) {
        await this.handleVonageEvent(data);
      }
    } catch (error) {
      console.error("Failed to write to DynamoDB:", error);
      // Don't throw - we don't want logging failures to break the call
    }
  }
  
  /**
   * Handle initial call answer webhook
   */
  private async handleAnswerWebhook(data: any) {
    if (!data?.uuid) return;
    
    const callRecord: Partial<CallRecord> = {
      call_uuid: data.uuid,
      conversation_uuid: data.conversation_uuid,
      phone_number: data.to || data.from || 'unknown',
      direction: data.direction || 'inbound',
      status: 'answered',
      start_time: new Date().toISOString()
    };
    
    await dynamoDBService.createCallRecord(callRecord);
    console.log(`📝 DynamoDB: Created call record ${data.uuid}`);
  }
  
  /**
   * Handle session creation
   */
  private async handleSessionCreated(data: any) {
    if (!data?.sessionUuid || !data?.callUuid) return;
    
    // Initialize session data
    this.sessions.set(data.sessionUuid, {
      callUuid: data.callUuid,
      conversationUuid: data.conversationUuid,
      phoneNumber: data.phoneNumber,
      direction: data.direction,
      transcript: [],
      metrics: {
        interruptions: 0,
        bargeIns: 0,
        eventCount: 0
      },
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0
      },
      startTime: new Date().toISOString()
    });
    
    // Update call record with session info
    await dynamoDBService.updateCallRecord(data.callUuid, {
      status: 'connected',
      nova_sonic_data: {
        prompt_version: 'church-outreach-v1.0',
        model_version: 'nova-sonic-v1',
        token_usage: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0
        },
        session_events: 0
      }
    });
  }
  
  /**
   * Handle user input
   */
  private async handleUserInput(data: any) {
    if (!data?.sessionUuid || !data?.content) return;
    
    const session = this.sessions.get(data.sessionUuid);
    if (!session || !session.callUuid) return;
    
    // Add to transcript
    session.transcript.push(`Human: ${data.content}`);
    session.metrics.eventCount++;
    session.tokenUsage.inputTokens += Math.ceil(data.content.length / 4);
    
    // Extract church/pastor info if mentioned
    const churchMatch = data.content.match(/church\s+(?:of\s+)?(\w+(?:\s+\w+)*)/i);
    if (churchMatch) {
      await dynamoDBService.updateCallRecord(session.callUuid, {
        church_name: churchMatch[1]
      });
    }
    
    const pastorMatch = data.content.match(/pastor\s+(\w+(?:\s+\w+)?)/i);
    if (pastorMatch) {
      await dynamoDBService.updateCallRecord(session.callUuid, {
        pastor_name: pastorMatch[1]
      });
    }
    
    // Queue transcript update (throttled)
    this.queueTranscriptUpdate(data.sessionUuid);
  }
  
  /**
   * Handle AI response
   */
  private async handleAIResponse(data: any) {
    if (!data?.sessionUuid || !data?.content) return;
    
    const session = this.sessions.get(data.sessionUuid);
    if (!session || !session.callUuid) return;
    
    // Check for interruption
    if (data.content.includes('interrupted')) {
      session.metrics.interruptions++;
      session.metrics.bargeIns++;
      return; // Don't add interrupted responses to transcript
    }
    
    // Add to transcript
    session.transcript.push(`Assistant: ${data.content}`);
    session.metrics.eventCount++;
    session.tokenUsage.outputTokens += Math.ceil(data.content.length / 4);
    
    // Queue transcript update (throttled)
    this.queueTranscriptUpdate(data.sessionUuid);
  }
  
  /**
   * Handle call completion
   */
  private async handleCallCompleted(data: any) {
    const sessionUuid = data?.sessionUuid;
    if (!sessionUuid) return;
    
    const session = this.sessions.get(sessionUuid);
    if (!session || !session.callUuid) return;
    
    // Cancel any pending updates
    const timer = this.updateQueue.get(sessionUuid);
    if (timer) {
      clearTimeout(timer);
      this.updateQueue.delete(sessionUuid);
    }
    
    // Build final transcript
    const transcript = session.transcript.join('\n');
    
    // Analyze transcript
    const analysis = dynamoDBService.analyzeTranscript(transcript);
    
    // Calculate final metrics
    const totalTokens = session.tokenUsage.inputTokens + session.tokenUsage.outputTokens;
    const cost = totalTokens * 0.0001; // Rough estimate
    
    // Complete the call record
    await dynamoDBService.completeCall(session.callUuid, {
      transcript: transcript,
      ai_summary: analysis.ai_summary,
      outcome: analysis.outcome,
      follow_up_needed: analysis.follow_up_needed,
      metrics: {
        audio_quality: 4.5,
        latency_ms: 200,
        interruptions: session.metrics.interruptions,
        barge_ins: session.metrics.bargeIns,
        sentiment_score: analysis.sentiment_score,
        confidence_score: 0.85
      },
      nova_sonic_data: {
        prompt_version: 'church-outreach-v1.0',
        model_version: 'nova-sonic-v1',
        token_usage: {
          input_tokens: session.tokenUsage.inputTokens,
          output_tokens: session.tokenUsage.outputTokens,
          total_tokens: totalTokens
        },
        session_events: session.metrics.eventCount
      },
      cost: cost
    });
    
    console.log(`✅ Call completed and saved to DynamoDB: ${session.callUuid} (${analysis.outcome})`);
    
    // Clean up session
    this.sessions.delete(sessionUuid);
  }
  
  /**
   * Handle Vonage events
   */
  private async handleVonageEvent(data: any) {
    if (!data?.uuid || !data?.status) return;
    
    const updates: any = {
      status: data.status
    };
    
    if (data.duration) {
      updates.duration_seconds = parseInt(data.duration);
    }
    
    if (data.status === 'completed' || data.status === 'failed') {
      updates.end_time = new Date().toISOString();
    }
    
    await dynamoDBService.updateCallRecord(data.uuid, updates);
    console.log(`📝 DynamoDB: Updated call status to ${data.status} for ${data.uuid}`);
  }
  
  /**
   * Queue transcript update with throttling
   */
  private queueTranscriptUpdate(sessionUuid: string) {
    // Cancel existing timer
    const existingTimer = this.updateQueue.get(sessionUuid);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new timer (update every 5 seconds max)
    const timer = setTimeout(async () => {
      const session = this.sessions.get(sessionUuid);
      if (session && session.callUuid) {
        const transcript = session.transcript.join('\n');
        await dynamoDBService.updateCallRecord(session.callUuid, {
          transcript: transcript,
          nova_sonic_data: {
            prompt_version: 'church-outreach-v1.0',
            model_version: 'nova-sonic-v1',
            token_usage: {
              input_tokens: session.tokenUsage.inputTokens,
              output_tokens: session.tokenUsage.outputTokens,
              total_tokens: session.tokenUsage.inputTokens + session.tokenUsage.outputTokens
            },
            session_events: session.metrics.eventCount
          }
        });
        console.log(`📝 DynamoDB: Updated transcript for ${session.callUuid} (${session.metrics.eventCount} events)`);
      }
      this.updateQueue.delete(sessionUuid);
    }, 5000);
    
    this.updateQueue.set(sessionUuid, timer);
  }
  
  /**
   * Convenience methods that match console.log interface
   */
  info(message: string, data?: any) {
    return this.log('INFO', message, data);
  }
  
  error(message: string, data?: any) {
    return this.log('ERROR', message, data);
  }
  
  warn(message: string, data?: any) {
    return this.log('WARN', message, data);
  }
  
  debug(message: string, data?: any) {
    return this.log('DEBUG', message, data);
  }
}

// Export singleton instance
export const enhancedLogger = new EnhancedLogger();