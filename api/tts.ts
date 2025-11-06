/**
 * Vercel Serverless Function for Cloud Text-to-Speech API
 *
 * This endpoint runs server-side and has access to environment variables.
 * It handles authentication and calls Google Cloud TTS on behalf of the client.
 *
 * Endpoint: POST /api/tts
 * Request: { text: string }
 * Response: { audio: string (base64), duration: number } | { error: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import type { protos } from '@google-cloud/text-to-speech';

// Initialize Cloud TTS client with service account credentials
let ttsClient: TextToSpeechClient | null = null;

const getClient = (): TextToSpeechClient => {
  if (!ttsClient) {
    const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!serviceAccountJson) {
      throw new Error('GCP_SERVICE_ACCOUNT_JSON environment variable is not set');
    }

    try {
      const credentials = JSON.parse(serviceAccountJson);
      const projectId = process.env.GCP_PROJECT_ID || credentials.project_id;

      console.log('🔧 Initializing Cloud TTS client (serverless)...');
      console.log('   Project ID:', projectId);
      console.log('   Service Account:', credentials.client_email);

      ttsClient = new TextToSpeechClient({
        credentials: credentials,
        projectId: projectId,
      });
    } catch (error) {
      console.error('❌ Failed to parse GCP_SERVICE_ACCOUNT_JSON:', error);
      throw new Error('Invalid GCP_SERVICE_ACCOUNT_JSON format');
    }
  }

  return ttsClient;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { text } = req.body;

    // Validate input
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Invalid request. "text" field is required.' });
    }

    if (text.length === 0) {
      return res.status(400).json({ error: 'Text cannot be empty.' });
    }

    if (text.length > 5000) {
      return res.status(400).json({ error: 'Text too long (max 5000 characters).' });
    }

    console.log('🎤 [API] Generating speech for text:', text.substring(0, 100) + '...');
    console.log('   Text length:', text.length, 'characters');
    console.log('   Estimated cost: $' + ((text.length / 1000000) * 16).toFixed(6));

    const client = getClient();

    // Configure the synthesis request
    const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
      input: { text: text },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Neural2-F', // Natural female voice (Neural2 quality)
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 24000, // 24kHz sample rate
        pitch: 0.0,
        speakingRate: 1.0,
      },
    };

    // Generate speech
    const [response] = await client.synthesizeSpeech(request);

    if (!response.audioContent) {
      console.error('❌ [API] Cloud TTS returned no audio content');
      return res.status(500).json({ error: 'Cloud TTS returned no audio content' });
    }

    // Convert audio content (Buffer) to base64 string
    const base64Audio = Buffer.from(response.audioContent).toString('base64');

    // Calculate approximate duration (24kHz, 16-bit, mono)
    // Duration = (base64 length * 3/4) / (sample rate * bytes per sample * channels)
    const audioBytes = base64Audio.length * 0.75; // base64 to bytes
    const duration = audioBytes / (24000 * 2 * 1); // 24kHz, 2 bytes per sample, mono

    console.log('✅ [API] Generated audio:', base64Audio.length, 'bytes (base64)');
    console.log('   Duration:', duration.toFixed(2), 'seconds');

    // Return audio to client
    return res.status(200).json({
      audio: base64Audio,
      duration: duration,
    });

  } catch (error) {
    console.error('❌ [API] Cloud TTS generation failed:', error);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
        return res.status(429).json({
          error: 'Quota exceeded. You have exhausted your Cloud TTS quota or credits.'
        });
      } else if (error.message.includes('PERMISSION_DENIED') || error.message.includes('credentials')) {
        return res.status(403).json({
          error: 'Authentication failed. Service account credentials may be invalid.'
        });
      }
    }

    // Generic error
    return res.status(500).json({
      error: 'Failed to generate speech: ' + (error instanceof Error ? error.message : 'Unknown error')
    });
  }
}
