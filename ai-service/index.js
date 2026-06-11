const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
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
 * Clean LLM response text that might contain markdown wrapper ticks or noise
 */
function cleanJsonResponse(text) {
  if (!text) return '';
  let cleaned = text.trim();
  
  // Remove markdown code block wrappers if present
  if (cleaned.startsWith('```')) {
    const match = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (match) {
      cleaned = match[1].trim();
    }
  }
  
  // Remove any trailing backticks or formatting
  cleaned = cleaned.replace(/^`+|`+$/g, '').trim();
  
  return cleaned;
}

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
    console.log(`[AI-Service] [Auth-Token Verified] Querying Gemini model ${modelName} for task extraction (key suffix: ...${apiKey.slice(-5)})...`);

    // Sanitize MIME-type to avoid Unsupported MIME type errors (e.g. application/octet-stream)
    let mimeType = req.file.mimetype;
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
    
    if (mimeType === 'image/jpg') {
      mimeType = 'image/jpeg';
    } else if (!allowedMimeTypes.includes(mimeType)) {
      // Attempt to infer from original filename extension
      const originalName = req.file.originalname || '';
      const ext = originalName.split('.').pop().toLowerCase();
      if (ext === 'png') {
        mimeType = 'image/png';
      } else if (ext === 'webp') {
        mimeType = 'image/webp';
      } else if (ext === 'heic') {
        mimeType = 'image/heic';
      } else if (ext === 'heif') {
        mimeType = 'image/heif';
      } else {
        // Default to image/jpeg if unknown or unsupported
        mimeType = 'image/jpeg';
      }
    }

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
                mime_type: mimeType,
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
      
      let parsedError;
      try {
        parsedError = JSON.parse(errorText);
      } catch (e) {
        parsedError = null;
      }
      
      const detailedMessage = parsedError && parsedError.error && parsedError.error.message 
        ? parsedError.error.message 
        : errorText;

      return res.status(geminiResponse.status).json({
        error: 'Gemini API error',
        details: detailedMessage
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
      parsedResult = JSON.parse(cleanJsonResponse(resultText));
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

/**
 * POST /api/ai/voice-to-task
 * Accepts an audio file (max 10MB), validates single-use JWT voice parse token,
 * transcribes via Groq Whisper, then parses transcript via LLM into structured JSON checklist categories.
 */
app.post('/api/ai/voice-to-task', upload.single('audio'), async (req, res) => {
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

    if (decoded.action !== 'parse-voice-to-task') {
      return res.status(403).json({ error: 'Forbidden: Invalid action for this token' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Bad Request: Audio file is required under field name "audio"' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('[AI-Service] Configuration Error: GROQ_API_KEY is not set in environment.');
      return res.status(500).json({ error: 'Internal Server Error: AI provider configuration missing.' });
    }

    console.log(`[AI-Service] [Auth-Token Verified] Transcribing audio via Groq Whisper... size: ${req.file.size} bytes`);

    // Create form data using native Node FormData
    const formData = new FormData();
    const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/wav' });
    formData.append('file', audioBlob, req.file.originalname || 'audio.wav');
    formData.append('model', 'whisper-large-v3');
    formData.append('temperature', '0.0');

    const whisperResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error(`[AI-Service] Groq Whisper API returned status ${whisperResponse.status}:`, errorText);
      return res.status(whisperResponse.status).json({
        error: 'Groq Whisper API error',
        details: errorText
      });
    }

    const whisperData = await whisperResponse.json();
    const transcript = whisperData.text;
    console.log(`[AI-Service] Transcription success: "${transcript}"`);

    if (!transcript || transcript.trim() === '') {
      return res.status(200).json({ categories: [] });
    }

    // Now, send the transcript to the LLM to structure into `{ categories: [ { name: "", tasks: [] } ] }`
    const modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    console.log(`[AI-Service] Prompting LLM (${modelName}) to structure tasks JSON...`);

    const systemPrompt = 
      "You are an expert personal productivity assistant.\n" +
      "Analyze the user's spoken voice transcript describing their habits, daily tasks, or goals for the day.\n" +
      "Extract and group these tasks logically into short, recognizable categories (e.g., Fitness, Work, Mindset, Learning).\n" +
      "You MUST output a single valid JSON object following this EXACT schema:\n" +
      "{\n" +
      "  \"categories\": [\n" +
      "    {\n" +
      "      \"name\": \"Category Name\",\n" +
      "      \"tasks\": [\n" +
      "        {\n" +
      "          \"title\": \"Clean, actionable task description starting with a verb (e.g., Drink 3L water, Reply to emails)\",\n" +
      "          \"completed\": false\n" +
      "        }\n" +
      "      ]\n" +
      "    }\n" +
      "  ]\n" +
      "}\n\n" +
      "Strict Rules:\n" +
      "1. Every task must have a 'title' string and a 'completed' boolean set to false.\n" +
      "2. Do not include any explanation, conversational filler, markdown codeblocks (e.g. ```json), or wrapping. Output only the raw valid JSON.\n" +
      "3. If no clear tasks are found or if the text is irrelevant, return {\"categories\": []}.";

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
          { role: 'user', content: `Analyze this voice transcription: "${transcript}"` }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error(`[AI-Service] Groq Chat API returned status ${groqResponse.status}:`, errorText);
      return res.status(groqResponse.status).json({
        error: 'Groq Chat API error during parsing',
        details: errorText
      });
    }

    const chatData = await groqResponse.json();
    const resultText = chatData.choices && chatData.choices[0] && chatData.choices[0].message && chatData.choices[0].message.content;

    if (!resultText) {
      console.error('[AI-Service] Malformed Groq Chat response:', JSON.stringify(chatData));
      return res.status(502).json({ error: 'Bad Gateway: Empty response from AI parsing provider' });
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
    console.error('[AI-Service] Execution error in voice-to-task extraction:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * POST /api/ai/generate-canvas-flow
 * Validates single-use JWT canvas ticket, calls Gemini to parse prompt/current-state,
 * and returns the updated nodes and edges graph structure.
 */
app.post('/api/ai/generate-canvas-flow', async (req, res) => {
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
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    if (decoded.action !== 'generate-canvas-flow') {
      return res.status(403).json({ error: 'Forbidden: Invalid action for this token' });
    }

    const { prompt, nodes, edges } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Bad Request: prompt is required' });
    }

    const apiKey = process.env.GEMINI_CANVAS_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
      console.error('[AI-Service] Configuration Error: GEMINI_CANVAS_API_KEY is not set.');
      return res.status(500).json({ error: 'Internal Server Error: AI provider key missing.' });
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    console.log(`[AI-Service] [Auth-Token Verified] Querying Gemini for canvas flow generation (key suffix: ...${apiKey.slice(-5)})...`);

    const systemInstruction = 
      "You are an expert AI workflow designer and productivity coach.\n" +
      "Your goal is to build or modify a visual node-based conditional flowchart representing a user's productivity routine or plan.\n\n" +
      "You MUST output a single valid JSON object following this EXACT schema:\n" +
      "{\n" +
      "  \"nodes\": [\n" +
      "    {\n" +
      "      \"id\": \"unique_node_id_1\",\n" +
      "      \"label\": \"Action, Goal or Condition details\",\n" +
      "      \"type\": \"action\" or \"condition\" or \"goal\",\n" +
      "      \"status\": \"pending\" or \"completed\",\n" +
      "      \"x\": number,\n" +
      "      \"y\": number,\n" +
      "      \"checklist\": [\"Subtask item 1\", \"Subtask item 2\"]\n" +
      "    }\n" +
      "  ],\n" +
      "  \"edges\": [\n" +
      "    {\n" +
      "      \"id\": \"unique_edge_id_1\",\n" +
      "      \"from\": \"source_node_id\",\n" +
      "      \"to\": \"target_node_id\",\n" +
      "      \"label\": \"Optional link description (e.g., Yes, No, Success, Failure)\"\n" +
      "    }\n" +
      "  ]\n" +
      "}\n\n" +
      "Strict Rules:\n" +
      "1. Keep existing nodes: If nodes are provided in the input, retain their IDs, custom positions (x, y), and status values unless the user's prompt explicitly requests to modify or delete them. Do not reset coordinates randomly.\n" +
      "2. Layout: Place nodes logically. Nodes are cards of 270px width and ~180px height. To prevent overlaps, ensure a minimum of 360px separation horizontally (x direction) and 240px separation vertically (y direction). The flow should generally progress from left to right (increasing x starting from 100 up to 2500, y from 100 to 1200).\n" +
      "3. Connections: Draw logical directed edges between related nodes. If a node is a 'condition', it should typically branch to separate pathways (e.g. Yes/No edges).\n" +
      "4. Output ONLY the raw JSON. Do not wrap in ```json markdown block formatting. Do not include conversational filler.";

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemInstruction },
            { text: `Current state graph:\nNodes: ${JSON.stringify(nodes || [])}\nEdges: ${JSON.stringify(edges || [])}\n\nUser Edit Request: "${prompt}"` }
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
      return res.status(geminiResponse.status).json({ error: 'Gemini API error', details: errorText });
    }

    const data = await geminiResponse.json();
    const resultText = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

    if (!resultText) {
      console.error('[AI-Service] Empty response from Gemini API:', JSON.stringify(data));
      return res.status(502).json({ error: 'Bad Gateway: Empty response from AI provider' });
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
    console.error('[AI-Service] Execution error in generate-canvas-flow:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * POST /api/ai/moderate-group
 * Verifies JWT signature token and uses Gemini to analyze the icon (image), name, and description.
 */
app.post('/api/ai/moderate-group', async (req, res) => {
  try {
    const incomingSecret = req.headers['x-ai-service-secret'];
    const expectedSecret = process.env.AI_SERVICE_SECRET;

    if (!expectedSecret || incomingSecret !== expectedSecret) {
      console.warn(`[AI-Service] Unauthorized moderation attempt blocked. IP: ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing API secret' });
    }

    const { name, description, icon } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Bad Request: Group name is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
      console.error('[AI-Service] Configuration Error: GEMINI_API_KEY is not set.');
      return res.status(500).json({ error: 'Internal Server Error: AI provider key missing.' });
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    console.log(`[AI-Service] [Auth-Token Verified] Querying Gemini for group moderation (key suffix: ...${apiKey.slice(-5)})...`);

    // Parse base64 icon and mime type if present
    let imageBase64 = '';
    let mimeType = 'image/png';
    if (icon) {
      if (icon.startsWith('data:image')) {
        const parts = icon.split(';base64,');
        mimeType = parts[0].replace('data:', '');
        imageBase64 = parts[1];
      } else {
        imageBase64 = icon;
      }
    }

    const systemInstruction = 
      "You are a highly sophisticated, multilingual, and extremely strict content moderation AI. Analyze the group's name, description, and the uploaded icon image.\n" +
      "You must evaluate if the group name, description, or icon contains or promotes harmful topics, nudity, explicit/suggestive/adult content, references to sex workers, pornstars, or adult entertainment, illegal drugs, weapons, hate speech, or dangerous activities.\n" +
      "Context & Intent Rules:\n" +
      "1. ALLOW recovery, support, prevention, and purely educational or safety training groups (e.g., drug addiction rehabilitation, historical warfare research, gun safety education, youth prevention campaigns) with high scores (8-10) or moderate warning scores (5-7) IF their intent is clearly helpful, peaceful, and safety-oriented.\n" +
      "2. DETECT SNEAKY BYPASSES: If a group claims to be 'educational', 'scientific', or a 'discussion study' but its description or name actually describes or hints at trading, selling, distributing, or learning how to manufacture/obtain illegal substances, weapons, serial-number-free parts, adult dating/escort services, or self-harm/suicide instructions, you MUST flag it and score it strictly below 5 (1 to 4).\n" +
      "3. DOUBLE MEANINGS & EUPHEMISMS: Actively detect wordplay, innuendos, and slang terms used to bypass moderation (e.g., 'corn' or 'corny' used in place of 'porn' / 'pornography', or phrases like 'corn digging videos in hd and 4k quality' describing adult videos). If double meaning/suggestive context is found, reject immediately with a score below 5 (1 to 4).\n" +
      "4. MULTILINGUAL PROFANITY & TRANSLITERATED SLANG (CRITICAL): Detect offensive, vulgar, abusive, sexual, or explicit terms in languages other than English, particularly South Asian/Indian languages (such as Hindi, Bengali, Tamil, Telugu, etc.). This includes phonetic/transliterated spellings using English alphabets (e.g., 'xhude dibo', 'xude', 'chode', 'bhod', 'banchod', 'madarchod', 'gand', 'gandu', 'lund', 'loda', 'chut', 'choot', 'fudi', 'kela', etc.). If any such term or its close phonetic variation is used, reject it immediately (score 1 to 4).\n" +
      "5. Scoring Scale:\n" +
      "   - Safe (8 to 10 out of 10): Content is safe, healthy, or clearly positive support/educational with no harmful intent.\n" +
      "   - Warning (5 to 7 out of 10): Borderline content, mild themes, or positive groups discussing sensitive topics (e.g., weapon safety instruction, addiction recovery) where a warning label is appropriate but creation is allowed.\n" +
      "   - Rejected (1 to 4 out of 10): Explicitly harmful, illegal, sexual, abusive, promoting dangerous acts, containing multilingual profanity, double meanings, or attempting to mask illegal trade/distribution under educational/innocuous terms.\n" +
      "You MUST output a single valid JSON object following this schema:\n" +
      "{\n" +
      "  \"score\": 8,\n" +
      "  \"reason\": \"Detailed reason for this evaluation score\"\n" +
      "}\n" +
      "Rules:\n" +
      "1. Be extremely careful. If any single field is explicitly unsafe, contains multilingual profanity/slang, or is a sneaky/double-meaning bypass attempt, the overall score must be below 5.\n" +
      "2. The 'reason' field must clearly identify and explain the specific term, slang, double-meaning bypass, or image feature that was flagged (e.g., 'The name \"Xhude dibo admin\" contains a vulgar Bengali slang word.', or 'The description uses \"corn\" as a euphemism for \"porn\").'\n" +
      "3. Do not include markdown codeblocks or conversational filler. Output only raw valid JSON.";

    const parts = [
      { text: systemInstruction },
      { text: `Group Details to Moderate:\nName: ${name}\nDescription: ${description || '(No description)'}` }
    ];

    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: imageBase64
        }
      });
    }

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          response_mime_type: 'application/json'
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`[AI-Service] Gemini API returned status ${geminiResponse.status}:`, errorText);
      return res.status(geminiResponse.status).json({ error: 'Gemini API error', details: errorText });
    }

    const data = await geminiResponse.json();
    const resultText = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

    if (!resultText) {
      console.error('[AI-Service] Empty response from Gemini API:', JSON.stringify(data));
      return res.status(502).json({ error: 'Bad Gateway: Empty response from AI provider' });
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(cleanJsonResponse(resultText));
    } catch (parseError) {
      console.warn(`[AI-Service] Raw response text is not valid JSON:`, resultText);
      return res.status(502).json({ error: 'Bad Gateway: AI response is not valid JSON', raw: resultText });
    }

    res.status(200).json(parsedResult);
  } catch (error) {
    console.error('[AI-Service] Execution error in group moderation:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`🤖 Standalone AI Microservice running on port ${PORT}`);
  console.log(`👉 Health check active at GET http://localhost:${PORT}/health`);
  console.log(`👉 Generation endpoint active at POST http://localhost:${PORT}/api/ai/generate`);
  console.log(`👉 JWT Summary generation endpoint active at POST http://localhost:${PORT}/api/ai/generate-summary`);
  console.log(`👉 Voice parsing endpoint active at POST http://localhost:${PORT}/api/ai/voice-to-task`);
  console.log(`👉 Group moderation endpoint active at POST http://localhost:${PORT}/api/ai/moderate-group`);
});
