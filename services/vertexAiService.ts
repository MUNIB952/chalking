/**
 * Vertex AI Service for Google Cloud Platform (Serverless)
 * Calls Vercel serverless functions which use Service Account authentication
 * This service uses your GCP project credits/billing instead of free tier quotas
 */

import { AIResponse } from '../types';
import { robustJsonParse, fullPromptTemplate, QUOTA_ERROR_MESSAGE } from './geminiService';

/**
 * Generate initial visual plan using Vertex AI via Vercel serverless function
 */
export const getInitialPlan = async (prompt: string): Promise<AIResponse> => {
  try {
    const fullPrompt = fullPromptTemplate(prompt);

    console.log('🚀 Calling Vertex AI via serverless function');

    // Call Vercel serverless function
    const response = await fetch('/api/generate-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: fullPrompt })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Serverless function error:', errorData);

      if (response.status === 429) {
        throw new Error(QUOTA_ERROR_MESSAGE);
      }

      throw new Error(`Vertex AI error: ${errorData.error?.message || 'Unknown error'}`);
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
 * Generate speech using Cloud Text-to-Speech API (Production, 1,000 RPM quota)
 * Uses your $300 GCP credit
 */
export const generateSpeech = async (text: string): Promise<string | null> => {
  if (!text) return null;

  try {
    console.log('🎤 Generating speech with Cloud Text-to-Speech API (1,000 RPM quota)');
    console.log('  Text length:', text.length, 'characters');

    // Call Cloud TTS via serverless function (production API, great quotas!)
    const response = await fetch('/api/generate-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Cloud TTS error:', errorData);
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
