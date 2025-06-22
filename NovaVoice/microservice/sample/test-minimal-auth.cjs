#!/usr/bin/env node

/**
 * Minimal Authentication Test
 */

const axios = require('axios');
const fs = require('fs');
const jwt = require('jsonwebtoken');

async function testMinimalAuth() {
  console.log('🔐 MINIMAL VONAGE AUTHENTICATION TEST');
  console.log('===================================\n');

  try {
    // Test 1: Basic API Key/Secret with SMS (simpler than voice)
    console.log('1️⃣ Testing API Key/Secret with SMS...');
    try {
      const smsResponse = await axios.post('https://rest.nexmo.com/sms/json', {
        api_key: "7f45e88f",
        api_secret: "zGq4BMH8HQFKzpfe",
        to: "13472005533",
        from: "Nova Sonic",
        text: "Test message from Nova Sonic church outreach system - please ignore"
      });
      
      console.log('✅ SMS API worked with API Key/Secret!');
      console.log('   Message ID:', smsResponse.data.messages[0]['message-id']);
      
    } catch (smsError) {
      console.log('❌ SMS API failed:', smsError.response?.data || smsError.message);
    }

    // Test 2: Check if we can create a JWT manually
    console.log('\n2️⃣ Testing JWT creation...');
    try {
      const privateKey = fs.readFileSync('/home/ec2-user/environment/nova-telephony-poc/vonage-private-key.pem', 'utf8');
      
      const payload = {
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: require('crypto').randomUUID(),
        iss: "7f45e88f",  // API Key
        sub: "f7fb73da-1cfb-4376-a701-b71c4672f30d"  // Application ID
      };
      
      const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
      console.log('✅ JWT created successfully');
      console.log('   Token length:', token.length);
      
      // Test 3: Try Voice API with manual JWT
      console.log('\n3️⃣ Testing Voice API with manual JWT...');
      
      const voiceCall = {
        to: [{
          type: 'phone',
          number: '+13472005533'
        }],
        from: {
          type: 'phone',
          number: 'Nova Sonic'
        },
        ncco: [
          {
            action: "talk",
            text: "Hello, this is Esther from Mike Lawrence Productions calling about our Gospel illusion show ministry. Please call us back to discuss scheduling a meeting with your pastor. Thank you.",
            voiceName: "Amy"
          }
        ]
      };
      
      try {
        const voiceResponse = await axios.post('https://api.nexmo.com/v1/calls', voiceCall, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('✅ VOICE API WORKED WITH MANUAL JWT!');
        console.log('🎉 CHURCH OUTREACH CALL SUCCESSFUL!');
        console.log('   Call ID:', voiceResponse.data.uuid);
        console.log('   Status:', voiceResponse.data.status);
        console.log('   📞 Esther is calling +13472005533 about Gospel magic show ministry!');
        
        return voiceResponse.data;
        
      } catch (voiceError) {
        console.log('❌ Voice API with JWT failed:');
        console.log('   Status:', voiceError.response?.status);
        console.log('   Error:', voiceError.response?.data || voiceError.message);
        
        if (voiceError.response?.status === 401) {
          console.log('\n💡 JWT Authentication Issues:');
          console.log('   - Private key might not match Application ID');
          console.log('   - Application might not have Voice capability');
          console.log('   - API Key might not match the private key');
        }
        
        if (voiceError.response?.status === 402) {
          console.log('\n💡 Payment Required (402):');
          console.log('   - Account needs funding');
          console.log('   - Need to purchase a phone number');
        }
      }
      
    } catch (jwtError) {
      console.log('❌ JWT creation failed:', jwtError.message);
    }

  } catch (error) {
    console.log('❌ Test setup failed:', error.message);
  }
}

testMinimalAuth().catch(console.error);