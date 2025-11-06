/**
 * Cloud Text-to-Speech Service using Vertex AI
 *
 * This service uses Google Cloud's production Text-to-Speech API with:
 * - 1,000 requests/minute rate limit (100x better than AI Studio)
 * - WaveNet voices for high-quality, natural speech
 * - Service account authentication via Vertex AI
 * - Clear pricing: $16 per 1M characters
 *
 * With $300 Google Cloud credit: ~18.75M characters = 7,500+ full explanations
 */

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import type { protos } from '@google-cloud/text-to-speech';

// Service account credentials from environment
const getServiceAccountCredentials = () => {
  const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error('GCP_SERVICE_ACCOUNT_JSON environment variable is not set');
  }

  try {
    return JSON.parse(serviceAccountJson);
  } catch (error) {
    console.error('Failed to parse GCP_SERVICE_ACCOUNT_JSON:', error);
    throw new Error('Invalid GCP_SERVICE_ACCOUNT_JSON format');
  }
};

// Initialize Cloud TTS client with service account
const initializeClient = () => {
  try {
    const credentials = getServiceAccountCredentials();
    const projectId = process.env.GCP_PROJECT_ID || credentials.project_id;

    console.log('🔧 Initializing Cloud TTS client...');
    console.log('   Project ID:', projectId);
    console.log('   Service Account:', credentials.client_email);

    const client = new TextToSpeechClient({
      credentials: credentials,
      projectId: projectId,
    });

    return client;
  } catch (error) {
    console.error('❌ Failed to initialize Cloud TTS client:', error);
    throw error;
  }
};

// Lazy initialization - only create client when needed
let ttsClient: TextToSpeechClient | null = null;

const getClient = (): TextToSpeechClient => {
  if (!ttsClient) {
    ttsClient = initializeClient();
  }
  return ttsClient;
};

/**
 * Generate speech using Cloud Text-to-Speech API
 * Returns base64-encoded PCM audio compatible with existing audio playback system
 *
 * @param text - Text to convert to speech (no length limit, but billed per character)
 * @returns Base64-encoded PCM audio data or null if generation fails
 */
export const generateSpeech = async (text: string): Promise<string | null> => {
  if (!text) {
    console.warn('⚠️  Empty text provided to generateSpeech');
    return null;
  }

  try {
    console.log('🎤 Generating speech with Cloud TTS for text:', text.substring(0, 100) + '...');
    console.log('   Text length:', text.length, 'characters');
    console.log('   Estimated cost: $' + ((text.length / 1000000) * 16).toFixed(6), '(WaveNet pricing)');

    const client = getClient();

    // Configure the synthesis request
    const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
      input: { text: text },
      voice: {
        // Use WaveNet for high-quality, natural speech
        // WaveNet voices are more expensive but sound significantly better than Standard
        languageCode: 'en-US',
        name: 'en-US-Neural2-F', // Natural female voice (Neural2 is latest generation)
        // Alternatively: 'en-US-Wavenet-F' for WaveNet quality
      },
      audioConfig: {
        // Return LINEAR16 PCM audio to match Gemini TTS format
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 24000, // 24kHz sample rate (high quality)
        pitch: 0.0, // Normal pitch
        speakingRate: 1.0, // Normal speaking rate
      },
    };

    // Generate speech
    const [response] = await client.synthesizeSpeech(request);

    if (!response.audioContent) {
      console.error('❌ Cloud TTS returned no audio content');
      return null;
    }

    // Convert audio content (Buffer) to base64 string
    const base64Audio = Buffer.from(response.audioContent).toString('base64');

    console.log('✅ Generated PCM base64 audio length:', base64Audio.length);
    console.log('   Audio format: LINEAR16 PCM, 24kHz');
    console.log('   Voice: en-US-Neural2-F (Neural2 quality)');

    return base64Audio;

  } catch (error) {
    console.error('❌ Cloud TTS speech generation failed:', error);

    // Check for quota errors
    if (error instanceof Error) {
      if (error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
        console.error('💸 QUOTA EXCEEDED: You have exhausted your Cloud TTS quota or credits');
        console.error('   Check usage at: https://console.cloud.google.com/apis/api/texttospeech.googleapis.com/quotas');
      } else if (error.message.includes('PERMISSION_DENIED') || error.message.includes('credentials')) {
        console.error('🔐 AUTHENTICATION ERROR: Service account credentials may be invalid');
        console.error('   Verify GCP_SERVICE_ACCOUNT_JSON environment variable is correct');
      }
    }

    // Don't throw error - return null so animation can proceed without audio
    return null;
  }
};

/**
 * Test the Cloud TTS connection
 * Useful for debugging authentication and quota issues
 */
export const testCloudTTS = async (): Promise<boolean> => {
  console.log('🧪 Testing Cloud TTS connection...');

  try {
    const testAudio = await generateSpeech('Hello, this is a test.');
    if (testAudio) {
      console.log('✅ Cloud TTS test successful!');
      return true;
    } else {
      console.error('❌ Cloud TTS test failed: No audio returned');
      return false;
    }
  } catch (error) {
    console.error('❌ Cloud TTS test failed:', error);
    return false;
  }
};
