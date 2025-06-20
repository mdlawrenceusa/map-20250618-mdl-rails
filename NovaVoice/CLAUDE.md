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
# Cloud9 Development Setup
# Rails runs on port 8080 for Cloud9 preview
PORT=8080 bin/rails server -b 0.0.0.0

# Microservice runs on port 3000 for CloudFront/Vonage access
cd microservice && PORT=3000 npm run dev

# Docker Compose (production-like)
docker-compose up -d

# View logs
docker-compose logs -f rails
docker-compose logs -f microservice

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

## Common Development Patterns

- Audio chunks are processed asynchronously with proper error handling
- WebSocket subscriptions use unique session IDs for multi-user support
- Frontend JavaScript handles audio recording state management
- Service classes encapsulate AWS API interactions with proper error boundaries