"use strict";
// Minimal transcript logger - writes to BOTH file and DynamoDB
// No complex logic, just write to both places at the same time
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
exports.minimalTranscriptLogger = exports.MinimalTranscriptLogger = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class MinimalTranscriptLogger {
    constructor() {
        this.sessions = new Map();
        this.transcriptsDir = '/opt/nova-sonic/transcripts';
        this.dynamoClient = new client_dynamodb_1.DynamoDBClient({ region: 'us-east-1' });
        // Create transcripts directory if it doesn't exist
        if (!fs.existsSync(this.transcriptsDir)) {
            fs.mkdirSync(this.transcriptsDir, { recursive: true });
        }
        console.log("📝 Minimal transcript logger initialized");
    }
    // Start a new call - write initial data to BOTH file and DynamoDB
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
        this.dynamoClient.send(new client_dynamodb_1.PutItemCommand({
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
    addText(callUuid, speaker, text) {
        const session = this.sessions.get(callUuid);
        if (!session)
            return;
        const timestamp = new Date().toLocaleTimeString();
        const line = `**${speaker}** (${timestamp}): ${text}`;
        // Add to memory
        session.transcript.push(line);
        // Write to file
        fs.appendFileSync(session.mdFilePath, line + '\n\n');
        // Update DynamoDB with latest transcript
        const fullTranscript = session.transcript.join('\n');
        this.dynamoClient.send(new client_dynamodb_1.UpdateItemCommand({
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
    async endCall(callUuid) {
        const session = this.sessions.get(callUuid);
        if (!session)
            return;
        const endTime = new Date().toISOString();
        const duration = Math.round((new Date(endTime).getTime() - new Date(session.startTime).getTime()) / 1000);
        // Write footer to file
        const footer = `\n---\n\n**Call Ended**: ${new Date().toLocaleString()}\n**Duration**: ${duration} seconds\n`;
        fs.appendFileSync(session.mdFilePath, footer);
        // Final update to DynamoDB
        const fullTranscript = fs.readFileSync(session.mdFilePath, 'utf8');
        await this.dynamoClient.send(new client_dynamodb_1.UpdateItemCommand({
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
exports.MinimalTranscriptLogger = MinimalTranscriptLogger;
// Export singleton
exports.minimalTranscriptLogger = new MinimalTranscriptLogger();
