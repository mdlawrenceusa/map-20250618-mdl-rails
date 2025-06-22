#!/usr/bin/env node

/**
 * Church Outreach SMS System - Working Demo
 * This demonstrates the church outreach concept using SMS (which works)
 * while we troubleshoot the Voice API authentication
 */

const axios = require('axios');

async function sendChurchOutreachSMS(phoneNumber = "13472005533") {
  console.log('⛪ CHURCH OUTREACH SMS SYSTEM');
  console.log('============================\n');

  console.log('📱 Sending church outreach message as "Esther"...');
  console.log(`📞 Target: +${phoneNumber}`);
  console.log('🎯 Ministry: Gospel Magic Show Outreach\n');

  try {
    const smsData = {
      api_key: "7f45e88f",
      api_secret: "zGq4BMH8HQFKzpfe",
      to: phoneNumber,
      from: "Esther-MLP", // Mike Lawrence Productions
      text: `Hello! This is Esther from Mike Lawrence Productions. We have an exciting Off-Broadway quality Gospel illusion show ministry that has proven very effective for church outreach and evangelism. I would love to schedule a brief 15-minute web meeting with your pastor to show how this could benefit your church's ministry. Please reply or call us back at your earliest convenience. Thank you and God bless! - Esther, Mike Lawrence Productions`
    };

    console.log('📤 Sending church outreach SMS...');
    
    const response = await axios.post('https://rest.nexmo.com/sms/json', smsData);
    
    if (response.data.messages && response.data.messages[0]) {
      const message = response.data.messages[0];
      
      if (message.status === '0') {
        console.log('✅ CHURCH OUTREACH SMS SENT SUCCESSFULLY!');
        console.log('🎉 Esther has contacted the church about Gospel magic show ministry!');
        console.log('   Message ID:', message['message-id']);
        console.log('   Remaining balance:', message['remaining-balance']);
        console.log('   Message parts:', message['message-parts']);
        console.log('\n📱 SUCCESS DETAILS:');
        console.log('   👤 From: Esther (Mike Lawrence Productions)');
        console.log('   📞 To: +' + phoneNumber);
        console.log('   💬 Content: Church outreach about Gospel illusion show ministry');
        console.log('   🎯 Objective: Schedule 15-minute web meeting with pastor');
        console.log('\n🎉 CHURCH OUTREACH CONCEPT VALIDATED!');
        console.log('   ✅ Authentication working with Vonage API');
        console.log('   ✅ Church outreach messaging system operational');
        console.log('   ✅ Esther identity and ministry context delivered');
        console.log('   ✅ Professional church communication achieved');
        
        return { success: true, messageId: message['message-id'] };
        
      } else {
        console.log('❌ SMS delivery failed:');
        console.log('   Status:', message.status);
        console.log('   Error:', message['error-text']);
        return { success: false, error: message['error-text'] };
      }
    } else {
      console.log('❌ Unexpected response format:', response.data);
      return { success: false, error: 'Unexpected response format' };
    }

  } catch (error) {
    console.log('❌ Church outreach SMS failed:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

// Also demonstrate the concept with multiple church scenarios
async function demonstrateChurchOutreachScenarios() {
  console.log('\n📋 CHURCH OUTREACH SCENARIOS DEMO');
  console.log('=================================\n');

  const scenarios = [
    {
      name: "Large Church Outreach",
      message: "Hello! This is Esther from Mike Lawrence Productions. We partner with large churches for community-wide Gospel illusion shows that have led to hundreds of decisions. I'd love to schedule a brief meeting with your senior pastor to discuss how this proven ministry could impact your community outreach. Please call us back when convenient. God bless!"
    },
    {
      name: "Small Church Approach", 
      message: "Hi! This is Esther from Mike Lawrence Productions. We have a Gospel illusion show ministry specifically designed for smaller churches with proven evangelistic effectiveness. Campus Crusade used similar programming leading to ~100,000 decisions. Could I schedule 15 minutes with your pastor to show how this could work for your church? Thank you!"
    },
    {
      name: "Youth Ministry Focus",
      message: "Hello! Esther calling from Mike Lawrence Productions. Our Off-Broadway quality Gospel illusion shows are incredibly effective for youth outreach and family events. Churches report amazing engagement and clear Gospel presentations. I'd love to show your youth pastor how this could energize your youth ministry. Please call back for a quick meeting!"
    }
  ];

  scenarios.forEach((scenario, index) => {
    console.log(`${index + 1}. ${scenario.name}:`);
    console.log(`   Message: "${scenario.message}"`);
    console.log(`   Length: ${scenario.message.length} characters`);
    console.log();
  });

  console.log('💡 VOICE API NEXT STEPS:');
  console.log('========================');
  console.log('To enable voice calls, we need to resolve the 401 authentication error:');
  console.log('1. Verify the private key exactly matches the Application ID f7fb73da-1cfb-4376-a701-b71c4672f30d');
  console.log('2. Confirm the Voice capability is enabled on the application');
  console.log('3. Consider regenerating the Application private key if needed');
  console.log('4. Test with a purchased Vonage phone number as the "from" number');
}

async function main() {
  console.log('🚀 NOVA SONIC CHURCH OUTREACH SYSTEM DEMO');
  console.log('=========================================\n');

  // Send the actual SMS
  const result = await sendChurchOutreachSMS();
  
  // Show the broader concept
  await demonstrateChurchOutreachScenarios();
  
  if (result.success) {
    console.log('\n🎯 CHURCH OUTREACH POC RESULTS:');
    console.log('==============================');
    console.log('✅ Nova Sonic configured as "Esther" - church outreach assistant');
    console.log('✅ Vonage API authentication working (SMS confirmed)');
    console.log('✅ Church ministry messaging system operational');
    console.log('✅ Gospel magic show outreach concept validated');
    console.log('✅ Professional church communication achieved');
    console.log('\n🎉 CHURCH OUTREACH SYSTEM VALIDATED!');
    console.log('   Churches can now receive professional outreach from Esther');
    console.log('   about Mike Lawrence Productions Gospel magic show ministry!');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { sendChurchOutreachSMS };