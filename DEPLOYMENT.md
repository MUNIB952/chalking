# Vercel Deployment Guide

## Prerequisites

- GitHub repository connected to Vercel
- Gemini API key from https://aistudio.google.com/apikey
- Deepgram API key from https://console.deepgram.com/

## Environment Variables Setup on Vercel

### Required Environment Variables

Go to your Vercel project settings and add the following environment variables:

```
GEMINI_API_KEY=your_actual_gemini_api_key
DEEPGRAM_API_KEY=your_actual_deepgram_api_key
```

**Important:**
- Variable names must be exactly: `GEMINI_API_KEY` and `DEEPGRAM_API_KEY`
- Apply to: Production, Preview, and Development
- GEMINI_API_KEY: Used for text generation with Gemini 2.5 Pro
- DEEPGRAM_API_KEY: Used for voice generation with Deepgram TTS

### Steps to Add Environment Variables:

1. Go to https://vercel.com/dashboard
2. Select your project
3. Click "Settings" tab
4. Click "Environment Variables" in the sidebar
5. Add first variable:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: Your Gemini API key
   - **Environment**: Check all (Production, Preview, Development)
6. Click "Save"
7. Add second variable:
   - **Key**: `DEEPGRAM_API_KEY`
   - **Value**: Your Deepgram API key
   - **Environment**: Check all (Production, Preview, Development)
8. Click "Save"

## Deployment Process

### Automatic Deployment

Vercel automatically deploys when you push to GitHub:

```bash
git push origin claude/check-last-push-time-011CUhSajjCHC6nxX3mS2Ppj
```

### Manual Deployment

If needed, trigger a manual deployment:

1. Go to Vercel dashboard
2. Click "Deployments" tab
3. Click "Redeploy" on the latest deployment

## Build Configuration

The project is configured with:

- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node Version**: Auto-detected (18.x or higher recommended)

## Verifying Deployment

After deployment:

1. Check build logs for any errors
2. Visit your deployment URL
3. Open browser DevTools Console
4. Try requesting an explanation
5. Check for API errors in console

### Common Issues

**Issue**: "API key not defined" error
- **Solution**: Make sure `GEMINI_API_KEY` is set in Vercel environment variables
- **Solution**: Redeploy after adding the environment variable

**Issue**: Build fails
- **Solution**: Check build logs in Vercel dashboard
- **Solution**: Ensure all dependencies are in package.json

**Issue**: API calls fail in production
- **Solution**: Check browser console for detailed error messages
- **Solution**: Verify API key is valid at https://aistudio.google.com/apikey

## Models Used

- **Text Generation**: `gemini-2.5-pro` (60k max tokens, high thinking capability)
- **Voice Generation**: Deepgram Aura Asteria (natural female voice)

## Support

If you encounter issues:

1. Check Vercel build logs
2. Check browser console for errors
3. Verify environment variables are set correctly
4. Ensure Gemini API key is valid and has quota available
