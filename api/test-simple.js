/**
 * Simplified test - just shows raw HTTP response
 */

import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-central1';
    const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!projectId || !serviceAccountJson) {
      return res.status(500).json({ error: 'Missing env vars' });
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    // Get OAuth token
    const accessToken = await getAccessToken(serviceAccount);

    // Test the API
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    // Get raw response
    const responseText = await response.text();

    // Return everything
    return res.status(200).json({
      httpStatus: response.status,
      httpStatusText: response.statusText,
      contentType: response.headers.get('content-type'),
      endpoint: endpoint,
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 1000),
      isJSON: response.headers.get('content-type')?.includes('application/json')
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack
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
