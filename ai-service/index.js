require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');

// Configure multer to store uploaded files in memory
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // limit to 10MB

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

/**
 * POST /api/ai/generate-summary
 * Securely forwards completion requests to the Groq API using JWT authorization token verified by JWT_SECRET
 */
app.post('/api/ai/generate-summary', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[AI-Service] JWT_SECRET is not set in environment.');
      return res.status(500).json({ error: 'Internal Server Error: Shared secret missing.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (verifyError) {
      console.warn(`[AI-Service] JWT Verification failed: ${verifyError.message}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired generation token' });
    }

    if (decoded.action !== 'generate-daily-summary') {
      return res.status(403).json({ error: 'Forbidden: Invalid action for this token' });
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
    console.log(`[AI-Service] [Auth-Token Verified] Querying Groq model ${modelName}...`);

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

/**
 * POST /api/ai/extract-tasks
 * Accepts an image, validates JWT single-use token, and uses Gemini Vision to extract tasks as JSON
 */
app.post('/api/ai/extract-tasks', upload.single('image'), async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[AI-Service] JWT_SECRET is not set in environment.');
      return res.status(500).json({ error: 'Internal Server Error: Shared secret missing.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (verifyError) {
      console.warn(`[AI-Service] JWT Verification failed: ${verifyError.message}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired generation token' });
    }

    if (decoded.action !== 'extract-tasks-from-image') {
      return res.status(403).json({ error: 'Forbidden: Invalid action for this token' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Bad Request: Image file is required under field name "image"' });
    }

    const imageBase64 = req.file.buffer.toString('base64');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
      console.error('[AI-Service] Configuration Error: GEMINI_API_KEY is not set in environment.');
      return res.status(500).json({ error: 'Internal Server Error: AI provider key configuration missing.' });
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    console.log(`[AI-Service] [Auth-Token Verified] Querying Gemini model ${modelName} for task extraction...`);

    const systemInstruction = 
      "Extract all handwritten or typed tasks and their corresponding categories from this image.\n" +
      "You MUST output a single valid JSON object following this schema:\n" +
      "{\n" +
      "  \"categories\": [\n" +
      "    {\n" +
      "      \"name\": \"Category Name (e.g., Work, Academics, Fitness)\",\n" +
      "      \"tasks\": [\"Task title 1\", \"Task title 2\"]\n" +
      "    }\n" +
      "  ]\n" +
      "}\n\n" +
      "Strict Rules:\n" +
      "1. Group tasks logically into short, recognizable categories.\n" +
      "2. Clean up task titles (remove list marks like checkboxes, numbers, bullets, or hyphens).\n" +
      "3. Do not include any explanation, conversational filler, or markdown wrappers. Output only the raw JSON.";

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemInstruction },
            {
              inline_data: {
                mime_type: req.file.mimetype,
                data: imageBase64
              }
            }
          ]
        }],
        generationConfig: {
          response_mime_type: 'application/json'
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`[AI-Service] Gemini API returned status ${geminiResponse.status}:`, errorText);
      return res.status(geminiResponse.status).json({
        error: 'Gemini API error',
        details: errorText
      });
    }

    const data = await geminiResponse.json();
    const resultText = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

    if (!resultText) {
      console.error('[AI-Service] Malformed Gemini API response:', JSON.stringify(data));
      return res.status(502).json({ error: 'Bad Gateway: Empty response from Gemini API' });
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(resultText.trim());
    } catch (parseError) {
      console.warn(`[AI-Service] Raw response text is not valid JSON:`, resultText);
      return res.status(502).json({ error: 'Bad Gateway: AI response is not valid JSON', raw: resultText });
    }

    res.status(200).json(parsedResult);
  } catch (error) {
    console.error('[AI-Service] Execution error in task extraction:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`🤖 Standalone AI Microservice running on port ${PORT}`);
  console.log(`👉 Health check active at GET http://localhost:${PORT}/health`);
  console.log(`👉 Generation endpoint active at POST http://localhost:${PORT}/api/ai/generate`);
  console.log(`👉 JWT Summary generation endpoint active at POST http://localhost:${PORT}/api/ai/generate-summary`);
});
