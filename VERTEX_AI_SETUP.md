# Vertex AI with Service Account - Complete Setup Guide

## ✅ What We've Built

Your app now uses **Vercel serverless functions** to call Vertex AI securely with service account authentication. This enables:
- ✅ Unlimited API calls using your $300 GCP credit
- ✅ Secure authentication (credentials stay server-side)
- ✅ Production-ready infrastructure
- ✅ No CORS issues

---

## 🎯 Complete Setup Steps

### **Step 1: Grant Roles to Your Service Account**

You're using: `vertex-express@gen-lang-client-0070274537.iam.gserviceaccount.com`

1. Go to: https://console.cloud.google.com/iam-admin/iam
2. Find your service account in the list
3. Click the **pencil icon** (edit) next to it
4. Click **ADD ANOTHER ROLE** and add:
   - **Vertex AI User** (for Gemini API calls)
   - **Cloud Text-to-Speech Client** (for audio generation)
5. Click **SAVE**

---

### **Step 2: Create JSON Key**

1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click on **`vertex-express@gen-lang-client-0070274537.iam.gserviceaccount.com`**
3. Click the **KEYS** tab
4. Click **ADD KEY** → **Create new key**
5. Choose **JSON** format
6. Click **CREATE**
7. **A file will download** - keep it safe!

The downloaded file will look like:
```json
{
  "type": "service_account",
  "project_id": "gen-lang-client-0070274537",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "vertex-express@gen-lang-client-0070274537.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

---

### **Step 3: Configure Vercel Environment Variables**

1. Go to: https://vercel.com/dashboard
2. Click your **chalking** project
3. Go to: **Settings** → **Environment Variables**
4. **REMOVE or UPDATE** these old variables (if they exist):
   - Delete: `VITE_VERTEX_API_KEY` (not needed anymore)
   - Delete: `VITE_GCP_LOCATION` (not needed in frontend)

5. **ADD these NEW variables:**

#### Variable 1: Enable Vertex AI
- **Key:** `VITE_USE_VERTEX_AI`
- **Value:** `true`
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

#### Variable 2: Project ID (Frontend - for display)
- **Key:** `VITE_GCP_PROJECT_ID`
- **Value:** `gen-lang-client-0070274537`
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

#### Variable 3: Project ID (Backend - for API calls)
- **Key:** `GCP_PROJECT_ID` (no VITE_ prefix!)
- **Value:** `gen-lang-client-0070274537`
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

#### Variable 4: Location (Backend)
- **Key:** `GCP_LOCATION` (no VITE_ prefix!)
- **Value:** `us-central1`
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

#### Variable 5: Service Account JSON (Backend - IMPORTANT!)
- **Key:** `GCP_SERVICE_ACCOUNT_JSON` (no VITE_ prefix!)
- **Value:** Open your downloaded JSON file, **copy ENTIRE contents**, paste here
  - It should be one long line starting with `{"type":"service_account",...}`
  - Include ALL the JSON, including the private key
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

**Important:** This is a secret! Vercel will hide it automatically.

---

### **Step 4: Deploy to Vercel**

The code is already pushed to GitHub, so:

1. **Vercel will auto-deploy** when it detects the push
2. Or manually trigger deployment:
   - Go to **Deployments** tab in Vercel
   - Click **"..."** menu on latest deployment
   - Click **Redeploy**

---

### **Step 5: Verify It Works**

#### Check Deployment Logs:
1. Go to your deployment in Vercel
2. Click on the deployment
3. Click **View Function Logs**
4. Look for:
   ```
   🔧 AI Service configured to use: Vertex AI (GCP Billing)
   ✅ Vertex AI service loaded successfully
   ```

#### Test Your App:
1. Open your Vercel URL (e.g., `https://chalking.vercel.app`)
2. Open browser DevTools (F12) → Console
3. Submit a test prompt
4. You should see:
   ```
   🚀 Calling Vertex AI via serverless function
   📊 VERTEX AI TOKEN USAGE: ...
   🎤 Generating speech with Cloud TTS via serverless function
   ✅ Generated audio length: ...
   ```

#### Check Function Logs on Vercel:
1. Go to Vercel Dashboard → Your Project
2. Click **Functions** tab
3. You should see:
   - `/api/generate-plan`
   - `/api/generate-speech`
4. Click on them to see execution logs

---

## ✅ Environment Variables Summary

**Frontend (browser) - Start with VITE_:**
```bash
VITE_USE_VERTEX_AI=true
VITE_GCP_PROJECT_ID=gen-lang-client-0070274537
VITE_GEMINI_API_KEY=your-ai-studio-key  # Fallback only
```

**Backend (serverless functions) - No VITE_ prefix:**
```bash
GCP_PROJECT_ID=gen-lang-client-0070274537
GCP_LOCATION=us-central1
GCP_SERVICE_ACCOUNT_JSON={"type":"service_account",...entire JSON...}
```

---

## 🔍 Troubleshooting

### ❌ "Missing required environment variables"
**Solution:** Make sure you set `GCP_PROJECT_ID` and `GCP_SERVICE_ACCOUNT_JSON` (without VITE_ prefix) in Vercel

### ❌ "Failed to get access token"
**Solution:**
- Check your service account JSON is complete and valid
- Make sure the JSON includes the `private_key` field
- Verify you pasted the ENTIRE JSON (it's very long)

### ❌ "403 Permission Denied"
**Solution:**
- Go to IAM and grant these roles to your service account:
  - Vertex AI User
  - Cloud Text-to-Speech Client

### ❌ Serverless function not found (404)
**Solution:**
- Make sure the `/api` folder was deployed
- Check Vercel **Functions** tab shows the functions
- Redeploy if needed

### ❌ Still using AI Studio instead of Vertex AI
**Solution:**
- Check `VITE_USE_VERTEX_AI=true` is set in Vercel
- Redeploy after setting variables
- Check browser console shows "Using Vertex AI"

---

## 💰 Cost Monitoring

Your setup uses your **$300 GCP credit** automatically!

**Track usage:**
- **Billing:** https://console.cloud.google.com/billing
- **API Dashboard:** https://console.cloud.google.com/apis/dashboard
- **Vertex AI Quotas:** https://console.cloud.google.com/iam-admin/quotas

**Estimated costs:**
- Gemini 2.0 Flash: ~$0.002 per explanation
- Cloud TTS: ~$0.032 per explanation (2000 characters)
- **Total:** ~$0.034 per explanation

**Your $300 credit = ~8,800 explanations!** 🎉

---

## 🎯 Success Checklist

- [ ] Service account has Vertex AI User role
- [ ] Service account has Cloud Text-to-Speech Client role
- [ ] Created JSON key for service account
- [ ] Added GCP_SERVICE_ACCOUNT_JSON to Vercel (complete JSON)
- [ ] Added GCP_PROJECT_ID to Vercel (without VITE_)
- [ ] Added GCP_LOCATION to Vercel (without VITE_)
- [ ] Added VITE_USE_VERTEX_AI=true to Vercel
- [ ] Deployed to Vercel
- [ ] Tested - audio plays successfully
- [ ] Verified in console: "Using Vertex AI via serverless function"
- [ ] Checked Vercel Functions tab shows /api/generate-plan and /api/generate-speech

---

## 📝 Quick Reference

**Service Account Email:**
```
vertex-express@gen-lang-client-0070274537.iam.gserviceaccount.com
```

**Project ID:**
```
gen-lang-client-0070274537
```

**Required GCP APIs:**
- ✅ Vertex AI API
- ✅ Cloud Text-to-Speech API

**Vercel Serverless Functions:**
- `/api/generate-plan` - Calls Gemini for visual plans
- `/api/generate-speech` - Calls Cloud TTS for audio

---

Need help? Check the console logs in your browser and in Vercel's Function Logs tab! 🚀
