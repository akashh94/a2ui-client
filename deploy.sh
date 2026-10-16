#!/usr/bin/env bash
#
# Deploy the a2ui-client (static demo client) to Cloud Run — office env.
# Deploys the image built by ./build.sh (same git sha tag).
#
# Serves:
#   /            -> index.html (the A2UI demo client)
#
# The agent this client talks to is injected at runtime as AGENT_URL (serve.py
# generates /agent_url.js from it) and can be overridden per page with
# /?agent=<url>. After deploying, add this client's URL to the a2ui-agent
# service's ALLOW_ORIGINS (the client talks to the agent cross-origin).

set -euo pipefail

# Resolve this project's root.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Office environment config (self-contained): PROJECT_ID / REGION /
# ARTIFACT_REGISTRY / ARTIFACT_REGION / SERVICE_NAME / APP_URL / AGENT_URL all
# come from a2ui.deploy.env — the single source of truth for the office
# deployment.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/a2ui.deploy.env"

IMAGE="${ARTIFACT_REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY}/a2ui-client:$(git rev-parse --short HEAD)"

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
echo "Then add ${SERVICE_URL} to the agent's ALLOW_ORIGINS and redeploy the agent."
