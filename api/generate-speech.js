/**
 * Vercel Serverless Function: Generate Speech with Cloud TTS
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
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!serviceAccountJson) {
      console.error('Missing GCP_SERVICE_ACCOUNT_JSON');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    // Get OAuth2 access token
    const accessToken = await getAccessToken(serviceAccount);

    console.log('🎤 Generating speech with Cloud TTS');

    const response = await fetch(
      'https://texttospeech.googleapis.com/v1/text:synthesize',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: 'en-US',
            name: 'en-US-Neural2-J',
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
      console.error('TTS Error:', errorData);
      return res.status(response.status).json({ error: errorData });
    }

    const data = await response.json();

    if (data.audioContent) {
      console.log('✅ Generated audio:', data.audioContent.length, 'bytes');
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
