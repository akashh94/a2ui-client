FROM python:3.12-slim

WORKDIR /srv

# The a2ui-agent URL this client talks to (per-environment, set by deploy.sh
# from a2ui.deploy.env / deploy.personal.env). Injected as a global so
# client.js can pick it up; overridable at runtime with /?agent=<url>.
ARG AGENT_URL
RUN printf 'window.A2UI_AGENT_URL = "%s";\n' "$AGENT_URL" > agent_url.js

COPY index.html .
COPY client.js .

EXPOSE 8080
# Cloud Run injects PORT; http.server binds it directly (no proxy/nginx config).
CMD python -m http.server "${PORT:-8080}" --bind 0.0.0.0
