/**
 * Vercel Serverless Function: Generate Speech with AI Studio TTS
 * Uses AI Studio API (better quotas than Vertex AI preview TTS)
 */

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

    const apiKey = process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      console.error('❌ Missing VITE_GEMINI_API_KEY');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    console.log('🎤 Generating speech with AI Studio TTS (Gemini 2.5 Flash)');
    console.log(`   Text length: ${text.length} characters`);

    // Use AI Studio TTS endpoint with API key
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: text }]
          }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Kore'
                }
              }
            }
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ AI Studio TTS error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'TTS generation failed',
        details: errorText
      });
    }

    const data = await response.json();

    // Extract audio data
    const audioContent = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioContent) {
      console.error('❌ No audio data in response');
      return res.status(500).json({ error: 'No audio generated' });
    }

    console.log(`✅ Generated audio: ${audioContent.length} bytes (base64 PCM)`);

    // Return audio in same format
    return res.status(200).json({
      audioContent: audioContent
    });

  } catch (error) {
    console.error('❌ AI Studio TTS Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error.toString()
    });
  }
}
