#!/usr/bin/env bash
#
# Deploy the a2ui-client (static demo client) to Cloud Run — personal env.
#
# Serves:
#   /            -> index.html (the A2UI demo client)
#
# Requires gcloud + docker. Sources deploy.personal.env.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

source "$PROJECT_ROOT/deploy.personal.env"

IMAGE="${ARTIFACT_REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY}/a2ui-client-personal:$(git rev-parse --short HEAD)"

# Ensure the Artifact Registry repository exists.
gcloud artifacts repositories describe "$ARTIFACT_REGISTRY" \
  --location "$ARTIFACT_REGION" >/dev/null 2>&1 || {
  echo "Repository not found; creating..."
  gcloud artifacts repositories create "$ARTIFACT_REGISTRY" \
    --repository-format docker \
    --location "$ARTIFACT_REGION"
}

echo "Building image: ${IMAGE}"
docker build -t "$IMAGE" .

echo "Pushing image..."
docker push "$IMAGE"

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
