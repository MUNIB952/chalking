/**
 * Vercel Serverless Function: Generate Plan with Vertex AI
 * Uses official @google-cloud/vertexai SDK (same approach as local Python setup)
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
    console.log('📥 Request received:', {
      method: req.method,
      hasPrompt: !!req.body?.prompt,
      promptLength: req.body?.prompt?.length || 0
    });

    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      console.error('❌ Invalid prompt');
      return res.status(400).json({ error: 'Prompt is required' });
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

    // Initialize Vertex AI with service account (same as local Python setup)
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

    // Use gemini-2.5-pro (same model that worked locally)
    const model = vertexAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    });

    console.log('✅ Calling Vertex AI with official SDK (gemini-2.5-pro)');

    // Generate content (same as local client.models.generate_content)
    const result = await model.generateContent(prompt);
    const response = result.response;

    // Extract text from response
    const textResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('No response from Vertex AI');
    }

    // Log usage metadata
    if (response.usageMetadata) {
      console.log('📊 Token usage:', {
        promptTokens: response.usageMetadata.promptTokenCount,
        candidatesTokens: response.usageMetadata.candidatesTokenCount,
        totalTokens: response.usageMetadata.totalTokenCount,
      });
    }

    // Return in same format as before
    return res.status(200).json({
      candidates: response.candidates,
      usageMetadata: response.usageMetadata,
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error.toString()
    });
  }
}
