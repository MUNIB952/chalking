/**
 * Debug endpoint to list available models in Vertex AI
 */

import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-central1';
    const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!projectId || !serviceAccountJson) {
      return res.status(500).json({ error: 'Missing configuration' });
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    // Get access token
    const accessToken = await getAccessToken(serviceAccount);

    // List available models
    const listEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models`;

    console.log('Fetching models from:', listEndpoint);

    const response = await fetch(listEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    const data = await response.json();

    return res.status(200).json({
      endpoint: listEndpoint,
      statusCode: response.status,
      models: data
    });

  } catch (error) {
    console.error('Error:', error);
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
  return data.access_token;
}
