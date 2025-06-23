# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## NovaVoice - Voice-Enabled Scheduling Assistant

NovaVoice is a Rails 8 application that provides real-time voice interactions using AWS Bedrock's Nova Sonic AI model through Vonage telephony. The app serves as "Esther," a scheduling assistant for Mike Lawrence Productions' Gospel outreach program that helps schedule 15-minute web meetings between senior pastors and Mike Lawrence.

**Key Features:**
- Outbound CRM calling to churches via Vonage Voice API
- Inbound call handling with AI-powered conversations
- Real-time bidirectional audio streaming with Nova Sonic
- TypeScript/Node.js microservice for audio processing
- **JSON transcript logging with simultaneous DynamoDB storage**
- **Complete conversation analytics and call tracking**
- Docker-based deployment on t4g.medium EC2 instance

## Development Commands

```bash
# Cloud9 Development Setup
# Rails runs on port 8080 for Cloud9 preview
PORT=8080 bin/rails server -b 0.0.0.0

# Working Nova Sonic Microservice (REQUIRED for voice features)
cd microservice/sample
AWS_REGION=us-east-1 PORT=3000 npm run dev

# Legacy microservice (not functional)
cd microservice && PORT=3000 npm run dev

# Docker Compose (production-like)
docker-compose up -d

# View logs
docker-compose logs -f rails
docker-compose logs -f microservice
tail -f microservice/sample/server-transcript-test.log

# Run tests
bin/rails test
cd microservice && npm test

# Test transcript system
cd microservice/sample
npx ts-node src/check-dynamodb.ts           # Verify DynamoDB table
npx ts-node src/check-transcript-db.ts      # Check specific call record
ls -la transcripts/                         # View transcript files

# Stop services
docker-compose down
pkill -f "ts-node"
```

## Architecture Overview

**Vonage Telephony Integration:**
1. Rails app initiates outbound calls or receives inbound call webhooks
2. Vonage Voice API manages telephony and audio streaming
3. TypeScript/Node.js microservice handles WebSocket audio from Vonage
4. Microservice processes audio with Nova Sonic via Bedrock API
5. AI responses stream back through WebSocket to caller
6. Call transcripts and metadata tracked throughout conversation

**Real-time Bidirectional Audio Streaming Pipeline:**
1. Vonage captures telephony audio (16kHz PCM mono)
2. Audio streams via WebSocket to microservice on port 8080
3. Microservice forwards audio to Nova Sonic using `invoke_model_with_response_stream`
4. Nova Sonic AI processes audio and returns speech responses
5. Audio responses stream back through WebSocket to Vonage
6. Vonage plays AI audio to the caller in real-time

**Key Integration Points (Working Sample):**
- `microservice/sample/src/server.ts` - Main server with WebSocket and Nova Sonic integration
- `microservice/sample/src/client.ts` - Nova Sonic bidirectional stream client
- `microservice/sample/src/telephony/vonage.ts` - Vonage webhook handlers and audio processing
- `microservice/sample/src/telephony/outbound.ts` - Outbound call management
- `microservice/sample/src/types.ts` - TypeScript interfaces and types
- `microservice/sample/src/barge-in-handler.ts` - Real-time interruption detection
- `microservice/sample/src/simple-transcript-logger-minimal.ts` - Call transcription

**Legacy Integration Points (Not Functional):**
- `microservice/src/index.ts` - Old microservice (replaced by sample)
- `app/controllers/calls_controller.rb` - Rails API for initiating outbound calls
- `app/controllers/vonage_webhooks_controller.rb` - Handles Vonage webhook events
- `app/services/microservice_client.rb` - Rails client for microservice communication

**Nova Sonic Implementation Details:**
- Uses direct HTTP/2 calls to `/model/amazon.nova-sonic-v1:0/invoke-with-bidirectional-stream`
- Implements proper AWS request signing with IAM role credentials using `fromNodeProviderChain()`
- Event-driven architecture handling sessionStart, audioOutput, textOutput, contentStart/End events
- Queue-based async iterator using RxJS for proper event sequencing
- Supports true bidirectional streaming with real-time interruption capabilities
- Comprehensive barge-in detection and handling
- Automatic session cleanup with timeout management
- Real-time transcript logging for both Human and Assistant speech

**Transcript Logging System:**
- **Dual Storage**: Simultaneous JSON file and DynamoDB writes for every call
- **Real-time Capture**: Human and Assistant speech logged as it happens during conversation
- **File Format**: Markdown files in `/microservice/sample/transcripts/` directory
- **File Naming**: `call-{UUID}-{timestamp}.md` with complete conversation history
- **DynamoDB Table**: `nova-sonic-call-records` with full metadata and searchable transcripts
- **Session Management**: Automatic `startCall()` when sessions begin, `endCall()` when completed
- **Call Analytics**: Duration, timestamps, participant tracking, and conversation flow analysis
- **Data Structure**: Call UUID, phone number, start/end times, full transcript, completion status
- **Production Ready**: Tested with both inbound and outbound calls, handles interruptions and barge-in

## AWS Configuration

The application uses AWS Cloud9 IAM role-based authentication (no hardcoded credentials). The `NovaSonicService` includes:
- Direct HTTP/2 bidirectional streaming to Bedrock endpoints
- AWS request signing using Sigv4 for authentication
- Automatic AWS region detection from environment variables
- Comprehensive error handling for Bedrock-specific errors
- Development mode fallback simulation when Nova Sonic is unavailable
- Thread-safe bidirectional stream management with proper cleanup

**IAM Role Configuration:**
- Uses dedicated role: `NovaVoice-NovaSonic-Role` (ARN: `arn:aws:iam::302296110959:role/NovaVoice-NovaSonic-Role`)
- Minimal permissions: only what's needed for Nova Sonic
- Automatic role assumption with fallback to shared credentials
- Override with `NOVA_SONIC_ROLE_ARN` environment variable

**Required Permissions:**
- `bedrock:InvokeModel` - Nova Sonic model invocation
- `bedrock:InvokeModelWithResponseStream` - Streaming responses  
- `bedrock:ListFoundationModels` - Model discovery
- `bedrock:GetFoundationModel` - Model metadata
- `dynamodb:PutItem` - Create new call records
- `dynamodb:UpdateItem` - Update call transcripts and metadata
- `dynamodb:GetItem` - Retrieve call records for analytics

## Voice Assistant Behavior

The AI assistant "Esther" is configured with a specific system prompt that:
- Only handles scheduling 15-minute meetings with Mike Lawrence
- Redirects all non-scheduling conversations back to meeting scheduling
- Maintains professional, brief responses (under 25 words)
- Operates within Gospel outreach business context

## Database Architecture

**Rails Application Storage (SQLite3):**
- Primary database for application data
- `solid_cache` for caching
- `solid_queue` for background jobs  
- `solid_cable` for ActionCable persistence

**Lead Storage (AWS DynamoDB):**
- **Table**: `Churches` with phone number as primary key
- **Purpose**: Central lead data storage for Nova Sonic calling system
- **Integration**: Phone number links Rails leads to DynamoDB records
- **GSI**: lead_status-index, owner_alias-index for efficient queries
- **Schema**: Comprehensive lead data with call tracking fields
- **ETL Pipeline**: CDK-based Glue/Lambda pipeline for data loading

**Call Analytics Storage (AWS DynamoDB):**
- **Table**: `nova-sonic-call-records` with call UUID as primary key
- **Real-time Transcript Storage**: Complete conversation capture with timestamps
- **Call Metadata**: Duration, phone numbers, start/end times, completion status
- **Searchable Content**: Full transcript text for analytics and reporting
- **Billing Mode**: Pay-per-request for cost optimization during development
- **Schema**: Flexible JSON structure supporting future analytics features

## Production Infrastructure

**CloudFront Configuration (Microservice Only):**
- **Distribution ID**: EB6EO1Q0TFWQ5
- **Domain**: gospelshare.io, www.gospelshare.io (for Vonage webhooks)
- **SSL Certificate**: ACM certificate arn:aws:acm:us-east-1:302296110959:certificate/69a168d3-0d03-4f46-b85c-7e237b763991
- **Origin**: Microservice only - ec2-54-208-194-221.compute-1.amazonaws.com:3000 (HTTP only)
- **Cache Behaviors**:
  - `/webhooks/*` → Microservice (for Vonage webhooks)
  - `/ws/*` → Microservice (for WebSocket connections)
  - All other paths → Microservice
- **Note**: Rails app (port 8080) is NOT exposed through CloudFront - only accessible via Cloud9 preview

**WAF Protection:**
- **Web ACL**: NovaSenicGospelShareWAF (ID: 0b2c7664-0b04-4e48-999f-be8f735b508d)
- **Rules**: Vonage IP whitelist, rate limiting (2000 req/5min), AWS managed rules
- **Default Action**: Allow (for development access)

**Route 53 DNS:**
- **Hosted Zone**: Z075223437JLVVBIVE60G
- **A Records**: gospelshare.io and www.gospelshare.io → CloudFront distribution
- **Validation**: ACM certificate validation records

**Cloud9 Security Groups:**
- **Group ID**: sg-0ac41270e9c4d0565
- **Ports**: 
  - 22 (SSH) - restricted to Cloud9 IP ranges
  - 3000 (Microservice) - open to 0.0.0.0/0 for CloudFront/Vonage
  - 80, 443 - open for HTTP/HTTPS traffic
- **Note**: Port 8080 (Rails) doesn't need external access - only Cloud9 preview

**Vonage Configuration:**
- **API Key**: 7f45e88f
- **Outbound Number**: +12135235735 (App ID: 891be877-9a63-45e1-bdd3-f66d74f206a0)
- **Inbound Number**: +12135235700 (App ID: f7fb73da-1cfb-4376-a701-b71c4672f30d)
- **Webhook URLs**: https://gospelshare.io/webhooks/* and /outbound/webhooks/*
- **Private Key**: Stored securely in /home/ec2-user/keys/vonage_private.key

**Deployment:**
- Multi-stage Dockerfiles for optimization
- Kamal deployment automation available
- Health check endpoints at `/up`
- Asset precompilation and optimization

## Testing Voice Features

**Local Development Testing:**
- Rails server: `http://localhost:8080` (bound to 0.0.0.0:8080 for Cloud9 preview)
- Microservice: `http://localhost:3000` (bound to 0.0.0.0:3000 for CloudFront access)
- Health checks: `curl http://localhost:8080/up` (Rails) and `curl http://localhost:3000/health` (Microservice)
- Cloud9 Preview: Click "Preview Running Application" to view Rails app

**Vonage Webhook Testing:**
- Inbound webhooks: `POST https://gospelshare.io/webhooks/answer` and `/webhooks/events`
- Outbound webhooks: `POST https://gospelshare.io/outbound/webhooks/answer` and `/outbound/webhooks/events`
- WebSocket audio: `wss://gospelshare.io/ws/` (handled by microservice)

**CloudFront Testing:**
- Note: In Cloud9 development environment, direct external access may be limited
- CloudFront routes requests to appropriate origins based on path patterns
- SSL termination handled by CloudFront with ACM certificate
- WAF provides basic protection while allowing development access

**Nova Sonic Testing:**
- Monitor AWS CloudWatch for Bedrock API calls and bidirectional stream metrics
- Test Nova Sonic events: sessionStart, audioOutput, textOutput, contentEnd
- Verify audio format conversion from Vonage WebM to PCM for Nova Sonic
- Test fallback behavior when Nova Sonic is unavailable
- Monitor HTTP/2 stream connections and proper cleanup on disconnect

**Transcript System Testing:**
- Test both inbound and outbound call transcript capture
- Verify JSON files created in `/microservice/sample/transcripts/` directory
- Confirm DynamoDB records in `nova-sonic-call-records` table
- Check real-time logging: `📝 Added [Human/Assistant]: text...` in server logs
- Validate complete call lifecycle: startCall() → real-time capture → endCall()
- Test utilities: `npx ts-node src/check-dynamodb.ts` and `npx ts-node src/check-transcript-db.ts`

**Audio Format Requirements:**
- Vonage: 16kHz sample rate, mono channel, L16 PCM format
- Nova Sonic: 16-bit PCM format for bidirectional streaming
- Real-time streaming: Low-latency audio processing with WebSocket transport

**Troubleshooting:**
- Check security group rules if external access fails (sg-0ac41270e9c4d0565)
- Verify CloudFront origin configuration matches running service ports
- Monitor Rails and microservice logs for webhook processing errors
- Check Vonage application configuration in dashboard matches webhook URLs

## Available AWS MCP Tools

This Cloud9 environment has access to the following AWS MCP (Model Context Protocol) servers that can enhance development workflows:

### Core AWS Services
- **awslabs.core-mcp-server** - Core AWS service interactions and resource management
- **awslabs.aws-documentation-mcp-server** - Access to AWS documentation and best practices
- **awslabs.cost-analysis-mcp-server** - AWS cost analysis and optimization recommendations
- **awslabs.cloudwatch-logs-mcp-server** - CloudWatch logs querying and analysis

### Infrastructure & Deployment
- **awslabs.cdk-mcp-server** - AWS CDK infrastructure as code support
- **awslabs.terraform-mcp-server** - Terraform configuration and deployment assistance
- **awslabs.aws-diagram-mcp-server** - AWS architecture diagram generation
- **awslabs.eks-mcp-server** - Amazon EKS cluster management and troubleshooting

### Database & Storage
- **awslabs.dynamodb-mcp-server** - DynamoDB table operations and queries
- **awslabs.aurora-dsql-mcp-server** - Aurora DSQL database interactions
- **awslabs.bedrock-kb-retrieval-mcp-server** - Bedrock Knowledge Base retrieval

### Compute & AI
- **awslabs.lambda-tool-mcp-server** - AWS Lambda function management and deployment
- **awslabs.nova-canvas-mcp-server** - Amazon Nova Canvas image generation (relevant for this voice app)

### Development Tools
- **awslabs.frontend-mcp-server** - Frontend development assistance
- **awslabs.git-repo-research-mcp-server** - Git repository analysis and insights

These MCP tools are pre-configured and can be accessed to enhance development, debugging, and deployment tasks for the NovaVoice application.

## Detailed System Architecture

### Core Classes and Components (Working Sample)

#### 1. NovaSonicBidirectionalStreamClient (`microservice/sample/src/client.ts`)
**Purpose**: Main client for AWS Bedrock Nova Sonic bidirectional streaming
**Key Features**:
- Queue-based async iterator using RxJS Subject for event management
- Proper AWS IAM role authentication with `fromNodeProviderChain()`
- HTTP/2 streaming to `/model/amazon.nova-sonic-v1:0/invoke-with-bidirectional-stream`
- Session lifecycle management with automatic cleanup
- Real-time audio chunk processing with 640-byte buffers

**Critical Methods**:
```typescript
async initiateSession(sessionId: string): Promise<void>
async streamAudioChunk(sessionId: string, audioChunk: Buffer): Promise<void>
createStreamSession(sessionId: string): Session
closeSession(sessionId: string): Promise<void>
getActiveSessions(): string[]
```

**Event Handling**:
- `sessionStart`, `audioOutput`, `textOutput`, `contentStart/End`
- `usageEvent`, `completionStart/End`, `error` events
- Queue-based event sequencing ensures proper Nova Sonic protocol compliance

#### 2. StreamSession (`microservice/sample/src/client.ts`)
**Purpose**: Individual session wrapper for Nova Sonic conversations
**Key Features**:
- Event emission using Node.js EventEmitter pattern
- Audio buffering and queue management
- System prompt setup and audio content lifecycle

**Critical Methods**:
```typescript
async setupPromptStart(): Promise<void>
async setupSystemPrompt(role?: string, prompt?: string): Promise<void>
async setupStartAudio(): Promise<void>
async streamAudio(audioBuffer: Buffer): Promise<void>
async endAudioContent(): Promise<void>
async endPrompt(): Promise<void>
async close(): Promise<void>
```

#### 3. VonageIntegration (`microservice/sample/src/telephony/vonage.ts`)
**Purpose**: Handles Vonage Voice API webhooks and audio processing
**Key Features**:
- Webhook endpoint routing for both inbound/outbound calls
- NCCO (Network Call Control Objects) generation
- Real-time audio processing with barge-in detection
- Channel-based WebSocket URI generation

**Webhook Endpoints**:
- `GET /webhooks/answer` - Inbound call handling
- `POST /webhooks/events` - Call event processing
- `GET /outbound/webhooks/answer` - Outbound call handling
- `POST /outbound/webhooks/events` - Outbound event processing

**NCCO Response Structure**:
```json
[
  {
    "action": "talk",
    "text": "Hello, this is Esther from Mike Lawrence Productions..."
  },
  {
    "action": "connect",
    "from": "Esther - Mike Lawrence Productions",
    "endpoint": [{
      "type": "websocket",
      "uri": "wss://gospelshare.io/socket?channel={uuid}",
      "content-type": "audio/l16;rate=16000"
    }]
  }
]
```

#### 4. BargeInHandler (`microservice/sample/src/barge-in-handler.ts`)
**Purpose**: Real-time interruption detection during AI speech
**Key Features**:
- Audio level analysis for human speech detection
- AI speaking state tracking
- Interruption threshold management

#### 5. OutboundCallManager (`microservice/sample/src/telephony/outbound.ts`)
**Purpose**: Manages outbound calling capabilities
**Key Features**:
- Vonage API integration for initiating calls
- Call state tracking and event handling
- Support for both simple TTS and AI-powered calls

### API Interfaces

#### WebSocket Audio Streaming API
**Endpoint**: `wss://gospelshare.io/socket?channel={uuid}`
**Protocol**: L16 PCM audio at 16kHz sample rate
**Message Types**:
```typescript
// Control Messages (JSON)
{
  type: "promptStart" | "systemPrompt" | "audioStart" | "stopAudio",
  data?: string
}

// Audio Messages (Binary)
Buffer // 640-byte PCM audio chunks

// Response Messages (JSON)
{
  event: {
    audioOutput: { content: string }, // base64 encoded audio
    textOutput: { content: string, role: string },
    contentStart: {},
    contentEnd: {},
    error: { message: string }
  }
}
```

#### REST API Endpoints

**Health Check**:
```
GET /health
Response: { status: "ok", timestamp: "2025-06-22T20:35:32.704Z" }
```

**Call Management**:
```
POST /call/simple
Body: { to: "+1234567890", message: "TTS message" }
Response: { success: true, callId: "uuid", status: "initiated" }

POST /call/ai  
Body: { to: "+1234567890", initialMessage?: "greeting", systemPrompt?: "custom prompt" }
Response: { success: true, callId: "uuid", status: "initiated" }

GET /calls/active
Response: { activeCalls: [{ id: "uuid", status: "active", duration: 30 }] }
```

**Configuration**:
```
POST /configure
Body: { apiKey: "key", apiSecret: "secret", applicationId?: "id", privateKey?: "pem", fromNumber?: "+1234567890" }
Response: { success: true, configured: true }

GET /configure
Response: { configured: true }
```

**Channel Management**:
```
GET /channels
Response: { 
  channels: [
    { id: "uuid", clientCount: 1, active: true }
  ]
}
```

### Audio Pipeline Architecture

**1. Vonage → WebSocket → Nova Sonic Flow**:
```
Telephone Call (PSTN)
↓ (16kHz L16 PCM)
Vonage Voice API
↓ (WebSocket Binary Frames)
CloudFront (gospelshare.io)
↓ (WSS Connection)
Express.js WebSocket Handler (/socket?channel=uuid)
↓ (Buffer chunks)
VonageIntegration.processAudioData()
↓ (640-byte chunks)
StreamSession.streamAudio()
↓ (HTTP/2 Stream)
Nova Sonic Bedrock API
```

**2. Nova Sonic → WebSocket → Vonage Flow**:
```
Nova Sonic Bedrock API
↓ (audioOutput events)
StreamSession Event Emitter
↓ (base64 decoded PCM)
WebSocket.send() (binary frames)
↓ (WSS Connection)
CloudFront
↓ (WebSocket frames)
Vonage Voice API
↓ (L16 PCM audio)
Telephone Call (PSTN)
```

### Lessons Learned

#### 1. AWS Credentials Configuration
**Problem**: Initial attempts used `fromEnv()` credential provider, causing "Unable to find environment variable credentials" errors
**Solution**: Switch to `fromNodeProviderChain()` which properly uses EC2 instance profile
**Key Learning**: Cloud9 environments require explicit AWS_REGION environment variable even with IAM roles

```typescript
// ❌ Failed approach
credentials: fromEnv()

// ✅ Working approach  
credentials: fromNodeProviderChain()
// With: AWS_REGION=us-east-1 PORT=3000 npm run dev
```

#### 2. Nova Sonic Event Sequencing
**Problem**: Nova Sonic rejected sessions due to improperly sequenced events
**Solution**: Implement queue-based async iterator with RxJS for proper event ordering
**Key Learning**: Nova Sonic requires strict event protocol compliance

**Critical Event Sequence**:
1. `promptStart` event
2. `textInput` event (system prompt)  
3. `startAudioContent` event
4. Audio streaming begins
5. Proper cleanup with `endAudioContent` and `endPrompt`

#### 3. WebSocket Channel Management
**Problem**: Multiple clients connecting to same session caused conflicts
**Solution**: Channel-based isolation with UUID-based session management
**Key Learning**: Each call needs isolated WebSocket channel with cleanup

#### 4. CloudFront WebSocket Configuration
**Problem**: Calls hung up after TTS due to failed WebSocket connections
**Solution**: Proper CloudFront origin configuration for WebSocket upgrades
**Key Learning**: WebSocket URIs must include channel parameter for proper routing

#### 5. Audio Format Compatibility
**Problem**: Audio format mismatches between Vonage and Nova Sonic
**Solution**: Standardize on 16kHz L16 PCM throughout pipeline
**Key Learning**: Audio format consistency critical for real-time streaming

#### 6. Barge-in Detection Implementation
**Problem**: Users couldn't interrupt AI speech naturally
**Solution**: Real-time audio level analysis with AI speaking state tracking
**Key Learning**: Interruption detection requires both audio analysis and conversation state

#### 7. Session Lifecycle Management
**Problem**: Memory leaks from unclosed Nova Sonic sessions
**Solution**: Comprehensive cleanup with timeout management and force-close capabilities
**Key Learning**: Always implement graceful degradation for session cleanup

#### 8. Production Debugging Strategy
**Problem**: Limited visibility into production voice call issues
**Solution**: Comprehensive logging with transcript capture and event tracing
**Key Learning**: Voice applications require extensive real-time logging for debugging

### Performance Optimizations

1. **Audio Chunk Size**: 640-byte chunks (320 samples) optimize for real-time latency
2. **Session Cleanup**: 5-minute timeout with 1-minute interval checks prevent resource leaks
3. **WebSocket Management**: Channel-based isolation enables concurrent calls
4. **Event Queue**: RxJS-based queue prevents Nova Sonic event sequence errors
5. **Error Boundaries**: Comprehensive try-catch with fallback behaviors

### Security Considerations

1. **IAM Role Isolation**: Dedicated NovaVoice-NovaSonic-Role with minimal permissions
2. **CloudFront Protection**: WAF rules with Vonage IP whitelisting  
3. **No Credential Storage**: Environment-based credentials only
4. **WebSocket Validation**: Channel-based access control
5. **Call Recording Compliance**: Transcript logging with proper data handling

## Common Development Patterns

- Audio chunks are processed asynchronously with proper error handling
- WebSocket subscriptions use unique session IDs for multi-user support
- Frontend JavaScript handles audio recording state management
- Service classes encapsulate AWS API interactions with proper error boundaries
- Event-driven architecture with comprehensive error boundaries and cleanup
- Queue-based event sequencing for reliable AWS Bedrock integration
- Channel-based isolation for concurrent voice call handling
- **Real-time transcript capture with dual storage (files + DynamoDB)**
- **Automatic session lifecycle management for call analytics**

## Current System Status

**✅ Fully Operational Components:**
- Nova Sonic bidirectional streaming with AWS Bedrock
- Vonage Voice API integration (inbound + outbound calls)
- Real-time transcript logging with JSON files and DynamoDB storage
- Esther AI assistant with church outreach scheduling prompt
- Barge-in detection and conversation flow management
- Complete call analytics and conversation tracking

**🚀 Production Ready Features:**
- JSON transcript files: `/microservice/sample/transcripts/call-{UUID}-{timestamp}.md`
- DynamoDB records: `nova-sonic-call-records` table with searchable content
- Call analytics: Duration, timestamps, participant tracking, completion status
- Tested with multiple successful voice conversations and data capture

**📋 Ready for Rails Integration:**
- Phone number placeholder ("pending-from-rails") ready for actual phone numbers
- Complete transcript and analytics system ready for CRM integration
- All voice features operational and tested with real Nova Sonic conversations

## Lead Data ETL Pipeline

**Architecture**: CDK-based serverless ETL pipeline for processing church leads

### ETL Components:
1. **AWS Glue Job**: Parses `leads.txt` from S3 → structured JSON
2. **DynamoDB Loader Lambda**: Batch loads data into Churches table
3. **Rails Seeds Generator Lambda**: Creates `seeds.rb` for Rails import
4. **Data Validator Lambda**: Ensures data quality and consistency
5. **Step Functions**: Orchestrates workflow with error handling
6. **SNS Notifications**: Alerts on completion/failure

### Data Flow:
```
S3 (leads.txt) → Glue ETL → JSON → Lambda → DynamoDB (Churches table)
                                 ↓
                           Rails seeds.rb file
```

### Phone Number as Unique Identifier:
- **Normalization**: All phone numbers converted to `+1 (XXX) XXX-XXXX` format
- **Primary Key**: Phone serves as DynamoDB partition key
- **Rails Integration**: Phone number links Rails Lead records to DynamoDB
- **Nova Sonic Integration**: Calling app uses phone to fetch lead context

### DynamoDB Lead Schema:
```json
{
  "phone": "+1 (516) 938-0383",    // Primary Key
  "name": "Jong Hoon Kim",
  "company": "Yale Presbyterian Church in New York",
  "email": "jongjoy04@yahoo.com",
  "website": "http://example.com",
  "state_province": "NY",
  "lead_source": "web",
  "lead_status": "Open - Not Contacted",
  "created_date": "2018-09-02T23:20:00.000Z",
  "owner_alias": "MDL",
  "unread_by_owner": false,
  "call_transcript": "",            // Updated by Nova Sonic after calls
  "last_call_date": "",             // Updated by Nova Sonic after calls
  "call_status": "not_called"       // not_called, called, scheduled, follow_up_needed
}
```

### Integration Pattern:
1. Rails app provides phone number to calling system
2. Nova Sonic queries DynamoDB by phone to get full lead context
3. AI uses lead data for personalized conversations
4. Call results update DynamoDB record
5. Rails can query updated lead status via phone number

### ETL Pipeline Location:
- **CDK Stack**: `/etl-pipeline/` directory
- **Deployment**: `cd etl-pipeline && npm run deploy`
- **Monitoring**: CloudWatch dashboard `leads-etl-pipeline-dashboard`