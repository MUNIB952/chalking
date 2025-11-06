# Google Cloud Run Deployment Guide

This guide explains how to deploy Chalking to Google Cloud Run with automatic GitHub deployments.

## Architecture Overview

### Vercel (Previous)
```
GitHub Push → Vercel Build → Deploy
                ↓
            Serverless Functions (/api/tts)
            Static Files (React app)
```

### Google Cloud Run (Current)
```
GitHub Push → Cloud Build → Container Registry → Cloud Run
                                                    ↓
                                            Express Server
                                            ├── Static Files (React app)
                                            └── API Endpoints (/api/tts)
```

## Key Differences

| Feature | Vercel | Google Cloud Run |
|---------|--------|------------------|
| **Hosting** | Serverless Edge Functions | Containerized Express Server |
| **Build** | Automatic on push | Cloud Build + Docker |
| **API** | `/api` folder functions | Express routes in server.js |
| **Port** | Auto-assigned | 8080 (standard) |
| **Secrets** | Environment Variables | Secret Manager |
| **Cold Start** | ~100ms | ~300ms (with min-instances=0) |

## Prerequisites

1. **Google Cloud SDK** - Install from [https://cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)
2. **Google Cloud Project** - Create at [https://console.cloud.google.com](https://console.cloud.google.com)
3. **Billing Enabled** - Required for Cloud Run
4. **GCP Service Account JSON** - For Text-to-Speech API
5. **Docker** (Optional) - For local testing

## Setup Instructions

### Step 1: Run Automated Setup

The easiest way to set up everything:

```bash
chmod +x setup-gcloud.sh
./setup-gcloud.sh
```

This script will:
- ✅ Check gcloud CLI installation
- ✅ Enable required APIs
- ✅ Create secrets (GCP_SERVICE_ACCOUNT_JSON, GCP_PROJECT_ID)
- ✅ Grant Cloud Build permissions
- ✅ Guide GitHub connection
- ✅ Run initial deployment

### Step 2: Connect GitHub Repository

After the script prompts, go to:
```
https://console.cloud.google.com/cloud-build/triggers/connect?project=YOUR_PROJECT_ID
```

1. Select **GitHub** as source
2. Authenticate with GitHub
3. Select repository: **MUNIB952/chalking**
4. Create a trigger:
   - **Name**: `deploy-on-push`
   - **Event**: Push to a branch
   - **Branch**: `^master$|^main$`
   - **Configuration**: Cloud Build configuration file (`cloudbuild.yaml`)

### Step 3: Verify Deployment

Get your app URL:
```bash
gcloud run services describe chalking \
  --region=us-central1 \
  --format='value(status.url)'
```

Visit the URL to verify your app is running.

## Manual Setup (If Automated Script Fails)

### 1. Enable Required APIs

```bash
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    containerregistry.googleapis.com \
    secretmanager.googleapis.com
```

### 2. Create Secrets

```bash
# Create GCP_SERVICE_ACCOUNT_JSON secret
cat service-account.json | gcloud secrets create gcp-service-account \
    --data-file=- \
    --replication-policy=automatic

# Create GCP_PROJECT_ID secret
echo -n "your-project-id" | gcloud secrets create gcp-project-id \
    --data-file=- \
    --replication-policy=automatic
```

### 3. Grant Permissions

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding gcp-service-account \
    --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding gcp-project-id \
    --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 4. Initial Deployment

```bash
gcloud builds submit --config cloudbuild.yaml .
```

## Local Testing

### Test with Docker

```bash
# Build the Docker image
docker build -t chalking .

# Run locally
docker run -p 8080:8080 \
  -e GCP_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  -e GCP_PROJECT_ID='your-project-id' \
  chalking

# Visit http://localhost:8080
```

### Test Express Server

```bash
# Build Vite app
npm run build

# Set environment variables
export GCP_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
export GCP_PROJECT_ID='your-project-id'

# Start server
npm start

# Visit http://localhost:8080
```

## Deployment Workflow

### Automatic Deployment (GitHub → Cloud Run)

```
1. Make changes to code
2. Commit and push to main/master:
   git add .
   git commit -m "Your changes"
   git push origin main

3. Cloud Build automatically:
   - Builds Docker image
   - Pushes to Container Registry
   - Deploys to Cloud Run

4. Visit your app URL (usually takes 2-3 minutes)
```

### Manual Deployment

```bash
# Deploy specific commit
gcloud builds submit --config cloudbuild.yaml .

# Or deploy with custom image tag
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=COMMIT_SHA=custom-tag .
```

## Environment Variables

### Configured in cloudbuild.yaml

| Variable | Source | Description |
|----------|--------|-------------|
| `NODE_ENV` | Set directly | Set to `production` |
| `PORT` | Set directly | Set to `8080` |
| `GCP_SERVICE_ACCOUNT_JSON` | Secret Manager | Service account credentials |
| `GCP_PROJECT_ID` | Secret Manager | GCP project ID for TTS |

### Updating Secrets

```bash
# Update GCP_SERVICE_ACCOUNT_JSON
cat new-service-account.json | gcloud secrets versions add gcp-service-account --data-file=-

# Update GCP_PROJECT_ID
echo -n "new-project-id" | gcloud secrets versions add gcp-project-id --data-file=-

# Redeploy to use new secrets
gcloud run services update chalking \
  --region=us-central1 \
  --set-secrets=GCP_SERVICE_ACCOUNT_JSON=gcp-service-account:latest,GCP_PROJECT_ID=gcp-project-id:latest
```

## Monitoring and Logs

### View Logs

```bash
# Stream logs
gcloud run services logs tail chalking --region=us-central1

# View logs in console
https://console.cloud.google.com/logs/query?project=YOUR_PROJECT_ID
```

### View Metrics

```bash
# Open Cloud Run console
https://console.cloud.google.com/run?project=YOUR_PROJECT_ID
```

Metrics available:
- Request count
- Request latency
- Instance count
- CPU utilization
- Memory utilization

### View Build History

```bash
# Open Cloud Build history
https://console.cloud.google.com/cloud-build/builds?project=YOUR_PROJECT_ID
```

## Troubleshooting

### Build Fails: "Permission Denied"

**Problem**: Cloud Build doesn't have permission to access secrets.

**Solution**:
```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding gcp-service-account \
    --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### Deployment Fails: "Container failed to start"

**Problem**: Server.js or environment variables not configured correctly.

**Solution**: Check logs:
```bash
gcloud run services logs read chalking --region=us-central1 --limit=50
```

Common issues:
- Missing `GCP_SERVICE_ACCOUNT_JSON` secret
- Invalid JSON in service account credentials
- Port not set to 8080

### TTS API Errors: "Invalid credentials"

**Problem**: Service account JSON is malformed or missing permissions.

**Solution**:
1. Verify service account has "Cloud Text-to-Speech User" role
2. Check JSON format is valid:
```bash
gcloud secrets versions access latest --secret=gcp-service-account | jq .
```

### Cold Start is Slow

**Problem**: First request takes 3-5 seconds after inactivity.

**Solution**: Set minimum instances (costs more):
```bash
gcloud run services update chalking \
  --region=us-central1 \
  --min-instances=1
```

### GitHub Trigger Not Working

**Problem**: Push to main branch doesn't trigger deployment.

**Solution**: Check trigger configuration:
```bash
gcloud builds triggers list

# Verify branch regex matches: ^master$|^main$
# Verify cloudbuild.yaml path is correct
```

## Cost Estimates

### Cloud Run Pricing (us-central1)

| Resource | Free Tier | Pricing |
|----------|-----------|---------|
| **CPU** | 180,000 vCPU-seconds/month | $0.00002400/vCPU-second |
| **Memory** | 360,000 GiB-seconds/month | $0.00000250/GiB-second |
| **Requests** | 2 million requests/month | $0.40/million requests |

**Estimated Monthly Cost** (based on 10,000 requests/month):
- Free tier covers most usage
- TTS API: ~$4-$16/month (1 million characters = $4)
- Total: **$0-$20/month** (mostly TTS costs)

### Cloud Build Pricing

| Resource | Free Tier | Pricing |
|----------|-----------|---------|
| **Build minutes** | 120 build-minutes/day | $0.003/build-minute |

**Estimated**: $0/month (free tier sufficient for most projects)

## Configuration Files Reference

### server.js
Express server that:
- Serves Vite-built React app from `/dist`
- Handles `/api/tts` endpoint for Text-to-Speech
- Runs on port 8080

### Dockerfile
Multi-stage Docker build:
1. **Builder stage**: Installs dependencies, runs Vite build
2. **Production stage**: Copies build artifacts, runs server.js

### cloudbuild.yaml
Cloud Build configuration:
- Builds Docker image
- Pushes to Container Registry
- Deploys to Cloud Run with secrets

### .dockerignore
Excludes unnecessary files from Docker image:
- node_modules (reinstalled in container)
- .git, .env files
- Vercel-specific files
- Documentation files

## Useful Commands

### Deploy
```bash
# Automatic (push to GitHub)
git push origin main

# Manual (from local)
gcloud builds submit --config cloudbuild.yaml .
```

### View Service
```bash
# Get URL
gcloud run services describe chalking --region=us-central1 --format='value(status.url)'

# Get status
gcloud run services describe chalking --region=us-central1
```

### Update Configuration
```bash
# Update memory
gcloud run services update chalking --region=us-central1 --memory=1Gi

# Update CPU
gcloud run services update chalking --region=us-central1 --cpu=2

# Update min/max instances
gcloud run services update chalking --region=us-central1 --min-instances=1 --max-instances=20
```

### Delete Service
```bash
# Delete Cloud Run service
gcloud run services delete chalking --region=us-central1

# Delete secrets
gcloud secrets delete gcp-service-account
gcloud secrets delete gcp-project-id

# Delete images
gcloud container images list
gcloud container images delete gcr.io/YOUR_PROJECT_ID/chalking:TAG
```

## Support

- **Cloud Run Documentation**: [https://cloud.google.com/run/docs](https://cloud.google.com/run/docs)
- **Cloud Build Documentation**: [https://cloud.google.com/build/docs](https://cloud.google.com/build/docs)
- **TTS API Documentation**: [https://cloud.google.com/text-to-speech/docs](https://cloud.google.com/text-to-speech/docs)

## Next Steps

1. ✅ Run `./setup-gcloud.sh` to configure your project
2. ✅ Connect GitHub repository to Cloud Build
3. ✅ Verify initial deployment works
4. ✅ Make a test commit to verify auto-deployment
5. ✅ Set up monitoring and alerting (optional)
6. ✅ Configure custom domain (optional)

## Migration Checklist

- [ ] Google Cloud project created
- [ ] Billing enabled
- [ ] gcloud CLI installed
- [ ] Service account JSON obtained
- [ ] setup-gcloud.sh executed successfully
- [ ] GitHub repository connected
- [ ] Initial deployment successful
- [ ] App accessible via Cloud Run URL
- [ ] TTS functionality working
- [ ] Auto-deployment tested with a commit
- [ ] Monitoring configured
- [ ] Old Vercel deployment removed (optional)

---

**🎉 Congratulations!** Your app is now deployed to Google Cloud Run with automatic GitHub deployments!
