require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());

// Uptime tracker
const startTime = Date.now();

/**
 * GET /health
 * Lightweight health check endpoint to prevent Render scaling-down (for Uptime Robot)
 */
app.get('/health', (req, res) => {
  const uptimeMs = Date.now() - startTime;
  res.status(200).json({
    status: 'ok',
    uptime: `${Math.floor(uptimeMs / 1000)}s`,
    timestamp: new Date().toISOString(),
    service: 'consistency-daily-ai-tracker'
  });
});

/**
 * POST /api/ai/generate
 * Securely forwards completion requests to the Groq API
 */
app.post('/api/ai/generate', async (req, res) => {
  try {
    const incomingSecret = req.headers['x-ai-service-secret'];
    const expectedSecret = process.env.AI_SERVICE_SECRET;

    // Validate shared HMAC/Secret header
    if (!expectedSecret || incomingSecret !== expectedSecret) {
      console.warn(`[AI-Service] Unauthorized access attempt blocked. IP: ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing API secret' });
    }

    const { systemPrompt, userPrompt } = req.body;
    if (!systemPrompt || !userPrompt) {
      return res.status(400).json({ error: 'Bad Request: systemPrompt and userPrompt are required' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('[AI-Service] Configuration Error: GROQ_API_KEY is not set in environment.');
      return res.status(500).json({ error: 'Internal Server Error: AI provider configuration missing.' });
    }

    const modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    console.log(`[AI-Service] Querying Groq model ${modelName}...`);

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error(`[AI-Service] Groq API returned status ${groqResponse.status}:`, errorText);
      return res.status(groqResponse.status).json({
        error: 'Groq API error',
        details: errorText
      });
    }

    const data = await groqResponse.json();
    const resultText = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

    if (!resultText) {
      console.error('[AI-Service] Malformed Groq API response:', JSON.stringify(data));
      return res.status(502).json({ error: 'Bad Gateway: Empty response from AI provider' });
    }

    res.status(200).json({ result: resultText });
  } catch (error) {
    console.error('[AI-Service] Execution error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`🤖 Standalone AI Microservice running on port ${PORT}`);
  console.log(`👉 Health check active at GET http://localhost:${PORT}/health`);
  console.log(`👉 Generation endpoint active at POST http://localhost:${PORT}/api/ai/generate`);
});
