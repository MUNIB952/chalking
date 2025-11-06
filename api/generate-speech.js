/**
 * Vercel Serverless Function: Generate Speech with Gemini TTS
 * Uses official @google-cloud/vertexai SDK with gemini-2.5-flash-preview-tts
 */

import { VertexAI } from '@google-cloud/vertexai';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-central1';
    const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!projectId || !serviceAccountJson) {
      console.error('❌ Missing required environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Parse service account credentials
    const credentials = JSON.parse(serviceAccountJson);

    // Initialize Vertex AI
    const vertexAI = new VertexAI({
      project: projectId,
      location: location,
      googleAuthOptions: {
        credentials: {
          client_email: credentials.client_email,
          private_key: credentials.private_key,
        }
      }
    });

    console.log('🎤 Generating speech with Gemini TTS (gemini-2.5-flash-preview-tts)');
    console.log(`   Text length: ${text.length} characters`);

    // Use Gemini 2.5 Flash TTS model
    const model = vertexAI.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-tts',
    });

    // Generate speech with audio modality
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: text }]
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Kore'  // Natural female voice (same as local)
            }
          }
        }
      }
    });

    const response = result.response;

    // Extract audio data (base64 encoded PCM)
    const audioContent = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioContent) {
      console.error('❌ No audio data in response');
      console.error('Response structure:', JSON.stringify({
        hasCandidates: !!response.candidates,
        candidateCount: response.candidates?.length,
        firstCandidate: response.candidates?.[0] ? 'exists' : 'missing'
      }));
      return res.status(500).json({ error: 'No audio generated' });
    }

    console.log(`✅ Generated audio: ${audioContent.length} bytes (base64 PCM)`);

    // Log usage metadata if available
    if (response.usageMetadata) {
      console.log('📊 TTS Usage:', {
        inputChars: text.length,
        audioSize: audioContent.length,
        metadata: response.usageMetadata
      });
    }

    // Return audio in same format as before
    return res.status(200).json({
      audioContent: audioContent
    });

  } catch (error) {
    console.error('❌ Gemini TTS Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error.toString()
    });
  }
}
