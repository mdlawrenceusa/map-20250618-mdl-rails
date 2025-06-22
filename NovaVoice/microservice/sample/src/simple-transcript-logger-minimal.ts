// Minimal transcript logger - writes to BOTH file and DynamoDB
// No complex logic, just write to both places at the same time

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

export class MinimalTranscriptLogger {
  private dynamoClient: DynamoDBClient;
  private sessions = new Map<string, CallSession>();
  private transcriptsDir = path.join(__dirname, '../../transcripts');

  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
    
    // Create transcripts directory if it doesn't exist
    if (!fs.existsSync(this.transcriptsDir)) {
      fs.mkdirSync(this.transcriptsDir, { recursive: true });
    }
    
    console.log("📝 Minimal transcript logger initialized");
  }

  // Start a new call - write initial data to BOTH file and DynamoDB
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
    
    // Write header to markdown file
    const header = `# Call Transcript
**Call ID**: ${callUuid}
**Phone Number**: ${phoneNumber}
**Date**: ${new Date().toLocaleString()}
**Status**: In Progress

---

`;
    fs.writeFileSync(mdFilePath, header);
    
    // Write same info to DynamoDB
    this.dynamoClient.send(new PutItemCommand({
      TableName: 'nova-sonic-call-records',
      Item: {
        call_uuid: { S: callUuid },
        phone_number: { S: phoneNumber },
        start_time: { S: startTime },
        transcript: { S: 'Call in progress...' },
        status: { S: 'in_progress' }
      }
    })).catch(err => console.error('DynamoDB write failed:', err));
    
    console.log(`📝 Started call ${callUuid} - writing to ${mdFilePath} AND DynamoDB`);
  }

  // Add text - write to BOTH file and DynamoDB  
  addText(callUuid: string, speaker: 'Human' | 'Assistant', text: string) {
    const session = this.sessions.get(callUuid);
    if (!session) return;

    const timestamp = new Date().toLocaleTimeString();
    const line = `**${speaker}** (${timestamp}): ${text}`;
    
    // Add to memory
    session.transcript.push(line);
    
    // Write to file
    fs.appendFileSync(session.mdFilePath, line + '\n\n');
    
    // Update DynamoDB with latest transcript
    const fullTranscript = session.transcript.join('\n');
    this.dynamoClient.send(new UpdateItemCommand({
      TableName: 'nova-sonic-call-records',
      Key: {
        call_uuid: { S: callUuid }
      },
      UpdateExpression: 'SET transcript = :transcript',
      ExpressionAttributeValues: {
        ':transcript': { S: fullTranscript }
      }
    })).catch(err => console.error('DynamoDB update failed:', err));
    
    console.log(`📝 Added [${speaker}]: ${text.substring(0, 50)}...`);
  }

  // End call - finalize BOTH file and DynamoDB
  async endCall(callUuid: string) {
    const session = this.sessions.get(callUuid);
    if (!session) return;

    const endTime = new Date().toISOString();
    const duration = Math.round((new Date(endTime).getTime() - new Date(session.startTime).getTime()) / 1000);
    
    // Write footer to file
    const footer = `\n---\n\n**Call Ended**: ${new Date().toLocaleString()}\n**Duration**: ${duration} seconds\n`;
    fs.appendFileSync(session.mdFilePath, footer);
    
    // Final update to DynamoDB
    const fullTranscript = fs.readFileSync(session.mdFilePath, 'utf8');
    await this.dynamoClient.send(new UpdateItemCommand({
      TableName: 'nova-sonic-call-records',
      Key: {
        call_uuid: { S: callUuid }
      },
      UpdateExpression: 'SET transcript = :transcript, end_time = :endTime, duration_seconds = :duration, #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':transcript': { S: fullTranscript },
        ':endTime': { S: endTime },
        ':duration': { N: duration.toString() },
        ':status': { S: 'completed' }
      }
    })).catch(err => console.error('DynamoDB final update failed:', err));
    
    // Clean up
    this.sessions.delete(callUuid);
    
    console.log(`✅ Call ${callUuid} ended - saved to ${session.mdFilePath} AND DynamoDB`);
  }
}

// Export singleton
export const minimalTranscriptLogger = new MinimalTranscriptLogger();