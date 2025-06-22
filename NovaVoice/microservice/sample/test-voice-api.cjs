#!/usr/bin/env node

/**
 * Test Vonage Voice API Specifically
 */

const { Voice } = require('@vonage/voice');
const { Auth } = require('@vonage/auth');
const fs = require('fs');

async function testVoiceAPI() {
  console.log('📞 VONAGE VOICE API TEST');
  console.log('=======================\n');

  try {
    const privateKey = fs.readFileSync('/home/ec2-user/environment/nova-telephony-poc/vonage-private-key.pem', 'utf8');
    
    const auth = new Auth({
      apiKey: "7f45e88f",
      apiSecret: "zGq4BMH8HQFKzpfe",
      applicationId: "f7fb73da-1cfb-4376-a701-b71c4672f30d",
      privateKey: privateKey
    });

    // Use Voice API directly
    const voice = new Voice(auth);
    
    console.log('Voice API methods:');
    console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(voice)));
    
    console.log('\n📞 Testing outbound call with Voice API...');
    
    const callRequest = {
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
          text: "Hello, this is Esther calling from Mike Lawrence Productions. We specialize in Gospel illusion shows for church outreach and evangelism. I would love to schedule a brief 15-minute web meeting with your pastor to discuss how this ministry could benefit your church. Please call us back at your earliest convenience. Thank you and God bless.",
          voiceName: "Amy"
        }
      ]
    };

    console.log('Call request:', JSON.stringify(callRequest, null, 2));

    try {
      const result = await voice.createOutboundCall(callRequest);
      console.log('✅ VOICE API CALL SUCCESSFUL!');
      console.log('🎉 CHURCH OUTREACH CALL MADE SUCCESSFULLY!');
      console.log('   Call ID:', result.uuid);
      console.log('   Status:', result.status);
      console.log('   📞 Esther is now calling +13472005533 about Gospel magic show ministry!');
      
      return result;
      
    } catch (callError) {
      console.log('❌ Voice API call failed:');
      console.log('   Error:', callError.message);
      
      if (callError.response) {
        console.log('   HTTP Status:', callError.response.status);
        console.log('   Response data:', callError.response.data);
      }
      
      if (callError.body) {
        console.log('   Error body:', callError.body);
      }
      
      // Specific troubleshooting for common errors
      if (callError.message.includes('401')) {
        console.log('\n💡 401 Error Troubleshooting:');
        console.log('   - Check if Application ID is correct');
        console.log('   - Verify private key matches the application');
        console.log('   - Ensure Voice capability is enabled on the application');
      }
      
      if (callError.message.includes('402')) {
        console.log('\n💡 402 Error: Account may need funding or phone number');
      }
      
      return null;
    }

  } catch (error) {
    console.log('❌ Voice API setup failed:', error.message);
    return null;
  }
}

testVoiceAPI().catch(console.error);