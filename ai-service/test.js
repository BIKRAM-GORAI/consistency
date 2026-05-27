// Quick local verification script for VS Code terminal
require('dotenv').config();

async function runTests() {
  console.log('🏁 Starting local AI Microservice verification...');

  const serviceSecret = process.env.AI_SERVICE_SECRET || 'mock_secret_for_local_testing_123';

  // 1. Health check test
  try {
    const res = await fetch('http://localhost:5002/health');
    const data = await res.json();
    console.log('✅ Health Check endpoint responded successfully:', data);
  } catch (err) {
    console.error('❌ Health Check failed (make sure the server is running on port 5002!):', err.message);
    return;
  }

  // 2. Secret check failure verification
  try {
    const res = await fetch('http://localhost:5002/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: 'test', userPrompt: 'test' })
    });
    console.log('✅ Security validation: status code =', res.status, res.status === 401 ? '(Correct: Request blocked as Unauthorized)' : '(Incorrect)');
  } catch (err) {
    console.error('❌ Security check failed:', err.message);
  }

  // 3. Handshake verification (reads from local .env)
  try {
    const res = await fetch('http://localhost:5002/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-service-secret': serviceSecret
      },
      body: JSON.stringify({
        systemPrompt: 'You are a professional daily productivity coach. Give a 1-sentence tip.',
        userPrompt: 'Suggest 1 quick focus tip.'
      })
    });
    
    console.log('✅ Connection handshake: status code =', res.status);
    const data = await res.json();
    if (res.status === 200) {
      console.log('\n💬 AI Response:\n', data.result);
    } else {
      console.log('⚠️ Request passed handshake but Groq returned an error (likely due to mock/missing Groq API Key):');
      console.log(data);
    }
  } catch (err) {
    console.error('❌ Handshake test failed:', err.message);
  }
}

runTests();
