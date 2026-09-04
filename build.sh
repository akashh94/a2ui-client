#!/usr/bin/env bash
#
# Build (lint/verify) for the a2ui-client static demo client.
# The image itself is built by deploy.sh / deploy.personal.sh.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Static site: no compile step. Verify the JS parses and the HTML references
# the files it ships.
node --check client.js
echo "client.js: syntax OK"

for f in index.html client.js; do
  if [ ! -f "$f" ]; then
    echo "error: missing $f" >&2
    exit 1
  fi
done
echo "static files present: index.html client.js"

# agent_url.js is generated at image build time from the AGENT_URL build arg;
# it is not in the repo. Warn if a deploy forgot to inject it (a missing file
# would leave the client pointing at client.js's local fallback).
if [ ! -f agent_url.js ]; then
  echo "note: agent_url.js not present (generated at docker build from AGENT_URL)"
fi
