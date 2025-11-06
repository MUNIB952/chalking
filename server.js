/**
 * Express Server for Google Cloud Run
 *
 * This server:
 * 1. Serves the built Vite React app (static files from /dist)
 * 2. Handles /api/tts endpoint (Cloud Text-to-Speech)
 * 3. Runs on port 8080 (Cloud Run standard)
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json({ limit: '10mb' }));

// Initialize Cloud TTS client
let ttsClient = null;

const getClient = () => {
  if (!ttsClient) {
    const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!serviceAccountJson) {
      throw new Error('GCP_SERVICE_ACCOUNT_JSON environment variable is not set');
    }

    try {
      const credentials = JSON.parse(serviceAccountJson);
      const projectId = process.env.GCP_PROJECT_ID || credentials.project_id;

      ttsClient = new TextToSpeechClient({
        projectId,
        credentials,
      });

      console.log(`✅ Cloud TTS client initialized for project: ${projectId}`);
    } catch (error) {
      console.error('❌ Failed to initialize Cloud TTS client:', error);
      throw new Error('Invalid GCP credentials JSON format');
    }
  }
  return ttsClient;
};

// API Routes
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log(`🎤 TTS request: "${text.substring(0, 50)}..." (${text.length} chars)`);

    const client = getClient();

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
  console.log(`🔊 TTS API available at: POST /api/tts`);
});
