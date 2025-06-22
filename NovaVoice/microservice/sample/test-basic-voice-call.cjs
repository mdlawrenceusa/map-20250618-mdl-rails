#!/usr/bin/env node

/**
 * Test Voice Call with Basic Authentication (API Key + Secret)
 * This bypasses the problematic Application ID authentication
 */

const axios = require('axios');

async function makeBasicVoiceCall() {
  console.log('📞 BASIC AUTHENTICATION VOICE CALL TEST');
  console.log('======================================\n');

  console.log('🔑 Using basic API Key + Secret authentication');
  console.log('📱 Target: +1-347-200-5533');
  console.log('🎯 Testing simple TTS call first\n');

  try {
    // Use the legacy REST API with basic auth
    const callData = {
      to: '13472005533',
      from: 'NovaTest',
      text: 'Hello, this is a test call from Nova Sonic using basic authentication. If you can hear this message, the authentication is working correctly.',
      api_key: '7f45e88f',
      api_secret: 'zGq4BMH8HQFKzpfe'
    };

    console.log('📤 Making voice call with basic auth...');
    console.log('Call data:', JSON.stringify(callData, null, 2));

    const response = await axios.post('https://rest.nexmo.com/tts/json', callData);

    console.log('Response status:', response.status);
    console.log('Response data:', response.data);

    if (response.data && response.data.status === '0') {
      console.log('🎉 BASIC AUTH VOICE CALL SUCCESSFUL!');
      console.log('   Call ID:', response.data.call_id);
      console.log('   Status:', response.data.status);
      console.log('   📞 Your phone should be ringing at +1-347-200-5533');
      console.log('   🔊 You should hear the test message');

      return { success: true, callId: response.data.call_id };
    } else {
      console.log('❌ Voice call failed:');
      console.log('   Status:', response.data.status);
      console.log('   Error:', response.data.error_text);
      return { success: false, error: response.data.error_text };
    }

  } catch (error) {
    console.log('❌ Voice call request failed:');
    console.log('   Error:', error.response?.data || error.message);
    console.log('   Status:', error.response?.status);

    if (error.response?.status === 401) {
      console.log('\n💡 Still getting 401 - account may need additional setup');
    } else if (error.response?.status === 402) {
      console.log('\n💡 402 Payment Required - may need to add payment method or buy phone number');
    }

    return { success: false, error: error.message };
  }
}

async function makeChurchOutreachCall() {
  console.log('\n⛪ CHURCH OUTREACH CALL WITH BASIC AUTH');
  console.log('======================================\n');

  console.log('🤖 Making church outreach call as "Esther"...');

  try {
    const churchCallData = {
      to: '13472005533',
      from: 'Esther',
      text: `Hello, this is Esther calling from Mike Lawrence Productions. Could I please speak with your senior pastor or lead pastor? 

We have an exciting Off-Broadway quality Gospel illusion show ministry that has proven very effective for church outreach and evangelism. Similar programs with Campus Crusade for Christ led to approximately 100,000 decisions for Christ.

I would love to schedule a brief 15-minute web meeting with your pastor to show how this ministry could benefit your church's outreach efforts. Our website is GLOBALOUTREACHEVENT.COM and you can call us back at 347-200-5533.

Would it be possible to speak with your pastor now, or could you let me know the best time to reach them? This is about a proven evangelistic outreach opportunity that could really impact your community. Thank you for your time, and God bless your ministry!`,
      api_key: '7f45e88f',
      api_secret: 'zGq4BMH8HQFKzpfe'
    };

    console.log('📞 Making church outreach call...');

    const response = await axios.post('https://rest.nexmo.com/tts/json', churchCallData);

    if (response.data && response.data.status === '0') {
      console.log('🎉 CHURCH OUTREACH CALL SUCCESSFUL!');
      console.log('=======================================');
      console.log('✅ "Esther" is calling about Gospel magic show ministry!');
      console.log('   Call ID:', response.data.call_id);
      console.log('   📞 Phone should be ringing with full church outreach message');
      console.log('   🎭 Professional ministry context delivered');
      console.log('   ⛪ Gospel illusion show ministry discussed');
      console.log('   🤝 Meeting scheduling focus included');
      console.log('   📧 Contact info provided: GLOBALOUTREACHEVENT.COM');
      console.log('\n🎉 NOVA SONIC CHURCH OUTREACH SYSTEM OPERATIONAL!');

      return { success: true, callId: response.data.call_id };
    } else {
      console.log('❌ Church outreach call failed:', response.data);
      return { success: false };
    }

  } catch (error) {
    console.log('❌ Church outreach call error:', error.response?.data || error.message);
    return { success: false };
  }
}

async function main() {
  console.log('🚀 NOVA SONIC VOICE CALLING WITH BASIC AUTH');
  console.log('===========================================\n');

  // Test basic voice call first
  const basicResult = await makeBasicVoiceCall();

  if (basicResult.success) {
    console.log('\n✅ Basic authentication working! Proceeding with church outreach...');
    
    // Wait a moment, then make the church call
    setTimeout(async () => {
      await makeChurchOutreachCall();
    }, 5000);
    
  } else {
    console.log('\n❌ Basic authentication failed. Need to investigate account setup.');
    console.log('\n🔧 NEXT STEPS:');
    console.log('1. Check if account needs phone number verification');
    console.log('2. Verify account has sufficient balance for voice calls');
    console.log('3. Check if account needs additional verification for Voice API');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { makeBasicVoiceCall, makeChurchOutreachCall };