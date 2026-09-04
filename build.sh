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
