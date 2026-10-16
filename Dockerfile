FROM python:3.12-slim

WORKDIR /srv

COPY index.html .
COPY catalog.html .
COPY a2ui.css .
COPY a2ui-render.js .
COPY client.js .
COPY catalog.js .
COPY serve.py .

EXPOSE 8080
# Cloud Run injects PORT. serve.py serves the static files and generates
# /agent_url.js from the AGENT_URL env var, with Cache-Control: no-store so a
# redeploy takes effect without a hard refresh.
CMD ["python", "serve.py"]
