# Vonage Integration for NovaVoice

This document describes the Vonage telephony integration for NovaVoice, enabling outbound CRM calling to churches with Amazon Nova Sonic AI handling conversations.

## Architecture Overview

The system consists of:
1. **Rails Application** - Main web application handling UI and business logic
2. **TypeScript/Node.js Microservice** - Handles Nova Sonic bidirectional audio streaming
3. **Vonage Voice API** - Manages telephony for both inbound and outbound calls
4. **Amazon Bedrock Nova Sonic** - AI model for voice conversations

## Setup Instructions

### 1. Environment Configuration

Create a `.env` file with your Vonage credentials:

```bash
# Outbound Vonage App (for CRM calling)
VONAGE_OUTBOUND_API_KEY=your_api_key
VONAGE_OUTBOUND_API_SECRET=your_api_secret
VONAGE_OUTBOUND_APPLICATION_ID=your_app_id
VONAGE_OUTBOUND_NUMBER=+1234567890

# Inbound Vonage App (for receiving calls)
VONAGE_INBOUND_API_KEY=your_api_key
VONAGE_INBOUND_API_SECRET=your_api_secret
VONAGE_INBOUND_APPLICATION_ID=your_app_id

# AWS Configuration (optional if using IAM role)
AWS_REGION=us-east-1

# Application URLs
WEBHOOK_BASE_URL=https://gospelshare.io
```

### 2. Private Keys

Place your Vonage private keys in `/home/ec2-user/keys/`:
```bash
/home/ec2-user/keys/outbound_private.key
/home/ec2-user/keys/inbound_private.key
```

Secure the keys:
```bash
chmod 600 /home/ec2-user/keys/*.key
```

### 3. Vonage Dashboard Configuration

In your Vonage dashboard, configure the webhook URLs:

**Outbound App:**
- Answer URL: `https://gospelshare.io/vonage/outbound/answer`
- Event URL: `https://gospelshare.io/vonage/outbound/events`

**Inbound App:**
- Answer URL: `https://gospelshare.io/vonage/inbound/answer`
- Event URL: `https://gospelshare.io/vonage/inbound/events`

### 4. Run Setup Script

```bash
./setup.sh
```

### 5. Start Services

```bash
docker-compose up -d
```

## API Usage

### Make an Outbound Call

```bash
curl -X POST http://localhost:3000/calls \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+12025551234",
    "prompt": "You are Esther calling to schedule a meeting with Mike Lawrence.",
    "max_tokens": 1024,
    "temperature": 0.7
  }'
```

Response:
```json
{
  "phoneNumber": "+12025551234",
  "callStatus": "started",
  "callId": "123e4567-e89b-12d3-a456-426614174000",
  "message": "Call initiated. Audio streaming will begin when call is answered."
}
```

### Check Call Status

```bash
curl http://localhost:3000/calls/123e4567-e89b-12d3-a456-426614174000
```

Response:
```json
{
  "callId": "123e4567-e89b-12d3-a456-426614174000",
  "phoneNumber": "+12025551234",
  "startTime": "2024-01-01T12:00:00Z",
  "duration": 120,
  "transcript": "Esther: Hello, this is Esther from Mike Lawrence Productions...",
  "status": "completed"
}
```

## Audio Flow

1. **Outbound Call Initiated** → Rails calls microservice `/calls` endpoint
2. **Microservice Creates Call** → Uses Vonage API to call the phone number
3. **Call Answered** → Vonage connects WebSocket to microservice
4. **Audio Streaming** → Vonage streams audio to microservice via WebSocket
5. **Nova Sonic Processing** → Microservice sends audio to Bedrock, gets AI response
6. **Response Playback** → AI audio response sent back through WebSocket to caller
7. **Call Completion** → Transcript and metadata stored

## CloudFront/WAF Configuration

Update your CloudFront distribution to support the microservice:

**Origins:**
- Rails: `your-elastic-ip:3000`
- Microservice: `your-elastic-ip:8080`

**Behaviors:**
- `/vonage/*` → Forward to Rails (port 3000)
- `/calls`, `/inbound` → Forward to microservice (port 8080)
- `/ws/*` → Forward to microservice (port 8080) with WebSocket enabled

**WAF Rules:**
- Allow Vonage IP ranges for webhook endpoints
- Rate limit `/calls` to prevent abuse

## Monitoring

Check service health:
```bash
# Rails health
curl http://localhost:3000/up

# Microservice health
curl http://localhost:8080/health
```

View logs:
```bash
# Rails logs
docker-compose logs rails

# Microservice logs
docker-compose logs microservice
```

## Security Considerations

1. **IAM Role** - Use EC2 IAM role instead of AWS credentials when possible
2. **Private Keys** - Store securely with proper file permissions
3. **Environment Variables** - Never commit `.env` file to version control
4. **HTTPS** - Always use HTTPS in production (via CloudFront)
5. **WAF** - Configure WAF rules to allow only Vonage IPs for webhooks

## Troubleshooting

### Call fails to connect
- Check Vonage webhook URLs are correctly configured
- Verify private keys are in the correct location
- Check microservice logs for connection errors

### No audio from AI
- Verify AWS credentials/IAM role has Bedrock access
- Check Nova Sonic is available in your AWS region (us-east-1)
- Review microservice logs for Bedrock API errors

### WebSocket connection fails
- Ensure CloudFront allows WebSocket connections
- Check security groups allow port 8080
- Verify WEBHOOK_BASE_URL matches your domain

## Production Checklist

- [ ] Update WEBHOOK_BASE_URL to production domain
- [ ] Configure CloudFront behaviors for all endpoints
- [ ] Set up WAF rules for Vonage IP allowlist
- [ ] Use IAM role instead of AWS credentials
- [ ] Enable CloudWatch logging
- [ ] Set up alarms for high error rates
- [ ] Test both outbound and inbound calls
- [ ] Verify SSL certificates are valid