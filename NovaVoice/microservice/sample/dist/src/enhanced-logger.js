"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedLogger = exports.EnhancedLogger = void 0;
// Enhanced logging class that writes to DynamoDB directly when logging events
const dynamodb_service_1 = require("./dynamodb-service");
class EnhancedLogger {
    constructor() {
        this.sessions = new Map();
        this.updateQueue = new Map();
        console.log("🔊 Enhanced logger with direct DynamoDB integration initialized");
    }
    /**
     * Main logging method that writes to console and DynamoDB
     */
    async log(level, message, data) {
        // Always log to console first
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        if (data) {
            console.log(logMessage, JSON.stringify(data, null, 2));
        }
        else {
            console.log(logMessage);
        }
        // Process DynamoDB writes based on message content
        try {
            if (message.includes('Vonage answer webhook')) {
                await this.handleAnswerWebhook(data);
            }
            else if (message.includes('Session created')) {
                await this.handleSessionCreated(data);
            }
            else if (message.includes('User said:')) {
                await this.handleUserInput(data);
            }
            else if (message.includes('AI response:')) {
                await this.handleAIResponse(data);
            }
            else if (message.includes('Call completed')) {
                await this.handleCallCompleted(data);
            }
            else if (message.includes('Vonage event:')) {
                await this.handleVonageEvent(data);
            }
        }
        catch (error) {
            console.error("Failed to write to DynamoDB:", error);
            // Don't throw - we don't want logging failures to break the call
        }
    }
    /**
     * Handle initial call answer webhook
     */
    async handleAnswerWebhook(data) {
        if (!data?.uuid)
            return;
        const callRecord = {
            call_uuid: data.uuid,
            conversation_uuid: data.conversation_uuid,
            phone_number: data.to || data.from || 'unknown',
            direction: data.direction || 'inbound',
            status: 'answered',
            start_time: new Date().toISOString()
        };
        await dynamodb_service_1.dynamoDBService.createCallRecord(callRecord);
        console.log(`📝 DynamoDB: Created call record ${data.uuid}`);
    }
    /**
     * Handle session creation
     */
    async handleSessionCreated(data) {
        if (!data?.sessionUuid || !data?.callUuid)
            return;
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
        await dynamodb_service_1.dynamoDBService.updateCallRecord(data.callUuid, {
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
    async handleUserInput(data) {
        if (!data?.sessionUuid || !data?.content)
            return;
        const session = this.sessions.get(data.sessionUuid);
        if (!session || !session.callUuid)
            return;
        // Add to transcript
        session.transcript.push(`Human: ${data.content}`);
        session.metrics.eventCount++;
        session.tokenUsage.inputTokens += Math.ceil(data.content.length / 4);
        // Extract church/pastor info if mentioned
        const churchMatch = data.content.match(/church\s+(?:of\s+)?(\w+(?:\s+\w+)*)/i);
        if (churchMatch) {
            await dynamodb_service_1.dynamoDBService.updateCallRecord(session.callUuid, {
                church_name: churchMatch[1]
            });
        }
        const pastorMatch = data.content.match(/pastor\s+(\w+(?:\s+\w+)?)/i);
        if (pastorMatch) {
            await dynamodb_service_1.dynamoDBService.updateCallRecord(session.callUuid, {
                pastor_name: pastorMatch[1]
            });
        }
        // Queue transcript update (throttled)
        this.queueTranscriptUpdate(data.sessionUuid);
    }
    /**
     * Handle AI response
     */
    async handleAIResponse(data) {
        if (!data?.sessionUuid || !data?.content)
            return;
        const session = this.sessions.get(data.sessionUuid);
        if (!session || !session.callUuid)
            return;
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
    async handleCallCompleted(data) {
        const sessionUuid = data?.sessionUuid;
        if (!sessionUuid)
            return;
        const session = this.sessions.get(sessionUuid);
        if (!session || !session.callUuid)
            return;
        // Cancel any pending updates
        const timer = this.updateQueue.get(sessionUuid);
        if (timer) {
            clearTimeout(timer);
            this.updateQueue.delete(sessionUuid);
        }
        // Build final transcript
        const transcript = session.transcript.join('\n');
        // Analyze transcript
        const analysis = dynamodb_service_1.dynamoDBService.analyzeTranscript(transcript);
        // Calculate final metrics
        const totalTokens = session.tokenUsage.inputTokens + session.tokenUsage.outputTokens;
        const cost = totalTokens * 0.0001; // Rough estimate
        // Complete the call record
        await dynamodb_service_1.dynamoDBService.completeCall(session.callUuid, {
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
    async handleVonageEvent(data) {
        if (!data?.uuid || !data?.status)
            return;
        const updates = {
            status: data.status
        };
        if (data.duration) {
            updates.duration_seconds = parseInt(data.duration);
        }
        if (data.status === 'completed' || data.status === 'failed') {
            updates.end_time = new Date().toISOString();
        }
        await dynamodb_service_1.dynamoDBService.updateCallRecord(data.uuid, updates);
        console.log(`📝 DynamoDB: Updated call status to ${data.status} for ${data.uuid}`);
    }
    /**
     * Queue transcript update with throttling
     */
    queueTranscriptUpdate(sessionUuid) {
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
                await dynamodb_service_1.dynamoDBService.updateCallRecord(session.callUuid, {
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
    info(message, data) {
        return this.log('INFO', message, data);
    }
    error(message, data) {
        return this.log('ERROR', message, data);
    }
    warn(message, data) {
        return this.log('WARN', message, data);
    }
    debug(message, data) {
        return this.log('DEBUG', message, data);
    }
}
exports.EnhancedLogger = EnhancedLogger;
// Export singleton instance
exports.enhancedLogger = new EnhancedLogger();
