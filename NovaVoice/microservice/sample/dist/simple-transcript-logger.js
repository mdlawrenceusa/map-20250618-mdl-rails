"use strict";
// Simple transcript logger for Nova Sonic
// Writes to .md files AND DynamoDB during calls
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.simpleTranscriptLogger = exports.SimpleTranscriptLogger = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SimpleTranscriptLogger {
    constructor() {
        this.sessions = new Map();
        this.transcriptsDir = '/opt/nova-sonic/transcripts';
        this.dynamoClient = new client_dynamodb_1.DynamoDBClient({ region: 'us-east-1' });
        // Create transcripts directory if it doesn't exist
        if (!fs.existsSync(this.transcriptsDir)) {
            fs.mkdirSync(this.transcriptsDir, { recursive: true });
        }
        console.log("📝 Simple transcript logger initialized");
    }
    // Start a new call session
    startCall(callUuid, phoneNumber) {
        const startTime = new Date().toISOString();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const mdFilePath = path.join(this.transcriptsDir, `call-${callUuid}-${timestamp}.md`);
        const session = {
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
    addText(callUuid, speaker, text) {
        const session = this.sessions.get(callUuid);
        if (!session)
            return;
        const timestamp = new Date().toLocaleTimeString();
        const line = `**${speaker}** (${timestamp}): ${text}`;
        // Add to memory
        session.transcript.push(line);
        // Append to .md file immediately
        fs.appendFileSync(session.mdFilePath, line + '\n\n');
        console.log(`📝 Added to transcript [${speaker}]: ${text.substring(0, 50)}...`);
    }
    // End call and finalize transcript
    async endCall(callUuid) {
        const session = this.sessions.get(callUuid);
        if (!session)
            return;
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
    async createDynamoRecord(session) {
        try {
            await this.dynamoClient.send(new client_dynamodb_1.PutItemCommand({
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
        }
        catch (error) {
            console.error(`❌ Failed to create DynamoDB record:`, error);
        }
    }
    // Update DynamoDB record with final data
    async updateDynamoRecord(session, updates) {
        try {
            await this.dynamoClient.send(new client_dynamodb_1.UpdateItemCommand({
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
        }
        catch (error) {
            console.error(`❌ Failed to update DynamoDB record:`, error);
        }
    }
}
exports.SimpleTranscriptLogger = SimpleTranscriptLogger;
// Export singleton instance
exports.simpleTranscriptLogger = new SimpleTranscriptLogger();
