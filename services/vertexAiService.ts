/**
 * Vertex AI Service for Google Cloud Platform (REST API)
 * Uses direct REST API calls to Vertex AI - works in the browser
 * This service uses your GCP project credits/billing instead of free tier quotas
 */

import { AIResponse } from '../types';
import { robustJsonParse, fullPromptTemplate, QUOTA_ERROR_MESSAGE } from './geminiService';

/**
 * Generate initial visual plan using Vertex AI Gemini REST API
 */
export const getInitialPlan = async (prompt: string): Promise<AIResponse> => {
  try {
    const projectId = import.meta.env.VITE_GCP_PROJECT_ID;
    const location = import.meta.env.VITE_GCP_LOCATION || 'us-central1';
    const apiKey = import.meta.env.VITE_VERTEX_API_KEY;

    if (!projectId) {
      throw new Error('VITE_GCP_PROJECT_ID is required for Vertex AI. Please set it in your .env file.');
    }

    if (!apiKey) {
      throw new Error('VITE_VERTEX_API_KEY is required for Vertex AI. Please set it in your .env file.');
    }

    const fullPrompt = fullPromptTemplate(prompt);

    // Use Vertex AI REST API endpoint
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-2.0-flash-exp:generateContent`;

    console.log('🚀 Calling Vertex AI API:', endpoint);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: fullPrompt }]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 60000,
          temperature: 0.7,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Vertex AI API Error:', errorData);

      if (response.status === 429) {
        throw new Error(QUOTA_ERROR_MESSAGE);
      }

      throw new Error(`Vertex AI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('No response from Vertex AI');
    }

    // Log token usage if available
    if (data.usageMetadata) {
      console.log('📊 VERTEX AI TOKEN USAGE:');
      console.log(`  Input tokens: ${data.usageMetadata.promptTokenCount}`);
      console.log(`  Output tokens: ${data.usageMetadata.candidatesTokenCount}`);
      console.log(`  Total tokens: ${data.usageMetadata.totalTokenCount}`);
    }

    console.log('Gemini API Response received, parsing JSON...');
    console.log('Raw response length:', textResponse.length);
    console.log('First 500 chars:', textResponse.substring(0, 500));
    console.log('Last 500 chars:', textResponse.substring(textResponse.length - 500));

    return robustJsonParse(textResponse);
  } catch (e) {
    console.error('Vertex AI Error:', e);
    if (e instanceof Error && e.message.includes('quota')) {
      throw new Error(QUOTA_ERROR_MESSAGE);
    }
    throw new Error('Could not generate a plan from the prompt using Vertex AI.');
  }
};

/**
 * Generate speech using Google Cloud Text-to-Speech API
 * This is billed separately from Gemini/Vertex AI
 */
export const generateSpeech = async (text: string): Promise<string | null> => {
  if (!text) return null;

  try {
    const apiKey = import.meta.env.VITE_VERTEX_API_KEY;

    if (!apiKey) {
      console.error('Missing VITE_VERTEX_API_KEY for TTS');
      return null;
    }

    console.log('🎤 Generating speech with Cloud TTS for text:', text.substring(0, 100) + '...');
    console.log('  Text length:', text.length, 'characters');

    // Use Cloud Text-to-Speech API
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: 'en-US',
            name: 'en-US-Neural2-J', // Male voice
            ssmlGender: 'MALE'
          },
          audioConfig: {
            audioEncoding: 'LINEAR16',
            sampleRateHertz: 24000,
            pitch: 0,
            speakingRate: 1.0
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('TTS API Error:', errorData);
      return null;
    }

    const data = await response.json();

    if (data.audioContent) {
      console.log('✅ Generated audio length:', data.audioContent.length, 'bytes (base64)');
    }

    return data.audioContent || null;

  } catch (e) {
    console.error('Speech generation failed:', e);
    return null;
  }
};
