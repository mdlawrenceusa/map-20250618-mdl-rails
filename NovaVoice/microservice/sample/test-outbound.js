#!/usr/bin/env node

/**
 * Simple test script for outbound calling API endpoints
 * Usage: node test-outbound.js
 */

const baseUrl = 'http://localhost:3001';

async function testEndpoints() {
  console.log('🧪 Testing Outbound Call API Endpoints');
  console.log('=====================================\n');

  // Test health endpoint
  try {
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData.status);
    console.log();
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
    console.log('   Make sure the server is running: npm run dev');
    return;
  }

  // Test simple call endpoint (without actual call)
  try {
    console.log('2. Testing simple call endpoint...');
    const callResponse = await fetch(`${baseUrl}/call/simple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: '+1234567890',
        message: 'This is a test call from Nova Sonic'
      })
    });

    const callData = await callResponse.json();
    
    if (callResponse.ok) {
      console.log('✅ Simple call endpoint working');
      console.log('   Response:', callData);
    } else {
      console.log('⚠️  Call endpoint responded with error (expected without Vonage config):');
      console.log('   Status:', callResponse.status);
      console.log('   Error:', callData.error);
      if (callData.error.includes('not configured')) {
        console.log('   This is expected - you need to configure Vonage credentials');
      }
    }
    console.log();
  } catch (error) {
    console.log('❌ Simple call test failed:', error.message);
    console.log();
  }

  // Test AI call endpoint
  try {
    console.log('3. Testing AI call endpoint...');
    const aiCallResponse = await fetch(`${baseUrl}/call/ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: '+1234567890',
        initialMessage: 'Hello, I am an AI assistant'
      })
    });

    const aiCallData = await aiCallResponse.json();
    
    if (aiCallResponse.ok) {
      console.log('✅ AI call endpoint working');
      console.log('   Response:', aiCallData);
    } else {
      console.log('⚠️  AI call endpoint responded with error (expected without Vonage config):');
      console.log('   Status:', aiCallResponse.status);
      console.log('   Error:', aiCallData.error);
      if (aiCallData.error.includes('not configured')) {
        console.log('   This is expected - you need to configure Vonage credentials');
      }
    }
    console.log();
  } catch (error) {
    console.log('❌ AI call test failed:', error.message);
    console.log();
  }

  // Test active calls endpoint
  try {
    console.log('4. Testing active calls endpoint...');
    const activeResponse = await fetch(`${baseUrl}/calls/active`);
    const activeData = await activeResponse.json();
    console.log('✅ Active calls endpoint working');
    console.log('   Active calls:', activeData.activeCalls.length);
    console.log();
  } catch (error) {
    console.log('❌ Active calls test failed:', error.message);
    console.log();
  }

  console.log('🎉 API endpoint testing complete!');
  console.log('\nNext steps:');
  console.log('1. Configure Vonage credentials to enable actual calling');
  console.log('2. Use the /call/simple and /call/ai endpoints to make outbound calls');
  console.log('3. Monitor active calls with /calls/active');
}

// Only run if this file is executed directly
if (require.main === module) {
  testEndpoints().catch(console.error);
}

module.exports = { testEndpoints };