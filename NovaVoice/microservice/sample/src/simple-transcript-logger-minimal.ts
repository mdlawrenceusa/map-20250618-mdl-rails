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

  // Add text - write to BOTH file and DynamoDB IMMEDIATELY (real-time)
  addText(callUuid: string, speaker: 'Human' | 'Assistant', text: string) {
    const session = this.sessions.get(callUuid);
    if (!session) {
      console.error(`⚠️ No session found for call ${callUuid} - cannot add text: ${text.substring(0, 50)}...`);
      return;
    }

    const timestamp = new Date().toLocaleTimeString();
    const line = `**${speaker}** (${timestamp}): ${text}`;
    
    // Add to memory for backup
    session.transcript.push(line);
    
    // REAL-TIME WRITE 1: Immediately append to file
    try {
      fs.appendFileSync(session.mdFilePath, line + '\n\n');
      console.log(`📝 Real-time file write: [${speaker}] ${text.substring(0, 50)}...`);
    } catch (error) {
      console.error(`❌ File write failed for ${callUuid}:`, error);
    }
    
    // REAL-TIME WRITE 2: Immediately update DynamoDB with complete transcript
    const fullTranscript = this.buildCompleteTranscript(session);
    this.dynamoClient.send(new UpdateItemCommand({
      TableName: 'nova-sonic-call-records',
      Key: {
        call_uuid: { S: callUuid }
      },
      UpdateExpression: 'SET transcript = :transcript, updated_at = :updatedAt',
      ExpressionAttributeValues: {
        ':transcript': { S: fullTranscript },
        ':updatedAt': { S: new Date().toISOString() }
      }
    })).then(() => {
      console.log(`📝 Real-time DynamoDB update: [${speaker}] for call ${callUuid}`);
    }).catch(err => {
      console.error(`❌ DynamoDB real-time update failed for ${callUuid}:`, err);
    });
  }

  // Build complete transcript from session data
  private buildCompleteTranscript(session: CallSession): string {
    const header = `# Call Transcript
**Call ID**: ${session.callUuid}
**Phone Number**: ${session.phoneNumber}
**Date**: ${new Date(session.startTime).toLocaleString()}
**Status**: In Progress

---

`;
    
    const transcript = session.transcript.join('\n\n');
    return header + transcript;
  }

  // End call - finalize BOTH file and DynamoDB (with fault tolerance)
  async endCall(callUuid: string) {
    const session = this.sessions.get(callUuid);
    if (!session) {
      console.error(`⚠️ No session found for call ${callUuid} - attempting graceful DynamoDB finalization`);
      
      // Even without session, try to finalize DynamoDB record if it exists
      try {
        await this.dynamoClient.send(new UpdateItemCommand({
          TableName: 'nova-sonic-call-records',
          Key: {
            call_uuid: { S: callUuid }
          },
          UpdateExpression: 'SET end_time = :endTime, #status = :status',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':endTime': { S: new Date().toISOString() },
            ':status': { S: 'completed' }
          }
        }));
        console.log(`✅ Gracefully finalized DynamoDB record for ${callUuid} (no local session)`);
      } catch (error) {
        console.error(`❌ Failed to gracefully finalize ${callUuid}:`, error);
      }
      return;
    }

    const endTime = new Date().toISOString();
    const duration = Math.round((new Date(endTime).getTime() - new Date(session.startTime).getTime()) / 1000);
    
    // Write footer to file (real-time)
    const footer = `\n---\n\n**Call Ended**: ${new Date().toLocaleString()}\n**Duration**: ${duration} seconds\n`;
    try {
      fs.appendFileSync(session.mdFilePath, footer);
      console.log(`📝 Added completion footer to ${session.mdFilePath}`);
    } catch (error) {
      console.error(`❌ Failed to write footer for ${callUuid}:`, error);
    }
    
    // Final update to DynamoDB with complete file content
    try {
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
      }));
      console.log(`📝 Final DynamoDB update completed for ${callUuid}`);
    } catch (error) {
      console.error(`❌ DynamoDB final update failed for ${callUuid}:`, error);
    }
    
    // Clean up memory
    this.sessions.delete(callUuid);
    
    console.log(`✅ Call ${callUuid} completed - duration: ${duration}s - saved to ${session.mdFilePath} AND DynamoDB`);
  }
}

// Export singleton
export const minimalTranscriptLogger = new MinimalTranscriptLogger();