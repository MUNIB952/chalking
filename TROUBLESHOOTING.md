# Vertex AI Troubleshooting Guide

## Quick Diagnosis

Visit this endpoint after deploying: `https://your-app.vercel.app/api/test-vertex`

This will run comprehensive tests and show you exactly what's wrong.

---

## Common Issues & Solutions

### 1. "OAuth Consent Screen" Message in Google Cloud Console

**What it means:** This message appears on the API credentials page but is **NOT needed** for your setup.

**Why:** You're using **Service Account authentication** (server-to-server), which doesn't require user consent. The OAuth consent screen is only needed for apps that ask users to log in with their Google account.

**Action:** ✅ **Ignore this message** - Your service account auth doesn't use it.

---

### 2. Environment Variables Not Set in Vercel

**Symptoms:**
- API returns "Missing required environment variables"
- Functions fail immediately
- No authentication happening

**Solution:**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add these variables (all without `VITE_` prefix for backend):

```bash
GCP_PROJECT_ID=gen-lang-client-0070274537
GCP_LOCATION=us-central1
GCP_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"gen-lang-client-0070274537",...}
```

**CRITICAL:** The `GCP_SERVICE_ACCOUNT_JSON` must be the **ENTIRE** JSON file contents (including the private_key field).

5. Also add this for the frontend:

```bash
VITE_USE_VERTEX_AI=true
VITE_GCP_PROJECT_ID=gen-lang-client-0070274537
```

6. After adding variables, **redeploy** your app.

---

### 3. Service Account Permissions Missing

**Symptoms:**
- OAuth token generates successfully
- API calls return 403 Forbidden
- Error: "Permission denied" or "Insufficient permissions"

**Solution:**

1. Go to [IAM & Admin](https://console.cloud.google.com/iam-admin/iam?project=gen-lang-client-0070274537)
2. Find: `vertex-express@gen-lang-client-0070274537.iam.gserviceaccount.com`
3. Click the pencil icon to edit
4. Ensure these roles are assigned:
   - ✅ **Vertex AI User** (for Gemini API)
   - ✅ **Cloud Text-to-Speech Client** (for audio)
5. Click **Save**

**Verify:** After saving, wait 1-2 minutes for permissions to propagate, then test again.

---

### 4. API Not Enabled

**Symptoms:**
- Error: "API [aiplatform.googleapis.com] not enabled"
- 403 errors about disabled services

**Solution:**

1. Go to [API Library](https://console.cloud.google.com/apis/library?project=gen-lang-client-0070274537)
2. Search for and enable:
   - ✅ **Vertex AI API**
   - ✅ **Cloud Text-to-Speech API**
3. Click **Enable** for each

---

### 5. Wrong Gemini Model Selected

**Symptoms:**
- Error: "Model not found"
- Error: "maxOutputTokens exceeds limit"
- 404 or 400 errors when calling generateContent

**What's happening:** Different Gemini models have different availability in Vertex AI.

**Currently using:** `gemini-1.5-pro` (most stable in Vertex AI)

**Check available models:**
Visit `/api/test-vertex` endpoint - it will show all available models in your region.

**Alternative models to try:**
- `gemini-1.5-flash` - Faster, cheaper
- `gemini-1.0-pro` - Older but very stable

---

### 6. Vercel Not Picking Up Environment Variables

**Symptoms:**
- Variables are set in Vercel dashboard
- But code still reports missing variables
- Logs show undefined values

**Solution:**

1. Check variable names match EXACTLY (case-sensitive)
2. Ensure variables are set for correct environments:
   - ✅ Production
   - ✅ Preview
   - ✅ Development
3. **Trigger a new deployment** after setting variables:
   - Go to **Deployments** tab
   - Click on latest deployment → **...** menu → **Redeploy**

**Important:** Environment variable changes don't apply to existing deployments automatically!

---

## Testing Your Setup

### Test Locally (if running dev server)

Create a `.env` file:

```bash
VITE_USE_VERTEX_AI=true
VITE_GCP_PROJECT_ID=gen-lang-client-0070274537
GCP_PROJECT_ID=gen-lang-client-0070274537
GCP_LOCATION=us-central1
GCP_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Run:
```bash
npm run dev
```

### Test on Vercel

1. Deploy your app
2. Visit: `https://your-app.vercel.app/api/test-vertex`
3. Review all test results
4. Each test should show **PASSED**

### Expected Successful Output

```json
{
  "tests": [
    {
      "name": "Environment Variables",
      "status": "PASSED"
    },
    {
      "name": "Service Account JSON Parsing",
      "status": "PASSED"
    },
    {
      "name": "OAuth Token Generation",
      "status": "PASSED"
    },
    {
      "name": "List Models API",
      "status": "PASSED"
    },
    {
      "name": "Gemini 1.5 Pro Generation",
      "status": "PASSED"
    }
  ]
}
```

---

## Understanding Your $300 Credit

### When is it used?

Your $300 GCP credit is used **ONLY** when:
- ✅ `VITE_USE_VERTEX_AI=true` is set
- ✅ All environment variables are configured correctly
- ✅ Service account has proper permissions
- ✅ Your app makes API calls through the Vercel serverless functions

### When is it NOT used?

Your credit is **NOT** used when:
- ❌ `VITE_USE_VERTEX_AI=false` (uses AI Studio free tier instead)
- ❌ Missing environment variables (app falls back to AI Studio)
- ❌ Authentication fails (app uses fallback)

### How to verify you're using Vertex AI:

1. Open your app in browser
2. Open DevTools (F12) → Console tab
3. Submit a test prompt
4. Look for these log messages:
   - ✅ `"🚀 Using Vertex AI for plan generation"`
   - ✅ `"📊 VERTEX AI TOKEN USAGE: ..."`

If you see:
- ❌ `"🚀 Using AI Studio for plan generation"` → You're NOT using Vertex AI

---

## Cost Monitoring

Track your $300 credit usage:

1. **Billing Overview:** https://console.cloud.google.com/billing
2. **API Dashboard:** https://console.cloud.google.com/apis/dashboard
3. **Vertex AI Console:** https://console.cloud.google.com/vertex-ai

### Estimated Costs Per Request

- Gemini 1.5 Pro (text): ~$0.002 per explanation
- Cloud TTS (audio): ~$0.032 per explanation
- **Total:** ~$0.034 per explanation

**Your $300 credit = ~8,800 explanations!** 🎉

---

## Still Not Working?

Run the test endpoint and share the output:

```bash
curl https://your-app.vercel.app/api/test-vertex
```

This will show exactly which step is failing.
