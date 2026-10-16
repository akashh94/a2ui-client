#!/usr/bin/env bash
#
# Deploy the a2ui-client (static demo client) to Cloud Run — personal env.
# Deploys the image built by ./build.personal.sh (same git sha tag).
#
# Serves:
#   /            -> index.html (the A2UI demo client)
#
# The agent this client talks to is injected at runtime as AGENT_URL (serve.py
# generates /agent_url.js from it) and can be overridden per page with
# /?agent=<url>.

set -euo pipefail

# Resolve this project's root.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Personal environment config (self-contained): PROJECT_ID / REGION /
# ARTIFACT_REGISTRY / ARTIFACT_REGION / SERVICE_NAME / APP_URL / AGENT_URL all
# come from deploy.personal.env — the single source of truth for the personal
# deployment.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy.personal.env"

IMAGE="${ARTIFACT_REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY}/a2ui-client-personal:$(git rev-parse --short HEAD)"

# Cloud Run injects PORT; serve.py binds it. Public demo.
gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --min-instances 1 \
    --max-instances 1 \
    --set-env-vars "AGENT_URL=${AGENT_URL}"

SERVICE_URL="https://${SERVICE_NAME}-$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)').${REGION}.run.app"
echo "Deployed: ${SERVICE_URL}"
echo "Demo client: ${SERVICE_URL}/"
echo "Agent: ${AGENT_URL}"
