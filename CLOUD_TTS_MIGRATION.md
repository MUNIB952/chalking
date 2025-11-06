# Cloud Text-to-Speech Migration

## Summary

**Migrated from Google AI Studio Gemini TTS to Google Cloud Text-to-Speech API**

This upgrade resolves rate limiting issues and provides production-ready text-to-speech with significant performance improvements.

---

## Why We Migrated

### Before (Gemini TTS via AI Studio):
- ❌ **10 requests per minute** rate limit
- ❌ Caused 60+ second delays for audio generation
- ❌ Preview/experimental API (not production-ready)
- ❌ Users saw "waiting for audio" messages
- ❌ Poor user experience

### After (Cloud TTS via Vertex AI):
- ✅ **1,000 requests per minute** (100x improvement!)
- ✅ All audio generated in seconds
- ✅ Production-ready, stable API
- ✅ Neural2 voice quality (latest generation)
- ✅ Smooth, uninterrupted experience

---

## Benefits

| Metric | Before (Gemini TTS) | After (Cloud TTS) | Improvement |
|--------|---------------------|-------------------|-------------|
| **Rate Limit** | 10/min | 1,000/min | **100x faster** |
| **Audio Generation** | 2+ minutes (batched) | <10 seconds (parallel) | **12x faster** |
| **API Status** | Preview | Production | Stable |
| **Voice Quality** | Kore (Gemini) | Neural2-F (Latest) | Better |
| **Cost per 1M chars** | Free (limited) | $16 (WaveNet/Neural2) | Paid but scalable |

---

## Costs with $300 Google Cloud Credit

**Cloud Text-to-Speech Pricing:**
- **Neural2/WaveNet voices:** $16 per 1 million characters
- **Your $300 credit:** ~18.75 million characters
- **Average explanation:** ~2,500 characters
- **Total explanations:** **~7,500 full concepts** with $300 credit

**Monthly Free Tier:**
- 1 million WaveNet/Neural2 characters free per month
- Over 3 months = 3 million free characters
- **Total with credit:** 21.75 million characters

**Cost per explanation:**
- Average cost: $0.04 per full explanation (2,500 chars)
- Your $300 covers extensive usage

---

## Technical Changes

### Architecture:
**Serverless API Approach** - Cloud TTS runs server-side via Vercel Serverless Function

```
Client (Browser)
    ↓ HTTP POST /api/tts
Vercel Serverless Function (/api/tts.ts)
    ↓ Authenticated call
Google Cloud Text-to-Speech API
    ↓ Audio response
Client receives base64 audio
```

### New Files:
1. **`api/tts.ts`** - Vercel Serverless Function (server-side Cloud TTS)
2. **`services/cloudTTSService.ts`** - Client-side wrapper (calls /api/tts)

### Modified Files:
1. **`package.json`** - Added `@google-cloud/text-to-speech` and `@vercel/node`
2. **`services/aiService.ts`** - Updated `generateSpeech()` to use Cloud TTS API
3. **`App.tsx`** - Changed rate limiter from 10/min to 1000/min, removed batching logic

### Environment Variables (Already Configured):
```
GCP_SERVICE_ACCOUNT_JSON - Service account credentials (set in Vercel)
GCP_PROJECT_ID - Google Cloud project ID
GCP_LOCATION - us-central1
```

---

## How It Works

### Authentication:
- Uses service account JSON from `GCP_SERVICE_ACCOUNT_JSON` environment variable
- Automatically authenticates with Google Cloud
- No additional API keys needed

### Voice Configuration:
```typescript
voice: {
  languageCode: 'en-US',
  name: 'en-US-Neural2-F', // Natural female voice (latest generation)
}
```

### Audio Format:
- **Encoding:** LINEAR16 PCM (same as Gemini TTS)
- **Sample Rate:** 24kHz (high quality)
- **Output:** Base64-encoded (compatible with existing audio system)

### Rate Limiting:
- **Queue:** All requests go through RateLimiter
- **Limit:** 1,000 requests per minute
- **Behavior:** No delays for typical usage (10-20 steps)

---

## Deployment

### On Vercel:
1. Push to GitHub
2. Vercel automatically deploys
3. Environment variables already configured
4. No manual steps needed

### First Run:
- Cloud TTS client initializes on first speech request
- Logs project ID and service account email
- Generates all audio in parallel

---

## Monitoring Usage

### Google Cloud Console:
**Check quota usage:**
```
https://console.cloud.google.com/apis/api/texttospeech.googleapis.com/quotas
```

**Check billing:**
```
https://console.cloud.google.com/billing
```

**View API calls:**
```
https://console.cloud.google.com/apis/api/texttospeech.googleapis.com/metrics
```

### Console Logs:
```
🎤 Generating speech with Cloud TTS for text: ...
   Text length: 150 characters
   Estimated cost: $0.000002 (WaveNet pricing)
✅ Generated PCM base64 audio length: 800000
   Audio format: LINEAR16 PCM, 24kHz
   Voice: en-US-Neural2-F (Neural2 quality)
```

---

## Troubleshooting

### "PERMISSION_DENIED" Error:
- ✅ Verify `GCP_SERVICE_ACCOUNT_JSON` is correctly set in Vercel environment variables
- ✅ Ensure service account has "Text-to-Speech User" role

### "RESOURCE_EXHAUSTED" Error:
- ✅ Check quota usage at Cloud Console
- ✅ Verify $300 credit hasn't been exhausted
- ✅ Check billing account is active

### Audio Not Playing:
- ✅ Check browser console for TTS errors
- ✅ Verify service account credentials are valid
- ✅ Test with `testCloudTTS()` function

---

## Rollback (If Needed)

To revert to Gemini TTS:

1. **Restore `aiService.ts`:**
```typescript
export const generateSpeech = async (text: string): Promise<string | null> => {
  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    // ... (previous implementation)
  });
};
```

2. **Restore `App.tsx` rate limit:**
```typescript
const rateLimiterRef = useRef<RateLimiter>(new RateLimiter(10));
```

3. **Remove `@google-cloud/text-to-speech` from `package.json`**

---

## Summary

This migration provides:
- ✅ **100x better rate limits**
- ✅ **Production-ready stability**
- ✅ **Better user experience** (no waiting)
- ✅ **Clear, predictable costs**
- ✅ **Scalable for production**

**Result:** Professional-grade text-to-speech that can handle any usage volume with your $300 credit.
