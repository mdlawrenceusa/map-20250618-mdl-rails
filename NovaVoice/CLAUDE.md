# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## NovaVoice - Voice-Enabled Scheduling Assistant

NovaVoice is a Rails 8 application that provides real-time voice interactions using AWS Bedrock's Nova Sonic AI model through Vonage telephony. The app serves as "Esther," a scheduling assistant for Mike Lawrence Productions' Gospel outreach program that helps schedule 15-minute web meetings between senior pastors and Mike Lawrence.

**Key Features:**
- Outbound CRM calling to churches via Vonage Voice API
- Inbound call handling with AI-powered conversations
- Real-time bidirectional audio streaming with Nova Sonic
- TypeScript/Node.js microservice for audio processing
- Docker-based deployment on t4g.medium EC2 instance

## Development Commands

```bash
# Setup Vonage integration
./setup.sh

# Start all services with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f rails
docker-compose logs -f microservice

# Manual startup (development)
bin/rails server
cd microservice && npm run dev

# Run tests
bin/rails test
cd microservice && npm test

# Stop services
docker-compose down
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

**Key Integration Points:**
- `microservice/src/index.ts` - Main microservice handling HTTP API and WebSocket connections
- `microservice/src/vonage.ts` - Vonage Voice API integration for call management
- `microservice/src/bedrock.ts` - Nova Sonic integration using AWS Bedrock
- `app/controllers/calls_controller.rb` - Rails API for initiating outbound calls
- `app/controllers/vonage_webhooks_controller.rb` - Handles Vonage webhook events
- `app/services/microservice_client.rb` - Rails client for microservice communication

**Nova Sonic Implementation Details:**
- Uses direct HTTP/2 calls to `/model/amazon.nova-sonic-v1:0/invoke-with-bidirectional-stream`
- Implements proper AWS request signing with IAM role credentials
- Event-driven architecture handling sessionStart, audioOutput, textOutput events
- Supports true bidirectional streaming with interruption capabilities
- Fallback to text simulation when Nova Sonic is unavailable

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

## Voice Assistant Behavior

The AI assistant "Esther" is configured with a specific system prompt that:
- Only handles scheduling 15-minute meetings with Mike Lawrence
- Redirects all non-scheduling conversations back to meeting scheduling
- Maintains professional, brief responses (under 25 words)
- Operates within Gospel outreach business context

## Database Architecture

Uses SQLite3 with separate databases for scaling:
- Primary database for application data
- `solid_cache` for caching
- `solid_queue` for background jobs  
- `solid_cable` for ActionCable persistence

## Production Deployment

Configured for Docker deployment with:
- Multi-stage Dockerfiles for optimization
- Kamal deployment automation
- SSL via Let's Encrypt
- Health check endpoints at `/up`
- Asset precompilation and optimization

## Testing Voice Features

When testing Nova Sonic bidirectional streaming:
- Use modern browser with microphone permissions and HTTP/2 support
- Test WebSocket connections via browser dev tools Network tab
- Monitor ActionCable logs for audio chunk processing and stream events
- Check AWS CloudWatch for Bedrock API calls and bidirectional stream metrics
- Test Nova Sonic events: sessionStart, audioOutput, textOutput, contentEnd
- Verify audio format conversion from WebM to PCM in logs
- Test fallback behavior when Nova Sonic is unavailable
- Monitor HTTP/2 stream connections and proper cleanup on disconnect

**Audio Format Requirements:**
- Frontend: 16kHz sample rate, mono channel, optimal for Nova Sonic
- Backend: Converts WebM/Opus to PCM 16-bit for Nova Sonic compatibility
- Real-time streaming: 100ms audio chunks for low-latency interaction

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

## Common Development Patterns

- Audio chunks are processed asynchronously with proper error handling
- WebSocket subscriptions use unique session IDs for multi-user support
- Frontend JavaScript handles audio recording state management
- Service classes encapsulate AWS API interactions with proper error boundaries