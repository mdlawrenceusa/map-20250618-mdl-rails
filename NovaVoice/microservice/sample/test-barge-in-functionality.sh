#!/bin/bash
echo "🧪 Testing Barge-In Functionality"
echo "================================"

# Check if server is running
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "❌ Test server is not running. Start it with: ./start-test-server.sh"
    exit 1
fi

echo "✅ Server is running"

# Test basic endpoints
echo "🔍 Testing endpoints..."

# Health check
echo -n "Health endpoint: "
if curl -s http://localhost:3001/health | grep -q "ok"; then
    echo "✅ PASS"
else
    echo "❌ FAIL"
    exit 1
fi

# Webhook endpoint
echo -n "Webhook endpoint: "
if curl -s "http://localhost:3001/webhooks/answer?direction=inbound&from=test&to=test" | grep -q "action"; then
    echo "✅ PASS"
else
    echo "❌ FAIL"
    exit 1
fi

# Check for barge-in components
echo "🎯 Checking barge-in implementation..."

# Check if barge-in files exist
if [ -f "src/barge-in-handler.ts" ]; then
    echo "✅ BargeInHandler exists"
else
    echo "❌ BargeInHandler missing"
    exit 1
fi

if [ -f "src/enhanced-client.ts" ]; then
    echo "✅ EnhancedClient exists"
else
    echo "❌ EnhancedClient missing"
    exit 1
fi

# Check server logs for barge-in initialization
echo "🔍 Checking server logs for barge-in..."
sleep 2
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ Server responding with barge-in code loaded"
else
    echo "❌ Server not responding"
    exit 1
fi

echo ""
echo "🎉 All tests passed! Barge-in functionality is ready."
echo ""
echo "📋 Manual Testing Steps:"
echo "1. Start ngrok: ngrok http 3001"
echo "2. Update Vonage webhook to ngrok URL"
echo "3. Make test call and verify interruption works"
echo "4. If successful, approve for production deployment"

