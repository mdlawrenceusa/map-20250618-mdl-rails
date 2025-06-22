#!/bin/bash
echo "🚀 Starting Nova Sonic Test Server"
echo "=================================="

# Load test environment
export NODE_ENV=test
export AWS_REGION=us-east-1
export PORT=3001
export SERVER_URL=http://localhost:3001

# Start server
echo "Starting server on port 3001..."
npm start

echo ""
echo "✅ Test server running!"
echo "🧪 Test endpoints:"
echo "  Health: http://localhost:3001/health"
echo "  Webhooks: http://localhost:3001/webhooks/answer"
echo ""
echo "🔧 For Vonage testing, use ngrok:"
echo "  ngrok http 3001"
echo ""
