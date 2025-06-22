#!/usr/bin/env node

/**
 * Comprehensive Vonage Authentication Debugging
 */

const { Voice } = require('@vonage/voice');
const { Auth } = require('@vonage/auth');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');

async function comprehensiveAuthTest() {
  console.log('🔍 COMPREHENSIVE VONAGE AUTHENTICATION DEBUG');
  console.log('===========================================\n');

  const credentials = {
    apiKey: "7f45e88f",
    apiSecret: "zGq4BMH8HQFKzpfe",
    applicationId: "f7fb73da-1cfb-4376-a701-b71c4672f30d"
  };

  console.log('📋 Testing with credentials:');
  console.log('   API Key:', credentials.apiKey);
  console.log('   API Secret:', credentials.apiSecret.substring(0, 4) + '...');
  console.log('   Application ID:', credentials.applicationId);
  console.log();

  // Test 1: Private key loading and validation
  console.log('1️⃣ TESTING PRIVATE KEY LOADING');
  console.log('==============================');
  
  let privateKey;
  try {
    privateKey = fs.readFileSync('/home/ec2-user/environment/nova-telephony-poc/vonage-private-key.pem', 'utf8');
    console.log('✅ Private key loaded successfully');
    console.log('   Key length:', privateKey.length, 'characters');
    console.log('   Starts with:', privateKey.substring(0, 27));
    console.log('   Ends with:', privateKey.substring(privateKey.length - 27));
    
    // Validate key format
    if (privateKey.includes('BEGIN PRIVATE KEY') && privateKey.includes('END PRIVATE KEY')) {
      console.log('✅ Private key format appears valid');
    } else {
      console.log('❌ Private key format may be invalid');
    }
  } catch (error) {
    console.log('❌ Private key loading failed:', error.message);
    return;
  }

  // Test 2: JWT Creation
  console.log('\n2️⃣ TESTING JWT CREATION');
  console.log('=======================');
  
  try {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now,
      exp: now + 3600,
      jti: require('crypto').randomUUID(),
      iss: credentials.apiKey,
      sub: credentials.applicationId
    };
    
    console.log('JWT payload:', JSON.stringify(payload, null, 2));
    
    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    console.log('✅ JWT created successfully');
    console.log('   Token length:', token.length);
    console.log('   First 50 chars:', token.substring(0, 50) + '...');
    
    // Verify JWT can be decoded (without verification)
    const decoded = jwt.decode(token, { complete: true });
    console.log('✅ JWT decode test passed');
    console.log('   Algorithm:', decoded.header.alg);
    console.log('   Issuer:', decoded.payload.iss);
    console.log('   Subject:', decoded.payload.sub);
    
  } catch (jwtError) {
    console.log('❌ JWT creation failed:', jwtError.message);
    return;
  }

  // Test 3: Auth object creation
  console.log('\n3️⃣ TESTING AUTH OBJECT CREATION');
  console.log('==============================');
  
  let auth;
  try {
    auth = new Auth({
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      applicationId: credentials.applicationId,
      privateKey: privateKey
    });
    console.log('✅ Auth object created successfully');
  } catch (authError) {
    console.log('❌ Auth object creation failed:', authError.message);
    return;
  }

  // Test 4: Voice API object creation
  console.log('\n4️⃣ TESTING VOICE API CREATION');
  console.log('============================');
  
  let voice;
  try {
    voice = new Voice(auth);
    console.log('✅ Voice API object created successfully');
    console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(voice)).filter(m => !m.startsWith('_')));
  } catch (voiceError) {
    console.log('❌ Voice API creation failed:', voiceError.message);
    return;
  }

  // Test 5: Simple API call (get application info)
  console.log('\n5️⃣ TESTING SIMPLE API CONNECTIVITY');
  console.log('=================================');
  
  try {
    // Use direct REST API call to test authentication
    const now = Math.floor(Date.now() / 1000);
    const testPayload = {
      iat: now,
      exp: now + 3600,
      jti: require('crypto').randomUUID(),
      iss: credentials.apiKey,
      sub: credentials.applicationId
    };
    
    const testToken = jwt.sign(testPayload, privateKey, { algorithm: 'RS256' });
    
    console.log('Testing authentication with direct API call...');
    
    const response = await axios.get(`https://api.nexmo.com/v2/applications/${credentials.applicationId}`, {
      headers: {
        'Authorization': `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ API authentication successful!');
    console.log('   Application name:', response.data.name);
    console.log('   Capabilities:', Object.keys(response.data.capabilities || {}));
    
  } catch (apiError) {
    console.log('❌ API authentication failed:');
    console.log('   Status:', apiError.response?.status);
    console.log('   Error:', apiError.response?.data || apiError.message);
    
    if (apiError.response?.status === 401) {
      console.log('\n💡 401 Error Analysis:');
      console.log('   - Private key may not match Application ID');
      console.log('   - API Key may not have access to this Application');
      console.log('   - Application may not exist or be configured properly');
    }
  }

  // Test 6: Alternative basic auth approach
  console.log('\n6️⃣ TESTING BASIC AUTH APPROACH');
  console.log('=============================');
  
  try {
    console.log('Testing with API Key + Secret only...');
    
    // Test account balance with basic auth
    const balanceResponse = await axios.get('https://rest.nexmo.com/account/get-balance', {
      params: {
        api_key: credentials.apiKey,
        api_secret: credentials.apiSecret
      }
    });
    
    console.log('✅ Basic auth successful!');
    console.log('   Account balance:', balanceResponse.data.value, balanceResponse.data.currency);
    
  } catch (basicError) {
    console.log('❌ Basic auth failed:', basicError.response?.data || basicError.message);
  }

  // Test 7: Simple voice call with debugging
  console.log('\n7️⃣ TESTING SIMPLE VOICE CALL');
  console.log('===========================');
  
  try {
    console.log('Attempting simple voice call...');
    
    const callRequest = {
      to: [{
        type: 'phone',
        number: '+13472005533'
      }],
      from: {
        type: 'phone',
        number: 'Nova Test'
      },
      ncco: [
        {
          action: "talk",
          text: "Hello, this is a test call from Nova Sonic to verify authentication is working.",
          voiceName: "Amy"
        }
      ]
    };
    
    console.log('Call request:', JSON.stringify(callRequest, null, 2));
    
    const result = await voice.createOutboundCall(callRequest);
    
    console.log('🎉 VOICE CALL SUCCESSFUL!');
    console.log('   Call ID:', result.uuid);
    console.log('   Status:', result.status);
    console.log('   📞 Phone should be ringing at +13472005533');
    
    return { success: true, callId: result.uuid };
    
  } catch (callError) {
    console.log('❌ Voice call failed:');
    console.log('   Error:', callError.message);
    
    if (callError.response) {
      console.log('   HTTP Status:', callError.response.status);
      console.log('   Response headers:', callError.response.headers);
      console.log('   Response data:', callError.response.data);
    }
    
    // Specific error analysis
    if (callError.response?.status === 401) {
      console.log('\n💡 401 Voice API Error Analysis:');
      console.log('   The application authentication is failing specifically for Voice API');
      console.log('   This could mean:');
      console.log('   1. Voice capability is not enabled on the application');
      console.log('   2. The application needs additional configuration');
      console.log('   3. Account needs verification for Voice services');
    }
    
    return { success: false, error: callError.message };
  }
}

// Test alternative approaches
async function testAlternativeApproaches() {
  console.log('\n🔄 TESTING ALTERNATIVE APPROACHES');
  console.log('================================\n');

  // Try with webhook.site for answer URL
  console.log('8️⃣ Testing with external webhook URLs...');
  
  try {
    const privateKey = fs.readFileSync('/home/ec2-user/environment/nova-telephony-poc/vonage-private-key.pem', 'utf8');
    const auth = new Auth({
      apiKey: "7f45e88f",
      apiSecret: "zGq4BMH8HQFKzpfe",
      applicationId: "f7fb73da-1cfb-4376-a701-b71c4672f30d",
      privateKey: privateKey
    });
    const voice = new Voice(auth);
    
    const webhookCall = {
      to: [{
        type: 'phone',
        number: '+13472005533'
      }],
      from: {
        type: 'phone',
        number: 'Nova Test'
      },
      answer_url: ['https://raw.githubusercontent.com/nexmo-community/ncco-examples/gh-pages/text-to-speech.json'],
      event_url: ['https://httpbin.org/post']
    };
    
    const result = await voice.createOutboundCall(webhookCall);
    console.log('✅ Webhook approach successful!');
    console.log('   Call ID:', result.uuid);
    
    return { success: true, approach: 'webhook' };
    
  } catch (error) {
    console.log('❌ Webhook approach failed:', error.message);
    return { success: false };
  }
}

async function main() {
  console.log('🚀 VONAGE AUTHENTICATION COMPREHENSIVE DEBUG');
  console.log('============================================\n');
  
  const result = await comprehensiveAuthTest();
  
  if (!result || !result.success) {
    console.log('\n🔄 Trying alternative approaches...');
    await testAlternativeApproaches();
  }
  
  console.log('\n🎯 DEBUGGING SUMMARY');
  console.log('===================');
  console.log('This test should help identify exactly where authentication is failing.');
  console.log('Please check the output above for specific error messages and status codes.');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { comprehensiveAuthTest };