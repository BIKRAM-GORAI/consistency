const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mongoose = require('mongoose');
const dns = require('dns');

// Solve Node.js DNS resolution issues with MongoDB Atlas SRV on some Windows environments
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn('Failed to set custom DNS servers:', err.message);
}

// Configure multer to store uploaded files in memory
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // limit to 10MB

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());

// ── Lazy MongoDB connection (only for cron routes that need DB) ──
let mongoConnected = false;
async function getMongoose() {
  if (!mongoConnected) {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI is not set in environment');
    await mongoose.connect(uri);
    mongoConnected = true;
  }
  return mongoose;
}

// ── Inline Mongoose schemas for LeetCode Sync (self-contained) ──
function getModels() {
  // Avoid re-compiling models on subsequent calls
  const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    username: String,
    leetcodeUsername: String,
    leetcodeAutoSync: { type: Boolean, default: false },
    subscriptionTier: { type: String, default: 'free' },
    subscriptionExpiresAt: Date,
    currentStreak: { type: Number, default: 0 },
    highestStreak: { type: Number, default: 0 },
    lastCompletedDate: String,
    lastActiveAt: Date,
    voiceAssistantCount: { type: Number, default: 0 },
    voiceAssistantResetTime: { type: Date, default: Date.now },
  }, { strict: false });

  const TaskSchema = new mongoose.Schema({
    title: String,
    completed: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  }, { strict: false });

  const CategorySchema = new mongoose.Schema({
    name: String,
    tasks: [TaskSchema]
  });

  const DaySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    categories: [CategorySchema],
    summary: { type: String, default: '' },
    graceApplied: { type: Boolean, default: false },
  }, { timestamps: true, strict: false });

  const User = mongoose.models.User || mongoose.model('User', UserSchema);
  const Day = mongoose.models.Day || mongoose.model('Day', DaySchema);
  return { User, Day };
}

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
    const match = cleaned.match(/^```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
    if (match) {
      cleaned = match[1].trim();
    }
  }
  
  // Remove any trailing backticks or formatting
  cleaned = cleaned.replace(/^`+|`+$/g, '').trim();
  
  return cleaned;
}

function repairTruncatedJson(jsonStr) {
  if (!jsonStr) return '{}';
  let str = cleanJsonResponse(jsonStr);

  try {
    JSON.parse(str);
    return str;
  } catch (_) {}

  // Auto-repair truncated JSON string
  let quotes = (str.match(/"/g) || []).length;
  if (quotes % 2 !== 0) {
    str += '"';
  }

  str = str.replace(/,?\s*$/, '');
  str = str.replace(/:\s*"?$/, ': ""');

  let openBrackets = (str.match(/\[/g) || []).length - (str.match(/\]/g) || []).length;
  let openBraces = (str.match(/\{/g) || []).length - (str.match(/\}/g) || []).length;

  for (let i = 0; i < Math.max(0, openBrackets); i++) str += ']';
  for (let i = 0; i < Math.max(0, openBraces); i++) str += '}';

  return str;
}

/**
 * Executes LLM prompt with automatic multi-model & cross-provider fallback:
 * 1. Primary Model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
 * 2. Groq Fallback 1: 'openai/gpt-oss-20b' (Fast 20B OpenAI OSS model)
 * 3. Groq Fallback 2: 'groq/compound' (70K TPM / NO Daily Token Limit)
 * 4. Groq Fallback 3: 'qwen/qwen3.6-27b'
 * 5. Cross-Provider Ultimate Fallback: Google Gemini API ('gemini-3.1-flash-lite', 1,000,000 TPM)
 */
async function queryLLMWithFallback({ systemPrompt, userPrompt, temperature = 0.1, max_tokens = 4096, jsonMode = false }) {
  const groqApiKey = process.env.GROQ_API_KEY;
  const primaryModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  const groqModels = [
    primaryModel,
    'openai/gpt-oss-20b',
    'groq/compound',
    'qwen/qwen3.6-27b'
  ].filter((v, i, a) => a.indexOf(v) === i);

  let lastError = null;

  // 1. Try Groq Model Fallback Chain
  if (groqApiKey) {
    for (const model of groqModels) {
      try {
        console.log(`[AI-Service] Attempting LLM query with Groq model: ${model}...`);
        const payload = {
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          max_tokens
        };
        if (jsonMode) {
          payload.response_format = { type: 'json_object' };
        }

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            console.log(`[AI-Service] LLM query SUCCESS using Groq model: ${model}`);
            return { content, provider: 'groq', model };
          }
        }

        const errText = await res.text();
        console.warn(`[AI-Service] Groq model ${model} status ${res.status}: ${errText}`);
        lastError = new Error(`Groq API (${model}) returned status ${res.status}: ${errText}`);

        // If rate limited (429) or service overload/error (5xx), fallback to next model
        if (res.status === 429 || res.status >= 500) {
          console.log(`[AI-Service] Rate limit or server error on ${model}. Switching to next fallback model...`);
          continue;
        } else {
          // If auth or bad request error, re-throw to break loop
          throw lastError;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[AI-Service] Error querying Groq model ${model}: ${err.message}`);
      }
    }
  }

  // 2. Ultimate Fallback: Google Gemini API (Cross-Provider Safety Net)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    console.log(`[AI-Service] Groq fallback models exhausted or rate-limited. Falling over to Google Gemini API (${geminiModel})...`);

    try {
      const bodyObj = {
        contents: [{
          parts: [
            { text: systemPrompt },
            { text: userPrompt }
          ]
        }]
      };
      if (jsonMode) {
        bodyObj.generationConfig = { response_mime_type: 'application/json' };
      }

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj)
      });

      if (geminiRes.ok) {
        const gData = await geminiRes.json();
        const gContent = gData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (gContent) {
          console.log(`[AI-Service] LLM query SUCCESS using Google Gemini fallback (${geminiModel})`);
          return { content: gContent, provider: 'gemini', model: geminiModel };
        }
      }
      const gErrText = await geminiRes.text();
      console.error(`[AI-Service] Gemini fallback API returned status ${geminiRes.status}: ${gErrText}`);
    } catch (gErr) {
      console.error(`[AI-Service] Gemini fallback execution error: ${gErr.message}`);
    }
  }

  throw lastError || new Error('All AI models and providers failed or hit rate limits.');
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

    const { content } = await queryLLMWithFallback({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      max_tokens: 1500,
      jsonMode: false
    });

    res.status(200).json({ result: content });
  } catch (error) {
    console.error('[AI-Service] Execution error in /api/ai/generate:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * POST /api/ai/generate-summary
 * Securely forwards completion requests to the AI provider using JWT authorization token verified by JWT_SECRET
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

    const { content } = await queryLLMWithFallback({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      max_tokens: 1500,
      jsonMode: false
    });

    res.status(200).json({ result: content });
  } catch (error) {
    console.error('[AI-Service] Execution error in /api/ai/generate-summary:', error);
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
    console.log('[AI-Service] Structuring voice transcript into daily tasks JSON...');

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

    const { content } = await queryLLMWithFallback({
      systemPrompt,
      userPrompt: `Analyze this voice transcription: "${transcript}"`,
      temperature: 0.1,
      max_tokens: 1500,
      jsonMode: true
    });

    let parsedResult;
    try {
      parsedResult = JSON.parse(cleanJsonResponse(content));
    } catch (parseError) {
      console.warn(`[AI-Service] Raw response text is not valid JSON:`, content);
      return res.status(502).json({ error: 'Bad Gateway: AI response is not valid JSON', raw: content });
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

// ══════════════════════════════════════════════════════════
//  GET /api/cron/sync-leetcode
//  Hosted on Render (no timeout limit) — called by external
//  cron scheduler (e.g. cron-job.org) once per day at ~00:05
// ══════════════════════════════════════════════════════════

// ── Streak helper functions (inlined from main backend) ──
function countCompletedTasks(categories) {
  let completed = 0;
  for (const cat of (categories || [])) {
    if (cat.name === 'LeetCode') continue; // LeetCode doesn't affect standard completion streak
    for (const task of (cat.tasks || [])) {
      if (task.completed) completed++;
    }
  }
  return completed;
}

function getUniqueDaysWithCompletions(days) {
  const dayMap = {};
  for (const d of days) {
    const completed = countCompletedTasks(d.categories) > 0 || !!d.graceApplied;
    if (dayMap[d.date] !== undefined) {
      dayMap[d.date] = dayMap[d.date] || completed;
    } else {
      dayMap[d.date] = completed;
    }
  }
  return Object.keys(dayMap).map(date => ({ date, completed: dayMap[date] }));
}

function calculateCurrentStreak(days, clientDate) {
  if (!days || !days.length) return 0;
  const uniqueDays = getUniqueDaysWithCompletions(days);
  uniqueDays.sort((a, b) => b.date.localeCompare(a.date));
  const d = new Date();
  const serverToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let today = clientDate || serverToday;

  let streak = 0;
  let checkDate = today;
  const todayDay = uniqueDays.find(d => d.date === today);
  const todayDone = todayDay && todayDay.completed;

  if (!todayDone) {
    const [y, m, dayNum] = checkDate.split('-').map(Number);
    const prev = new Date(y, m - 1, dayNum - 1);
    checkDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
  }

  for (const day of uniqueDays) {
    if (day.date > checkDate) continue;
    if (day.date < checkDate) break;
    if (day.completed) {
      streak++;
      const [y, m, dayNum] = checkDate.split('-').map(Number);
      const prev = new Date(y, m - 1, dayNum - 1);
      checkDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    } else {
      break;
    }
  }
  return streak;
}

function calculateHighestStreak(days, clientDate) {
  if (!days || !days.length) return 0;
  const d = new Date();
  const serverToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = clientDate || serverToday;
  const pastAndPresentDays = days.filter(day => day.date <= today);
  const uniqueDays = getUniqueDaysWithCompletions(pastAndPresentDays);
  uniqueDays.sort((a, b) => a.date.localeCompare(b.date));

  let maxStreak = 0;
  let curStreak = 0;
  let prevDate = null;

  for (const day of uniqueDays) {
    if (!day.completed) { curStreak = 0; prevDate = null; continue; }
    if (prevDate === null) {
      curStreak = 1;
    } else {
      const [py, pm, pd] = prevDate.split('-').map(Number);
      const [cy, cm, cd] = day.date.split('-').map(Number);
      const diffMs = new Date(cy, cm - 1, cd) - new Date(py, pm - 1, pd);
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      curStreak = diffDays === 1 ? curStreak + 1 : 1;
    }
    prevDate = day.date;
    if (curStreak > maxStreak) maxStreak = curStreak;
  }
  return maxStreak;
}

async function updateStreakForUser(User, Day, userId, yesterdayStr) {
  const days = await Day.find({ userId }).select('date categories graceApplied');
  const currentStreak = calculateCurrentStreak(days, yesterdayStr);
  const highestStreak = calculateHighestStreak(days, yesterdayStr);
  const mostRecentCompletedDay = days
    .filter(d => countCompletedTasks(d.categories) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastCompletedDate = mostRecentCompletedDay ? mostRecentCompletedDay.date : null;

  await User.findByIdAndUpdate(userId, {
    currentStreak,
    highestStreak,
    lastCompletedDate,
    lastActiveAt: new Date()
  });
  return currentStreak;
}

// ── LeetCode Direct GraphQL Helper ──
async function fetchLeetCodeSubmissions(username, limit = 20) {
  const query = `
    query getRecentAcSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        title
        titleSlug
        timestamp
      }
    }
  `;
  try {
    const resp = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://leetcode.com'
      },
      body: JSON.stringify({ query, variables: { username, limit: Number(limit) || 20 } }),
      signal: AbortSignal.timeout(10000)
    });
    if (resp.ok) {
      const data = await resp.json();
      const list = data?.data?.recentAcSubmissionList;
      if (Array.isArray(list)) {
        return list.map(sub => ({
          title: sub.title,
          titleSlug: sub.titleSlug,
          timestamp: sub.timestamp,
          statusDisplay: 'Accepted'
        }));
      }
    }
  } catch (err) {
    console.warn(`Direct GraphQL fetch failed for ${username}, trying fallback:`, err.message);
  }

  // Fallback to Alfa API
  const url = `https://alfa-leetcode-api.onrender.com/${encodeURIComponent(username)}/acSubmission?limit=${limit}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`LeetCode API error: ${resp.status}`);
  const data = await resp.json();
  return data.submission || [];
}

async function fetchProblemDifficulty(titleSlug) {
  const query = `
    query getQuestionDetails($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        difficulty
      }
    }
  `;
  try {
    const resp = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://leetcode.com'
      },
      body: JSON.stringify({ query, variables: { titleSlug } }),
      signal: AbortSignal.timeout(10000)
    });
    if (resp.ok) {
      const data = await resp.json();
      const diff = data?.data?.question?.difficulty;
      if (diff) return diff;
    }
  } catch (err) {
    console.warn(`Direct GraphQL difficulty fetch failed for ${titleSlug}, trying fallback:`, err.message);
  }

  // Fallback to Alfa API
  const url = `https://alfa-leetcode-api.onrender.com/select?titleSlug=${encodeURIComponent(titleSlug)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) return 'Medium';
  const data = await resp.json();
  return data.difficulty || 'Medium';
}

// ── The cron endpoint ──
app.get('/api/cron/sync-leetcode', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Respond immediately to prevent Vercel/cron timeouts
  res.status(202).json({ message: 'LeetCode auto-sync started in the background.' });

  // Run the rest of the sync process asynchronously in the background
  (async () => {
    try {
      await getMongoose();
      const { User, Day } = getModels();

      // Determine yesterday in server timezone
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const targetYear = yesterday.getFullYear();
      const targetMonth = yesterday.getMonth();   // 0-indexed
      const targetDay = yesterday.getDate();
      const yesterdayStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

      console.log(`[LeetCode Auto-Sync] [Background] Running for date: ${yesterdayStr}`);

      // Find all users with auto-sync enabled and a connected LeetCode username
      const eligibleUsers = await User.find({
        leetcodeUsername: { $ne: null, $exists: true },
        leetcodeAutoSync: true
      }).lean(false); // lean(false) keeps save() method

      console.log(`[LeetCode Auto-Sync] [Background] ${eligibleUsers.length} eligible users found.`);

      const results = [];

      for (const user of eligibleUsers) {
        // Throttle: 600ms between external API calls to avoid rate-limiting
        await new Promise(r => setTimeout(r, 600));

        try {
          const submissions = await fetchLeetCodeSubmissions(user.leetcodeUsername, 25);

          // Filter for accepted submissions made yesterday (server timezone)
          const yesterdaySubmissions = submissions.filter(sub => {
            if (sub.statusDisplay !== 'Accepted') return false;
            const subDate = new Date(parseInt(sub.timestamp) * 1000);
            return subDate.getFullYear() === targetYear &&
                   subDate.getMonth() === targetMonth &&
                   subDate.getDate() === targetDay;
          });

          // Deduplicate by titleSlug (keep first Accepted per problem)
          const seenSlugs = new Set();
          const uniqueSubmissions = yesterdaySubmissions.filter(sub => {
            if (seenSlugs.has(sub.titleSlug)) return false;
            seenSlugs.add(sub.titleSlug);
            return true;
          });

          console.log(`[LeetCode Auto-Sync] [Background] ${user.username || user.email}: ${uniqueSubmissions.length} problems solved yesterday.`);

          if (uniqueSubmissions.length === 0) {
            results.push({ user: user.username || user.email, synced: 0, status: 'No new submissions' });
            continue;
          }

          // Load or create yesterday's Day document
          let dayDoc = await Day.findOne({ userId: user._id, date: yesterdayStr });
          if (!dayDoc) {
            dayDoc = new Day({ userId: user._id, date: yesterdayStr, categories: [] });
          }

          // Ensure LeetCode category exists
          let lcCategory = dayDoc.categories.find(c => c.name === 'LeetCode');
          if (!lcCategory) {
            dayDoc.categories.push({ name: 'LeetCode', tasks: [] });
            lcCategory = dayDoc.categories[dayDoc.categories.length - 1];
          }

          let tasksAdded = 0;

          for (const sub of uniqueSubmissions) {
            const taskTitle = `🧠 LeetCode: ${sub.title}`;

            // Skip if already present (idempotent)
            const alreadyExists = lcCategory.tasks.some(t =>
              (t.metadata && t.metadata.problemUrl && t.metadata.problemUrl.includes(sub.titleSlug)) ||
              t.title === taskTitle
            );
            if (alreadyExists) continue;

            // Fetch difficulty with throttle
            await new Promise(r => setTimeout(r, 400));
            let difficulty = 'Medium';
            try {
              difficulty = await fetchProblemDifficulty(sub.titleSlug);
            } catch (_) {}

            lcCategory.tasks.push({
              title: taskTitle,
              completed: true,
              metadata: {
                problemUrl: `https://leetcode.com/problems/${sub.titleSlug}/`,
                difficulty,
                acceptedDate: yesterdayStr,
                autoSynced: true,
                verified: true
              }
            });
            tasksAdded++;
          }

          if (tasksAdded > 0) {
            await dayDoc.save();
            await updateStreakForUser(User, Day, user._id, yesterdayStr);
            console.log(`[LeetCode Auto-Sync] [Background] Saved ${tasksAdded} tasks for ${user.username || user.email}.`);
          }

          results.push({ user: user.username || user.email, synced: tasksAdded, status: 'OK' });

        } catch (userErr) {
          console.error(`[LeetCode Auto-Sync] [Background] Error for ${user.username || user.email}:`, userErr.message);
          results.push({ user: user.username || user.email, synced: 0, status: 'Error', error: userErr.message });
        }
      }

      console.log(`[LeetCode Auto-Sync] [Background] Finished. Date: ${yesterdayStr}, Processed Count: ${eligibleUsers.length}`);

    } catch (err) {
      console.error('[LeetCode Auto-Sync] [Background] Fatal error:', err);
    }
  })();
});

// ── Centralized AI Voice Assistant Endpoint ──
/**
 * Centralized AI Voice Assistant Endpoint
 * Hosted on Render to prevent 10s serverless timeout issues.
 * Accepts audio file -> Transcribes with Groq Whisper -> Extracts Goals & Daily Cards with LLM -> Inserts into MongoDB.
 */
app.post('/process-voice-command', (req, res, next) => {
  const cType = req.headers['content-type'] || '';
  if (cType.includes('multipart/form-data')) {
    return upload.single('audio')(req, res, next);
  }
  next();
}, async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.body?.token || req.query?.token;
    const jwtSecret = process.env.JWT_SECRET;

    if (!token || !jwtSecret) {
      return res.status(401).json({ error: 'Unauthorized: Missing verification token or server secret.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired generation token.' });
    }

    if (decoded.action !== 'voice_assistant' || !decoded.userId) {
      return res.status(403).json({ error: 'Forbidden: Ticket token action is invalid.' });
    }

    const userIdStr = decoded.userId;

    let transcript = (req.body?.textPrompt || req.body?.text || '').trim();

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.status(500).json({ error: 'Configuration Error: GROQ_API_KEY missing from environment.' });
    }

    if (!transcript) {
      // If no text prompt provided, require audio file and transcribe via Groq Whisper API
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'Bad Request: Either textPrompt or audio file is required.' });
      }

      console.log(`[AI-Service] [Voice Assistant] Transcribing ${req.file.size} bytes audio clip for user ${userIdStr}...`);

      const formData = new FormData();
      const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' });
      formData.append('file', audioBlob, req.file.originalname || 'speech.webm');
      formData.append('model', 'whisper-large-v3');
      formData.append('temperature', '0.0');

      const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`
        },
        body: formData
      });

      if (!whisperRes.ok) {
        const errText = await whisperRes.text();
        console.error(`[AI-Service] Groq Whisper error ${whisperRes.status}:`, errText);
        return res.status(500).json({ error: 'Failed to transcribe audio clip.', details: errText });
      }

      const whisperData = await whisperRes.json();
      transcript = (whisperData.text || '').trim();
    } else {
      console.log(`[AI-Service] [Voice Assistant] Direct text prompt received for user ${userIdStr}: "${transcript}"`);
    }

    if (!transcript) {
      return res.status(200).json({
        success: false,
        message: 'No text or speech content detected.',
        goals: [],
        dailyCards: []
      });
    }

    console.log(`[AI-Service] [Voice Assistant] Effective Transcript: "${transcript}"`);

    // Calculate dates
    const todayObj = new Date();
    const todayStr = todayObj.toISOString().split('T')[0];
    
    // Default 2-month target date
    const twoMonthsDate = new Date(todayObj);
    twoMonthsDate.setMonth(twoMonthsDate.getMonth() + 2);
    const twoMonthsDefaultStr = twoMonthsDate.toISOString().split('T')[0];

    // 2. Prompt LLM to extract Goals and Daily Cards
    // 2. Prompt LLM to extract Goals and Daily Cards
    const modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    const systemPrompt = 
      `You are an AI Personal Goal & Productivity Coach for a habit tracking application.\n` +
      `Today's date is ${todayStr} (YYYY-MM-DD).\n\n` +
      `Analyze the user's spoken voice transcript below:\n` +
      `"${transcript}"\n\n` +
      `Extract and structure two types of items into a SINGLE JSON object:\n\n` +
      `1. "goals" (Array of long-term goals/aspirations):\n` +
      `   - "title": Concise, inspiring goal title.\n` +
      `   - "deadline": Target completion date in YYYY-MM-DD format.\n` +
      `     * If user explicitly mentioned a target timeline (e.g., "30 days", "in 1 year", "6 months", "by December"), compute the exact YYYY-MM-DD date from ${todayStr}.\n` +
      `     * IF THE USER HAS NOT SPECIFIED A TIMELINE, DEFAULT THE DEADLINE TO EXACTLY 2 MONTHS FROM TODAY (${twoMonthsDefaultStr}).\n` +
      `   - "tasks": Array of CONCISE, ACTIONABLE, AND PROGRESSABLE subtasks to achieve this goal.\n` +
      `     * CRITICAL SUBTASK RULES (MAX 12 SUBTASKS PER GOAL):\n` +
      `       a) FOR DAILY HABITS (e.g., "walk 30 mins daily", "read 20 pages every night", "exercise every day"): Do NOT list out 30 identical daily lines. Instead, group by WEEKLY MILESTONES (e.g., "Week 1: Walk 30 mins daily", "Week 2: Walk 30 mins daily", "Week 3: Walk 30 mins daily", "Week 4: Walk 30 mins daily").\n` +
      `       b) FOR DAILY / QUANTITATIVE CHALLENGES (e.g., "30 DSA in 30 days", "100 problems in 100 days"): Generate a maximum of 10 to 12 representative, progressable milestone subtasks (e.g., "Day 1-3: Arrays & Strings", "Day 4-7: Two Pointers & Sliding Window", ..., "Day 25-30: Dynamic Programming & Capstone").\n` +
      `       c) FOR LONG-TERM MULTI-MONTH / YEARLY GOALS: Break down subtasks BY MONTH OR WEEK (e.g., "Month 1: HTML, CSS & JS", "Month 2: React Architecture").\n` +
      `       d) MAXIMUM 12 SUBTASKS PER GOAL. Keep each subtask title short, actionable, and under 80 characters.\n\n` +
      `2. "dailyCards" (Array of daily tasks/activities for today and upcoming days):\n` +
      `   - "date": YYYY-MM-DD date of the task (e.g. today ${todayStr}, tomorrow, etc.).\n` +
      `   - "category": Category name (e.g., "Tasks", "Work", "Personal", "Study", "Fitness"). Default to "Tasks".\n` +
      `   - "taskTitle": Actionable task title starting with a verb.\n` +
      `   - STRICT RULES FOR DAILY CARDS:\n` +
      `     * MUST ONLY BE FOR TODAY (${todayStr}) AND FUTURE DATES. DO NOT ALTER OR CREATE TASKS FOR PAST DATES.\n` +
      `     * MAXIMUM OF 7 DAILY CARDS/TASKS TOTAL IN THIS REQUEST. If user mentioned more than 7, select the top 7 most important ones.\n\n` +
      `3. "summary": A friendly 1-sentence summary of what goals and daily tasks were extracted.\n\n` +
      `You MUST output ONLY a valid JSON object matching this schema:\n` +
      `{\n` +
      `  "goals": [\n` +
      `    {\n` +
      `      "title": "Goal Title",\n` +
      `      "deadline": "YYYY-MM-DD",\n` +
      `      "tasks": ["Subtask 1", "Subtask 2"]\n` +
      `    }\n` +
      `  ],\n` +
      `  "dailyCards": [\n` +
      `    {\n` +
      `      "date": "YYYY-MM-DD",\n` +
      `      "category": "Tasks",\n` +
      `      "taskTitle": "Task description"\n` +
      `    }\n` +
      `  ],\n` +
      `  "summary": "Summary string"\n` +
      `}\n`;

    const { content: rawContent } = await queryLLMWithFallback({
      systemPrompt,
      userPrompt: `Voice transcript: "${transcript}"`,
      temperature: 0.1,
      max_tokens: 4096,
      jsonMode: true
    });

    let cleanedText = cleanJsonResponse(rawContent);

    let parsed = { goals: [], dailyCards: [], summary: '' };
    try {
      parsed = JSON.parse(cleanedText);
    } catch (pErr) {
      console.warn('[AI-Service] Initial JSON parse failed, attempting auto-repair on truncated response...');
      try {
        const repairedText = repairTruncatedJson(rawContent);
        parsed = JSON.parse(repairedText);
        console.log('[AI-Service] JSON successfully auto-repaired!');
      } catch (repairErr) {
        console.error('[AI-Service] Failed to parse JSON from LLM:', cleanedText);
        return res.status(500).json({ error: 'Invalid structured response from AI.', raw: cleanedText });
      }
    }

    // Increment usage quota token in MongoDB upon successful AI response generation
    let generationsLeft = 0;
    try {
      await getMongoose();
      const { User } = getModels();
      const userDoc = await User.findById(userIdStr);

      if (userDoc) {
        const now = new Date();
        const lastReset = userDoc.voiceAssistantResetTime ? new Date(userDoc.voiceAssistantResetTime) : new Date(0);
        if (now.toDateString() !== lastReset.toDateString()) {
          userDoc.voiceAssistantCount = 0;
          userDoc.voiceAssistantResetTime = now;
        }

        userDoc.voiceAssistantCount = (userDoc.voiceAssistantCount || 0) + 1;

        const isPrem = userDoc.subscriptionTier === 'premium' && (!userDoc.subscriptionExpiresAt || new Date(userDoc.subscriptionExpiresAt) > new Date());
        if (isPrem) {
          if (!userDoc.premiumUsageLogs) userDoc.premiumUsageLogs = [];
          userDoc.premiumUsageLogs.forEach(log => {
            if (!log.actionType || !['voice_parse', 'grace_apply', 'photo_extract', 'voice_assistant'].includes(log.actionType)) {
              log.actionType = 'voice_parse';
            }
          });
          userDoc.premiumUsageLogs.push({
            actionType: 'voice_assistant',
            timestamp: new Date(),
            details: 'Executed Centralized AI Voice Command',
            razorpayPaymentId: userDoc.razorpayPaymentId
          });
        }
        userDoc.markModified('voiceAssistantCount');
        userDoc.markModified('voiceAssistantResetTime');
        if (isPrem) userDoc.markModified('premiumUsageLogs');
        await userDoc.save();

        const limit = isPrem ? (parseInt(process.env.PREMIUM_DAILY_VOICE_LIMIT, 10) || 5) : (parseInt(process.env.FREE_DAILY_VOICE_LIMIT, 10) || 2);
        generationsLeft = Math.max(0, limit - userDoc.voiceAssistantCount);
        console.log(`[AI-Service] [Voice Assistant Quota] Deducted 1 token for user ${userIdStr}. Remaining: ${generationsLeft}/${limit}`);
      }
    } catch (uErr) {
      console.warn('[AI-Service] Failed to increment voice count on userDoc:', uErr.message);
    }

    return res.status(200).json({
      success: true,
      transcription: transcript,
      goals: parsed.goals || [],
      dailyCards: parsed.dailyCards || [],
      summary: parsed.summary || `Extracted ${parsed.goals?.length || 0} goal(s) and ${parsed.dailyCards?.length || 0} daily task(s).`,
      generationsLeft
    });

  } catch (err) {
    console.error('[AI-Service] process-voice-command error:', err);
    return res.status(500).json({ error: 'Internal Server Error during voice assistant processing.', details: err.message });
  }
});

/**
 * Commit User-Confirmed Voice Assistant Items
 * Saves user-edited and approved Goals and Daily Cards to MongoDB.
 */
app.post('/commit-voice-command', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.body?.token || req.query?.token;
    const jwtSecret = process.env.JWT_SECRET;

    if (!token || !jwtSecret) {
      return res.status(401).json({ error: 'Unauthorized: Missing verification token.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized: Token expired or invalid.' });
    }

    if (decoded.action !== 'voice_assistant' || !decoded.userId) {
      return res.status(403).json({ error: 'Forbidden: Ticket action invalid.' });
    }

    const userIdStr = decoded.userId;
    const { goals, dailyCards } = req.body || {};

    await getMongoose();
    const { User, Day } = getModels();

    const GoalSchema = new mongoose.Schema({
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      title: { type: String, required: true },
      deadline: { type: Date, required: true },
      tasks: [{ title: String, completed: { type: Boolean, default: false } }],
      completedAt: Date
    }, { timestamps: true, strict: false });
    const Goal = mongoose.models.Goal || mongoose.model('Goal', GoalSchema);

    const userIdObj = new mongoose.Types.ObjectId(userIdStr);
    const todayObj = new Date();
    const todayStr = todayObj.toISOString().split('T')[0];
    const twoMonthsDate = new Date(todayObj);
    twoMonthsDate.setMonth(twoMonthsDate.getMonth() + 2);

    const createdGoals = [];
    if (Array.isArray(goals)) {
      for (const g of goals) {
        if (!g.title) continue;
        let dDate = g.deadline ? new Date(g.deadline) : null;
        if (!dDate || isNaN(dDate.getTime())) {
          dDate = twoMonthsDate;
        }
        const goalSubtasks = (Array.isArray(g.tasks) ? g.tasks : []).map(st => ({
          title: typeof st === 'string' ? st : (st.title || 'Subtask'),
          completed: false
        }));

        const newGoal = await Goal.create({
          userId: userIdObj,
          title: g.title,
          deadline: dDate,
          tasks: goalSubtasks
        });
        createdGoals.push(newGoal);
      }
    }

    const createdDailyCards = [];
    if (Array.isArray(dailyCards)) {
      const validDailyTasks = dailyCards
        .filter(c => c.date && c.taskTitle && c.date >= todayStr)
        .slice(0, 7);

      for (const c of validDailyTasks) {
        let dayDoc = await Day.findOne({ userId: userIdObj, date: c.date });
        const catName = c.category || 'Tasks';
        if (!dayDoc) {
          dayDoc = new Day({
            userId: userIdObj,
            date: c.date,
            categories: [{ name: catName, tasks: [{ title: c.taskTitle, completed: false }] }]
          });
        } else {
          if (!dayDoc.categories) dayDoc.categories = [];
          let targetCat = dayDoc.categories.find(cat => cat.name && cat.name.toLowerCase() === catName.toLowerCase());
          if (!targetCat) {
            dayDoc.categories.push({ name: catName, tasks: [{ title: c.taskTitle, completed: false }] });
          } else {
            targetCat.tasks.push({ title: c.taskTitle, completed: false });
          }
        }
        await dayDoc.save();
        createdDailyCards.push({ date: c.date, category: catName, taskTitle: c.taskTitle });
      }
    }

    console.log(`[AI-Service] [Voice Assistant Commit] Successfully committed items for user ${userIdStr}! Goals: ${createdGoals.length}, DailyCards: ${createdDailyCards.length}`);

    return res.status(200).json({
      success: true,
      goals: createdGoals,
      dailyCards: createdDailyCards,
      summary: `Successfully created ${createdGoals.length} goal(s) and ${createdDailyCards.length} daily task(s).`
    });

  } catch (err) {
    console.error('[AI-Service] commit-voice-command error:', err);
    return res.status(500).json({ error: 'Internal Server Error during voice assistant commit.', details: err.message });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`🤖 Standalone AI Microservice running on port ${PORT}`);
  console.log(`👉 Health check active at GET http://localhost:${PORT}/health`);
  console.log(`👉 Generation endpoint active at POST http://localhost:${PORT}/api/ai/generate`);
  console.log(`👉 JWT Summary generation endpoint active at POST http://localhost:${PORT}/api/ai/generate-summary`);
  console.log(`👉 Voice parsing endpoint active at POST http://localhost:${PORT}/api/ai/voice-to-task`);
  console.log(`👉 Centralized Voice Assistant active at POST http://localhost:${PORT}/process-voice-command`);
  console.log(`👉 Group moderation endpoint active at POST http://localhost:${PORT}/api/ai/moderate-group`);
  console.log(`👉 LeetCode sync cron active at GET http://localhost:${PORT}/api/cron/sync-leetcode`);
});
