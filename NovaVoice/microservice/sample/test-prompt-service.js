// Simple test script for PromptService
const { PromptService } = require('./dist/services/PromptService.js');

async function testPromptService() {
  console.log('🧪 Testing PromptService...');
  
  try {
    const promptService = new PromptService();
    
    console.log('📡 Loading Esther prompt from S3...');
    const prompt = await promptService.getSystemPrompt('esther');
    
    console.log('✅ Success! Loaded prompt:');
    console.log(`📏 Length: ${prompt.length} characters`);
    console.log(`📖 Preview: ${prompt.substring(0, 200)}...`);
    
    // Test caching
    console.log('\n🔄 Testing cache...');
    const cachedPrompt = await promptService.getSystemPrompt('esther');
    console.log('✅ Cache test passed');
    
    // Test cache stats
    const stats = promptService.getCacheStats();
    console.log(`📊 Cache stats: ${stats.size} entries: ${stats.entries.join(', ')}`);
    
    console.log('\n🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Set environment variables
process.env.AWS_REGION = 'us-east-1';
process.env.PROMPTS_S3_BUCKET = 'nova-sonic-prompts';

testPromptService();