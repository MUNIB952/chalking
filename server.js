/**
 * Express Server for Google Cloud Run
 *
 * This server:
 * 1. Serves the built Vite React app (static files from /dist)
 * 2. Handles /api/tts endpoint (Cloud Text-to-Speech)
 * 3. Handles /api/generate endpoint (Vertex AI Gemini)
 * 4. Runs on port 8080 (Cloud Run standard)
 *
 * Uses ONE service account for both TTS and Gemini (GCP_SERVICE_ACCOUNT_JSON)
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json({ limit: '10mb' }));

// Initialize Cloud TTS client
let ttsClient = null;
let vertexAIClient = null;
let gcpCredentials = null;
let gcpProjectId = null;

const initializeGCPCredentials = () => {
  if (!gcpCredentials) {
    const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!serviceAccountJson) {
      throw new Error('GCP_SERVICE_ACCOUNT_JSON environment variable is not set');
    }

    try {
      gcpCredentials = JSON.parse(serviceAccountJson);
      gcpProjectId = process.env.GCP_PROJECT_ID || gcpCredentials.project_id;
      console.log(`✅ GCP credentials loaded for project: ${gcpProjectId}`);
    } catch (error) {
      console.error('❌ Failed to parse GCP credentials:', error);
      throw new Error('Invalid GCP credentials JSON format');
    }
  }
  return { credentials: gcpCredentials, projectId: gcpProjectId };
};

const getTTSClient = () => {
  if (!ttsClient) {
    const { credentials, projectId } = initializeGCPCredentials();
    ttsClient = new TextToSpeechClient({
      projectId,
      credentials,
    });
    console.log(`✅ Cloud TTS client initialized`);
  }
  return ttsClient;
};

const getVertexAIClient = () => {
  if (!vertexAIClient) {
    const { credentials, projectId } = initializeGCPCredentials();

    // Set service account credentials in environment for @google/genai
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(credentials);

    vertexAIClient = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location: 'us-central1',
    });
    console.log(`✅ Vertex AI client initialized for project: ${projectId}`);
  }
  return vertexAIClient;
};

// API Routes

// Vertex AI Gemini endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { model, contents, config } = req.body;

    if (!model || !contents) {
      return res.status(400).json({ error: 'model and contents are required' });
    }

    console.log(`🤖 Vertex AI request: model=${model}`);

    const client = getVertexAIClient();

    const response = await client.models.generateContent({
      model,
      contents,
      config,
    });

    console.log(`✅ Vertex AI response received`);

    return res.status(200).json({
      text: response.text,
      candidates: response.candidates,
    });

  } catch (error) {
    console.error('❌ Vertex AI Error:', error);
    return res.status(500).json({
      error: 'Failed to generate content',
      details: error.message
    });
  }
});

// Vertex AI Gemini STREAMING endpoint
app.post('/api/generate-stream', async (req, res) => {
  try {
    const { model, contents, config } = req.body;

    if (!model || !contents) {
      return res.status(400).json({ error: 'model and contents are required' });
    }

    console.log(`🌊 Vertex AI STREAMING request: model=${model}`);

    const client = getVertexAIClient();

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await client.models.generateContentStream({
      model,
      contents,
      config,
    });

    // Stream chunks to client
    for await (const chunk of stream) {
      const chunkText = chunk.text || '';
      // Send as Server-Sent Event
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }

    // Signal end of stream
    res.write('data: [DONE]\n\n');
    res.end();

    console.log(`✅ Vertex AI streaming complete`);

  } catch (error) {
    console.error('❌ Vertex AI Streaming Error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// Cloud TTS endpoint
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log(`🎤 TTS request: "${text.substring(0, 50)}..." (${text.length} chars)`);

    const client = getTTSClient();

    const request = {
      input: { text },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Wavenet-C',
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 24000,
      },
    };

    const [response] = await client.synthesizeSpeech(request);

    if (!response.audioContent) {
      throw new Error('No audio content received from TTS API');
    }

    const base64Audio = Buffer.from(response.audioContent).toString('base64');
    const duration = base64Audio.length / (24000 * 2); // Rough estimate

    console.log(`✅ TTS generated: ${duration.toFixed(2)}s, ${base64Audio.length} bytes`);

    return res.status(200).json({
      audio: base64Audio,
      duration
    });

  } catch (error) {
    console.error('❌ TTS Error:', error);
    return res.status(500).json({
      error: 'Failed to generate speech',
      details: error.message
    });
  }
});

// Health check endpoint (Cloud Run requirement)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve static files from Vite build
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Serving static files from: ${path.join(__dirname, 'dist')}`);
  console.log(`🤖 Vertex AI Gemini available at: POST /api/generate`);
  console.log(`🔊 Cloud TTS available at: POST /api/tts`);
  console.log(`✅ Using unified service account for all Google Cloud APIs`);
});
