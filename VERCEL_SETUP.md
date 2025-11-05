# Vercel Deployment Setup for Vertex AI

## Step 1: Enable GCP APIs

Go to https://console.cloud.google.com/ and enable:

1. **Vertex AI API**
   - Navigate to: APIs & Services → Library
   - Search for "Vertex AI API" and enable it

2. **Cloud Text-to-Speech API**
   - Search for "Cloud Text-to-Speech API" and enable it

---

## Step 2: Create API Key with Restrictions

### Create API Key
1. Go to: **APIs & Services** → **Credentials**
2. Click **"+ CREATE CREDENTIALS"** → **API Key**
3. **Copy the API key** (you'll add it to Vercel)

### Configure Restrictions (IMPORTANT for Security)

Click **"RESTRICT KEY"** on your newly created API key:

#### Application Restrictions
- Select: **"HTTP referrers (web sites)"**
- Add these referrers (replace `your-app-name` with your actual Vercel project name):

```
# Your custom domain (if you have one)
https://yourdomain.com/*
https://*.yourdomain.com/*

# Vercel production domain
https://your-app-name.vercel.app/*

# Vercel preview deployments (for PR previews and branch deploys)
https://your-app-name-*.vercel.app/*
https://*.vercel.app/*

# Local development (optional - for testing)
http://localhost/*
http://localhost:5173/*
```

**Example for a project named "chalking":**
```
https://chalking.vercel.app/*
https://chalking-*.vercel.app/*
https://*.vercel.app/*
```

#### API Restrictions
- Select: **"Restrict key"**
- Check only these APIs:
  - ✅ Vertex AI API
  - ✅ Cloud Text-to-Speech API

**Click SAVE**

---

## Step 3: Find Your GCP Project ID

1. Look at the **top navigation bar** in GCP Console
2. Click the project dropdown
3. Copy your **Project ID** (looks like: `my-project-123456`)
   - Note: Use the Project ID, NOT the project name!

---

## Step 4: Configure Environment Variables in Vercel

### Via Vercel Dashboard (Recommended):

1. Go to your Vercel project: https://vercel.com/dashboard
2. Select your project (chalking)
3. Go to **Settings** → **Environment Variables**
4. Add these variables:

| Name | Value | Environments |
|------|-------|--------------|
| `VITE_USE_VERTEX_AI` | `true` | Production, Preview, Development |
| `VITE_GCP_PROJECT_ID` | `your-project-id` | Production, Preview, Development |
| `VITE_GCP_LOCATION` | `us-central1` | Production, Preview, Development |
| `VITE_VERTEX_API_KEY` | `AIzaSy...` (your API key) | Production, Preview, Development |
| `VITE_GEMINI_API_KEY` | `your-gemini-key` (fallback) | Production, Preview, Development |

**Important Notes:**
- ✅ Check **ALL environments** (Production, Preview, Development) for each variable
- ✅ Make sure variable names start with `VITE_` (Vite requirement)
- ✅ The API key should be the full key starting with `AIzaSy...`

### Via Vercel CLI (Alternative):

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Login to Vercel
vercel login

# Set environment variables
vercel env add VITE_USE_VERTEX_AI
# Enter: true

vercel env add VITE_GCP_PROJECT_ID
# Enter: your-project-id

vercel env add VITE_GCP_LOCATION
# Enter: us-central1

vercel env add VITE_VERTEX_API_KEY
# Enter: your-api-key

vercel env add VITE_GEMINI_API_KEY
# Enter: your-gemini-key
```

---

## Step 5: Redeploy Your Application

After adding environment variables, you need to redeploy:

### Option A: Trigger via Git Push
```bash
# Make any small change (or empty commit)
git commit --allow-empty -m "chore: trigger Vercel redeploy with Vertex AI config"
git push origin claude/fix-button-tap-issue-011CUpdEKUBqFnkai49Ev1X2
```

### Option B: Trigger via Vercel Dashboard
1. Go to your project in Vercel
2. Click **Deployments** tab
3. Click the **"..."** menu on latest deployment
4. Click **Redeploy**
5. Check **"Use existing Build Cache"** (optional)
6. Click **Redeploy**

---

## Step 6: Verify Deployment

### Check Build Logs:
1. Go to your deployment in Vercel
2. Click **Building** or **View Function Logs**
3. Look for these messages:
   ```
   🔧 AI Service configured to use: Vertex AI (GCP Billing)
   ✅ Vertex AI service loaded successfully
   ```

### Test Your App:
1. Open your Vercel deployment URL
2. Open browser DevTools (F12) → Console
3. Submit a prompt
4. You should see:
   ```
   🚀 Using Vertex AI for plan generation
   🚀 Calling Vertex AI API: https://us-central1-aiplatform.googleapis.com/...
   🎤 Using Vertex AI TTS
   ✅ Generated audio length: ...
   ```

---

## Step 7: Verify Billing is Active

1. Go to **Billing** in GCP Console
2. Ensure billing is enabled on your project
3. Confirm your **$300 credit** is showing
4. Link: https://console.cloud.google.com/billing

---

## Common Vercel-Specific Issues

### ❌ "Environment variables not found"
**Solution:**
- Make sure variable names start with `VITE_`
- Redeploy after adding variables
- Check variables are set for the right environment (Production/Preview)

### ❌ "403 CORS error" or "Referrer not allowed"
**Solution:**
- Update API key restrictions to include your Vercel domains
- Use wildcard patterns: `https://*.vercel.app/*`
- Wait 1-2 minutes for restrictions to propagate

### ❌ "API not enabled" error
**Solution:**
- Enable Vertex AI API in GCP Console
- Enable Cloud Text-to-Speech API
- Wait 1-2 minutes for activation

### ❌ Variables work locally but not on Vercel
**Solution:**
- Vercel uses `VITE_` prefix for Vite apps
- Check you added variables in Vercel dashboard
- Redeploy after adding variables

---

## Security Best Practices

✅ **DO:**
- Restrict API key to specific domains
- Use Vercel environment variables (never commit keys)
- Enable billing alerts in GCP
- Monitor API usage regularly

❌ **DON'T:**
- Commit API keys to Git
- Leave API key unrestricted
- Share API keys publicly
- Use production keys for local development

---

## Cost Monitoring

Set up billing alerts:
1. Go to: https://console.cloud.google.com/billing/
2. Click **Budgets & alerts**
3. Create budget: $50/month (for safety)
4. Set alert at 50%, 90%, 100% of budget
5. You'll get emails when approaching limits

**Your $300 credit = ~8,500 explanations before any charges**

---

## Finding Your Vercel App Name

If you don't know your Vercel app name:

1. Go to: https://vercel.com/dashboard
2. Find your project in the list
3. The name is shown on the project card
4. Or check the URL: `https://vercel.com/username/PROJECT-NAME`

Your production URL will be: `https://PROJECT-NAME.vercel.app`

---

## Example Configuration

For a Vercel project named "chalking" with custom domain "myapp.com":

**GCP API Key HTTP Referrers:**
```
https://myapp.com/*
https://*.myapp.com/*
https://chalking.vercel.app/*
https://chalking-*.vercel.app/*
https://*.vercel.app/*
```

**Vercel Environment Variables:**
```
VITE_USE_VERTEX_AI=true
VITE_GCP_PROJECT_ID=chalking-app-123456
VITE_GCP_LOCATION=us-central1
VITE_VERTEX_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

## Next Steps

1. ✅ Create API key with HTTP referrer restrictions
2. ✅ Add environment variables to Vercel
3. ✅ Push to GitHub to trigger deployment
4. ✅ Test on your Vercel URL
5. ✅ Monitor usage in GCP Console

Need help? Check deployment logs in Vercel or browser console for specific errors.
