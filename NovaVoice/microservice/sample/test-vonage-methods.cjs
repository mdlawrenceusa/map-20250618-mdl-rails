#!/usr/bin/env node

/**
 * Test Vonage SDK Methods and Capabilities
 */

const { Vonage } = require('@vonage/server-sdk');
const { Auth } = require('@vonage/auth');

async function testVonageMethods() {
  console.log('🔍 VONAGE SDK METHODS TEST');
  console.log('=========================\n');

  try {
    const auth = new Auth({
      apiKey: "7f45e88f",
      apiSecret: "zGq4BMH8HQFKzpfe"
    });
    
    const vonage = new Vonage(auth);

    console.log('Available objects on vonage client:');
    console.log(Object.keys(vonage));
    
    if (vonage.account) {
      console.log('\nAccount methods:');
      console.log(Object.keys(vonage.account));
    }
    
    if (vonage.voice) {
      console.log('\nVoice methods:');
      console.log(Object.keys(vonage.voice));
    }
    
    if (vonage.sms) {
      console.log('\nSMS methods:');
      console.log(Object.keys(vonage.sms));
    }
    
    if (vonage.numbers) {
      console.log('\nNumbers methods:');
      console.log(Object.keys(vonage.numbers));
    }

    // Try the correct method names
    console.log('\n💰 Trying different balance check methods...');
    
    // Method 1: getAccountBalance
    if (vonage.account && vonage.account.getAccountBalance) {
      try {
        const balance1 = await vonage.account.getAccountBalance();
        console.log('✅ getAccountBalance worked:', balance1);
      } catch (e) {
        console.log('❌ getAccountBalance failed:', e.message);
      }
    }
    
    // Method 2: getBalance  
    if (vonage.account && vonage.account.getBalance) {
      try {
        const balance2 = await vonage.account.getBalance();
        console.log('✅ getBalance worked:', balance2);
      } catch (e) {
        console.log('❌ getBalance failed:', e.message);
      }
    }

  } catch (error) {
    console.log('❌ Setup failed:', error.message);
  }
}

testVonageMethods().catch(console.error);