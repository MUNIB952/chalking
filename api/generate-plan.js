/**
 * Vercel Serverless Function: Generate Plan with Vertex AI
 * Uses Service Account for authentication
 */

import jwt from 'jsonwebtoken';

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
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      hasPrompt: !!req.body?.prompt,
      promptType: typeof req.body?.prompt,
      promptLength: req.body?.prompt?.length || 0
    });

    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      console.error('❌ Invalid prompt:', { prompt, type: typeof prompt, body: req.body });
      return res.status(400).json({
        error: 'Prompt is required',
        debug: {
          receivedType: typeof prompt,
          bodyKeys: req.body ? Object.keys(req.body) : [],
          bodyPreview: JSON.stringify(req.body).substring(0, 200)
        }
      });
    }

    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-central1';
    const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!projectId || !serviceAccountJson) {
      console.error('❌ Missing required environment variables:', {
        hasProjectId: !!projectId,
        hasServiceAccountJson: !!serviceAccountJson,
        serviceAccountJsonLength: serviceAccountJson?.length || 0
      });
      return res.status(500).json({
        error: 'Server configuration error',
        debug: {
          hasProjectId: !!projectId,
          hasServiceAccountJson: !!serviceAccountJson
        }
      });
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
      console.log('✅ Service account parsed successfully');
    } catch (parseError) {
      console.error('❌ Failed to parse service account JSON:', parseError);
      return res.status(500).json({
        error: 'Invalid service account configuration',
        debug: parseError.message
      });
    }

    // Get OAuth2 access token
    const accessToken = await getAccessToken(serviceAccount);

    // Use Gemini 2.5 Pro (same as AI Studio, supports 60k output tokens)
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-2.5-pro-002:generateContent`;

    console.log('✅ Calling Vertex AI from serverless function');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 60000,  // Gemini 2.5 Pro supports up to 60k tokens
          temperature: 0.7,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Vertex AI Error:', errorData);
      return res.status(response.status).json({ error: errorData });
    }

    const data = await response.json();

    if (data.usageMetadata) {
      console.log('📊 Token usage:', data.usageMetadata);
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const token = jwt.sign(payload, serviceAccount.private_key, {
    algorithm: 'RS256'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token
    })
  });

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('Failed to get access token');
  }

  return data.access_token;
}
