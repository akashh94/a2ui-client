#!/usr/bin/env bash
#
# Deploy the a2ui-client (static demo client) to Cloud Run — office env.
#
# Serves:
#   /            -> index.html (the A2UI demo client)
#
# Requires gcloud + docker. Sources a2ui.deploy.env.
# After deploying, add this client's URL to the a2ui-agent service's
# ALLOW_ORIGINS env var (the client talks to the agent cross-origin).
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

source "$PROJECT_ROOT/a2ui.deploy.env"

IMAGE="${ARTIFACT_REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY}/a2ui-client:$(git rev-parse --short HEAD)"

# Ensure the Artifact Registry repository exists.
gcloud artifacts repositories describe "$ARTIFACT_REGISTRY" \
  --location "$ARTIFACT_REGION" >/dev/null 2>&1 || {
  echo "Repository not found; creating..."
  gcloud artifacts repositories create "$ARTIFACT_REGISTRY" \
    --repository-format docker \
    --location "$ARTIFACT_REGION"
}

echo "Building image: ${IMAGE}"
docker build -t "$IMAGE" --build-arg AGENT_URL="${AGENT_URL}" .

echo "Pushing image..."
docker push "$IMAGE"

# Cloud Run injects PORT; the python http.server binds it. Public demo.
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 1 \
  --max-instances 1

SERVICE_URL="https://${SERVICE_NAME}-$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)').${REGION}.run.app"
echo "Deployed: ${SERVICE_URL}"
echo "Demo client: ${SERVICE_URL}/"
echo "Point it at an agent with: ${SERVICE_URL}/?agent=https://<agent-url>"
echo "If APP_URL placeholder, update a2ui.deploy.env and redeploy."
echo "Then add ${SERVICE_URL} to the agent's ALLOW_ORIGINS and redeploy the agent."
