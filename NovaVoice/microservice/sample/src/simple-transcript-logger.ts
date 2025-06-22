// Simple transcript logger for Nova Sonic
// Writes to .md files AND DynamoDB during calls

import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import * as fs from 'fs';
import * as path from 'path';

interface CallSession {
  callUuid: string;
  phoneNumber: string;
  startTime: string;
  transcript: string[];
  mdFilePath: string;
}

export class SimpleTranscriptLogger {
  private dynamoClient: DynamoDBClient;
  private sessions = new Map<string, CallSession>();
  private transcriptsDir = '/opt/nova-sonic/transcripts';

  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
    
    // Create transcripts directory if it doesn't exist
    if (!fs.existsSync(this.transcriptsDir)) {
      fs.mkdirSync(this.transcriptsDir, { recursive: true });
    }
    
    console.log("📝 Simple transcript logger initialized");
  }

  // Start a new call session
  startCall(callUuid: string, phoneNumber: string) {
    const startTime = new Date().toISOString();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const mdFilePath = path.join(this.transcriptsDir, `call-${callUuid}-${timestamp}.md`);
    
    const session: CallSession = {
      callUuid,
      phoneNumber,
      startTime,
      transcript: [],
      mdFilePath
    };
    
    this.sessions.set(callUuid, session);
    
    // Initialize markdown file
    const header = `# Call Transcript
**Call ID**: ${callUuid}
**Phone Number**: ${phoneNumber}
**Date**: ${new Date().toLocaleString()}
**Status**: In Progress

---

`;
    fs.writeFileSync(mdFilePath, header);
    
    // Create initial DynamoDB record
    this.createDynamoRecord(session);
    
    console.log(`📝 Started logging call ${callUuid} to ${mdFilePath}`);
  }

  // Add text to transcript (from textOutput events)
  addText(callUuid: string, speaker: 'Human' | 'Assistant', text: string) {
    const session = this.sessions.get(callUuid);
    if (!session) return;

    const timestamp = new Date().toLocaleTimeString();
    const line = `**${speaker}** (${timestamp}): ${text}`;
    
    // Add to memory
    session.transcript.push(line);
    
    // Append to .md file immediately
    fs.appendFileSync(session.mdFilePath, line + '\n\n');
    
    console.log(`📝 Added to transcript [${speaker}]: ${text.substring(0, 50)}...`);
  }

  // End call and finalize transcript
  async endCall(callUuid: string) {
    const session = this.sessions.get(callUuid);
    if (!session) return;

    const endTime = new Date().toISOString();
    const duration = Math.round((new Date(endTime).getTime() - new Date(session.startTime).getTime()) / 1000);
    
    // Finalize .md file
    const footer = `\n---\n\n**Call Ended**: ${new Date().toLocaleString()}\n**Duration**: ${duration} seconds\n`;
    fs.appendFileSync(session.mdFilePath, footer);
    
    // Read complete transcript from file
    const fullTranscript = fs.readFileSync(session.mdFilePath, 'utf8');
    
    // Update DynamoDB with final transcript
    await this.updateDynamoRecord(session, {
      transcript: fullTranscript,
      endTime,
      duration,
      status: 'completed'
    });
    
    // Clean up session
    this.sessions.delete(callUuid);
    
    console.log(`✅ Call ${callUuid} completed. Transcript saved to ${session.mdFilePath} and DynamoDB`);
  }

  // Create initial DynamoDB record
  private async createDynamoRecord(session: CallSession) {
    try {
      await this.dynamoClient.send(new PutItemCommand({
        TableName: 'nova-sonic-call-records',
        Item: {
          call_uuid: { S: session.callUuid },
          phone_number: { S: session.phoneNumber },
          direction: { S: 'outbound' },
          status: { S: 'in_progress' },
          start_time: { S: session.startTime },
          created_at: { S: session.startTime },
          updated_at: { S: session.startTime },
          transcript: { S: 'Call in progress...' },
          md_file_path: { S: session.mdFilePath }
        }
      }));
      
      console.log(`📝 Created DynamoDB record for call ${session.callUuid}`);
    } catch (error) {
      console.error(`❌ Failed to create DynamoDB record:`, error);
    }
  }

  // Update DynamoDB record with final data
  private async updateDynamoRecord(session: CallSession, updates: any) {
    try {
      await this.dynamoClient.send(new UpdateItemCommand({
        TableName: 'nova-sonic-call-records',
        Key: {
          call_uuid: { S: session.callUuid }
        },
        UpdateExpression: 'SET transcript = :transcript, #status = :status, end_time = :endTime, duration_seconds = :duration, updated_at = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':transcript': { S: updates.transcript },
          ':status': { S: updates.status },
          ':endTime': { S: updates.endTime },
          ':duration': { N: updates.duration.toString() },
          ':updatedAt': { S: new Date().toISOString() }
        }
      }));
      
      console.log(`📝 Updated DynamoDB record for call ${session.callUuid}`);
    } catch (error) {
      console.error(`❌ Failed to update DynamoDB record:`, error);
    }
  }
}

// Export singleton instance
export const simpleTranscriptLogger = new SimpleTranscriptLogger();
