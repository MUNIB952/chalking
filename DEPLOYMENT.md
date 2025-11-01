# Vercel Deployment Guide

## Prerequisites

- GitHub repository connected to Vercel
- Together AI API key from https://api.together.xyz/settings/api-keys

## Environment Variables Setup on Vercel

### Required Environment Variable

Go to your Vercel project settings and add the following environment variable:

```
TOGETHER_API_KEY=your_actual_together_ai_api_key
```

**Important:**
- Variable name must be exactly: `TOGETHER_API_KEY`
- Apply to: Production, Preview, and Development
- This single key provides access to both QWEN text model and Cartesia Sonic-2 voice

### Steps to Add Environment Variable:

1. Go to https://vercel.com/dashboard
2. Select your project
3. Click "Settings" tab
4. Click "Environment Variables" in the sidebar
5. Add new variable:
   - **Key**: `TOGETHER_API_KEY`
   - **Value**: Your Together AI API key
   - **Environment**: Check all (Production, Preview, Development)
6. Click "Save"

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
- **Solution**: Make sure `TOGETHER_API_KEY` is set in Vercel environment variables
- **Solution**: Redeploy after adding the environment variable

**Issue**: Build fails
- **Solution**: Check build logs in Vercel dashboard
- **Solution**: Ensure all dependencies are in package.json

**Issue**: API calls fail in production
- **Solution**: Check browser console for detailed error messages
- **Solution**: Verify API key is valid at https://api.together.xyz

## Models Used

- **Text Generation**: `Qwen/Qwen3-235B-A22B-Thinking-2507` (20k max tokens)
- **Voice Generation**: `cartesia/sonic-2` with "helpful woman" voice

## Support

If you encounter issues:

1. Check Vercel build logs
2. Check browser console for errors
3. Verify environment variables are set correctly
4. Ensure Together AI API key is valid and has credits
