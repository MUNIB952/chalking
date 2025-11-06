#!/bin/bash

# Google Cloud Run Setup Script
# This script sets up your project for automatic GitHub deployments

set -e

echo "🚀 Google Cloud Run Setup for Chalking"
echo "======================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Error: gcloud CLI is not installed${NC}"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

echo -e "${GREEN}✅ gcloud CLI found${NC}"

# Get project ID
echo ""
echo "Enter your Google Cloud Project ID:"
read -r PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ Error: Project ID cannot be empty${NC}"
    exit 1
fi

# Set project
echo ""
echo "Setting project to: $PROJECT_ID"
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo ""
echo -e "${YELLOW}📦 Enabling required APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    containerregistry.googleapis.com \
    secretmanager.googleapis.com

echo -e "${GREEN}✅ APIs enabled${NC}"

# Create secrets
echo ""
echo -e "${YELLOW}🔐 Setting up secrets...${NC}"
echo ""
echo "Please provide your GCP Service Account JSON (paste the entire JSON, then press Ctrl+D):"
SERVICE_ACCOUNT_JSON=$(cat)

echo "$SERVICE_ACCOUNT_JSON" | gcloud secrets create gcp-service-account --data-file=- --replication-policy=automatic || \
    echo "$SERVICE_ACCOUNT_JSON" | gcloud secrets versions add gcp-service-account --data-file=-

echo ""
echo "Enter your GCP Project ID for TTS:"
read -r TTS_PROJECT_ID
echo -n "$TTS_PROJECT_ID" | gcloud secrets create gcp-project-id --data-file=- --replication-policy=automatic || \
    echo -n "$TTS_PROJECT_ID" | gcloud secrets versions add gcp-project-id --data-file=-

echo -e "${GREEN}✅ Secrets created${NC}"

# Grant Cloud Build permission to access secrets
echo ""
echo -e "${YELLOW}🔑 Granting Cloud Build access to secrets...${NC}"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding gcp-service-account \
    --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding gcp-project-id \
    --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

echo -e "${GREEN}✅ Permissions granted${NC}"

# Connect to GitHub
echo ""
echo -e "${YELLOW}🔗 Setting up GitHub connection...${NC}"
echo ""
echo "Now you need to connect your GitHub repository:"
echo "1. Go to: https://console.cloud.google.com/cloud-build/triggers/connect?project=$PROJECT_ID"
echo "2. Select 'GitHub' as source"
echo "3. Authenticate and select your repository: MUNIB952/chalking"
echo "4. Create a trigger with these settings:"
echo "   - Name: deploy-on-push"
echo "   - Event: Push to a branch"
echo "   - Branch: ^master$|^main$"
echo "   - Configuration: Cloud Build configuration file (cloudbuild.yaml)"
echo ""
echo "Press Enter when you've completed the GitHub connection..."
read -r

# Initial deployment
echo ""
echo -e "${YELLOW}🚀 Running initial deployment...${NC}"
gcloud builds submit --config cloudbuild.yaml .

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "📋 Next steps:"
echo "  1. Your app is now deployed to Cloud Run"
echo "  2. Every push to main/master will automatically deploy"
echo "  3. Get your app URL:"
echo "     gcloud run services describe chalking --region=us-central1 --format='value(status.url)'"
echo ""
echo "🔗 Useful links:"
echo "  - Cloud Run Console: https://console.cloud.google.com/run?project=$PROJECT_ID"
echo "  - Cloud Build History: https://console.cloud.google.com/cloud-build/builds?project=$PROJECT_ID"
echo "  - Logs: https://console.cloud.google.com/logs/query?project=$PROJECT_ID"
