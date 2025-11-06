/**
 * Cloud Text-to-Speech Service - Client Side
 *
 * This service calls our Vercel Serverless Function (/api/tts) which handles
 * server-side authentication and Cloud TTS API calls.
 *
 * Benefits:
 * - 1,000 requests/minute rate limit (100x better than AI Studio)
 * - Neural2 voices for high-quality, natural speech
 * - Server-side authentication (secure)
 * - Clear pricing: $16 per 1M characters
 *
 * With $300 Google Cloud credit: ~18.75M characters = 7,500+ full explanations
 */

/**
 * Generate speech using Cloud Text-to-Speech API via serverless function
 * Returns base64-encoded PCM audio compatible with existing audio playback system
 *
 * @param text - Text to convert to speech (max 5000 characters per request)
 * @returns Base64-encoded PCM audio data or null if generation fails
 */
export const generateSpeech = async (text: string): Promise<string | null> => {
  if (!text) {
    console.warn('⚠️  Empty text provided to generateSpeech');
    return null;
  }

  if (text.length > 5000) {
    console.error('❌ Text too long (max 5000 characters):', text.length);
    return null;
  }

  try {
    console.log('🎤 Calling Cloud TTS API for text:', text.substring(0, 100) + '...');
    console.log('   Text length:', text.length, 'characters');
    console.log('   Estimated cost: $' + ((text.length / 1000000) * 16).toFixed(6), '(WaveNet pricing)');

    // Call our serverless function
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('❌ Cloud TTS API error:', response.status, errorData.error);

      // Log specific error types
      if (response.status === 429) {
        console.error('💸 QUOTA EXCEEDED: You have exhausted your Cloud TTS quota or credits');
        console.error('   Check usage at: https://console.cloud.google.com/apis/api/texttospeech.googleapis.com/quotas');
      } else if (response.status === 403) {
        console.error('🔐 AUTHENTICATION ERROR: Service account credentials may be invalid');
        console.error('   Check GCP_SERVICE_ACCOUNT_JSON in Vercel environment variables');
      }

      return null;
    }

    const data = await response.json();

    if (!data.audio) {
      console.error('❌ Cloud TTS API returned no audio data');
      return null;
    }

    console.log('✅ Generated PCM base64 audio length:', data.audio.length);
    console.log('   Audio format: LINEAR16 PCM, 24kHz');
    console.log('   Voice: en-US-Neural2-F (Neural2 quality)');
    console.log('   Duration:', data.duration?.toFixed(2), 'seconds');

    return data.audio;

  } catch (error) {
    console.error('❌ Cloud TTS API call failed:', error);

    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('🌐 Network error: Could not reach /api/tts endpoint');
      console.error('   Make sure the serverless function is deployed');
    }

    // Don't throw error - return null so animation can proceed without audio
    return null;
  }
};

/**
 * Test the Cloud TTS API connection
 * Useful for debugging authentication and quota issues
 */
export const testCloudTTS = async (): Promise<boolean> => {
  console.log('🧪 Testing Cloud TTS API connection...');

  try {
    const testAudio = await generateSpeech('Hello, this is a test.');
    if (testAudio) {
      console.log('✅ Cloud TTS API test successful!');
      return true;
    } else {
      console.error('❌ Cloud TTS API test failed: No audio returned');
      return false;
    }
  } catch (error) {
    console.error('❌ Cloud TTS API test failed:', error);
    return false;
  }
};
