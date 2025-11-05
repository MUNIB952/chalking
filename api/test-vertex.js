/**
 * Test script to diagnose Vertex AI authentication and API access
 * Run locally or deploy to Vercel to test
 */

import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const results = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  try {
    // Test 1: Check environment variables
    results.tests.push({
      name: 'Environment Variables',
      status: 'checking',
      details: {
        hasProjectId: !!process.env.GCP_PROJECT_ID,
        hasLocation: !!process.env.GCP_LOCATION,
        hasServiceAccountJson: !!process.env.GCP_SERVICE_ACCOUNT_JSON,
        projectId: process.env.GCP_PROJECT_ID || 'MISSING',
        location: process.env.GCP_LOCATION || 'MISSING',
        serviceAccountJsonLength: process.env.GCP_SERVICE_ACCOUNT_JSON?.length || 0
      }
    });

    if (!process.env.GCP_PROJECT_ID || !process.env.GCP_SERVICE_ACCOUNT_JSON) {
      results.tests[0].status = 'FAILED';
      results.tests[0].error = 'Missing required environment variables';
      return res.status(500).json(results);
    }
    results.tests[0].status = 'PASSED';

    // Test 2: Parse service account JSON
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
      results.tests.push({
        name: 'Service Account JSON Parsing',
        status: 'PASSED',
        details: {
          clientEmail: serviceAccount.client_email || 'MISSING',
          projectId: serviceAccount.project_id || 'MISSING',
          hasPrivateKey: !!serviceAccount.private_key,
          privateKeyLength: serviceAccount.private_key?.length || 0
        }
      });
    } catch (e) {
      results.tests.push({
        name: 'Service Account JSON Parsing',
        status: 'FAILED',
        error: e.message
      });
      return res.status(500).json(results);
    }

    // Test 3: Generate JWT and get OAuth token
    try {
      const accessToken = await getAccessToken(serviceAccount);
      results.tests.push({
        name: 'OAuth Token Generation',
        status: 'PASSED',
        details: {
          tokenLength: accessToken?.length || 0,
          tokenPreview: accessToken ? `${accessToken.substring(0, 20)}...` : 'NONE'
        }
      });

      // Test 4: List available models
      const projectId = process.env.GCP_PROJECT_ID;
      const location = process.env.GCP_LOCATION || 'us-central1';

      const listEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models`;

      const listResponse = await fetch(listEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });

      const listData = await listResponse.json();

      if (listResponse.ok) {
        const modelNames = listData.models?.map(m => m.name?.split('/').pop()).slice(0, 10) || [];
        results.tests.push({
          name: 'List Models API',
          status: 'PASSED',
          details: {
            statusCode: listResponse.status,
            modelCount: listData.models?.length || 0,
            sampleModels: modelNames
          }
        });
      } else {
        results.tests.push({
          name: 'List Models API',
          status: 'FAILED',
          details: {
            statusCode: listResponse.status,
            error: listData
          }
        });
      }

      // Test 5: Try to call Gemini 1.5 Pro
      const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-1.5-pro:generateContent`;

      const geminiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: 'Say "Hello, Vertex AI is working!" if you can read this.' }]
          }],
          generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.7,
          }
        })
      });

      const geminiData = await geminiResponse.json();

      if (geminiResponse.ok) {
        results.tests.push({
          name: 'Gemini 1.5 Pro Generation',
          status: 'PASSED',
          details: {
            statusCode: geminiResponse.status,
            response: geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'NO TEXT',
            usageMetadata: geminiData.usageMetadata
          }
        });
      } else {
        results.tests.push({
          name: 'Gemini 1.5 Pro Generation',
          status: 'FAILED',
          details: {
            statusCode: geminiResponse.status,
            error: geminiData
          }
        });
      }

    } catch (e) {
      results.tests.push({
        name: 'API Testing',
        status: 'FAILED',
        error: e.message,
        stack: e.stack
      });
    }

    return res.status(200).json(results);

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      results
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
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}
