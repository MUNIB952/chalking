/**
 * Local test script to check Vertex AI API directly
 * This bypasses Vercel and tests the GCP API directly
 */

import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import fs from 'fs';

// Read from .env if it exists, otherwise use environment variables
const projectId = process.env.GCP_PROJECT_ID || 'gen-lang-client-0070274537';
const location = process.env.GCP_LOCATION || 'us-central1';
const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJson) {
  console.error('❌ GCP_SERVICE_ACCOUNT_JSON environment variable not set');
  console.log('\nTo run this test:');
  console.log('1. Copy your service account JSON');
  console.log('2. Run: export GCP_SERVICE_ACCOUNT_JSON=\'{"type":"service_account",...}\'');
  console.log('3. Run: node test-vertex-local.js');
  process.exit(1);
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

async function testVertexAI() {
  console.log('🔍 Testing Vertex AI API...\n');

  try {
    // Parse service account
    const serviceAccount = JSON.parse(serviceAccountJson);
    console.log('✅ Service account parsed successfully');
    console.log(`   Email: ${serviceAccount.client_email}\n`);

    // Get access token
    console.log('🔑 Getting OAuth token...');
    const accessToken = await getAccessToken(serviceAccount);
    console.log(`✅ Token obtained: ${accessToken.substring(0, 20)}...\n`);

    // Test 1: List models endpoint
    console.log('📋 Test 1: List Models Endpoint');
    const listEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models`;
    console.log(`   Endpoint: ${listEndpoint}`);

    const listResponse = await fetch(listEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    console.log(`   HTTP Status: ${listResponse.status} ${listResponse.statusText}`);
    console.log(`   Content-Type: ${listResponse.headers.get('content-type')}`);

    const listResponseText = await listResponse.text();

    if (listResponse.ok) {
      const data = JSON.parse(listResponseText);
      console.log(`✅ SUCCESS! Found ${data.models?.length || 0} models`);
      if (data.models && data.models.length > 0) {
        console.log('   First 5 models:');
        data.models.slice(0, 5).forEach(model => {
          console.log(`     - ${model.name?.split('/').pop()}`);
        });
      }
    } else {
      console.log(`❌ FAILED with status ${listResponse.status}`);
      console.log(`   Response preview: ${listResponseText.substring(0, 300)}`);

      // Try to parse as JSON error
      try {
        const errorData = JSON.parse(listResponseText);
        console.log(`   Error details:`, JSON.stringify(errorData, null, 2));
      } catch (e) {
        console.log(`   Response is not JSON (likely HTML error page)`);
      }
    }

    console.log('\n📝 Test 2: Generate Content Endpoint');
    const generateEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-1.5-pro:generateContent`;
    console.log(`   Endpoint: ${generateEndpoint}`);

    const generateResponse = await fetch(generateEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: 'Say hello' }]
        }],
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.7,
        }
      })
    });

    console.log(`   HTTP Status: ${generateResponse.status} ${generateResponse.statusText}`);

    const generateResponseText = await generateResponse.text();

    if (generateResponse.ok) {
      const data = JSON.parse(generateResponseText);
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log(`✅ SUCCESS! Response: ${responseText}`);
    } else {
      console.log(`❌ FAILED with status ${generateResponse.status}`);
      console.log(`   Response preview: ${generateResponseText.substring(0, 300)}`);

      try {
        const errorData = JSON.parse(generateResponseText);
        console.log(`   Error details:`, JSON.stringify(errorData, null, 2));
      } catch (e) {
        console.log(`   Response is not JSON (likely HTML error page)`);
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

testVertexAI();
