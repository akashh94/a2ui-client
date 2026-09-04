FROM python:3.12-slim

WORKDIR /srv

COPY index.html .
COPY client.js .

EXPOSE 8080
# Cloud Run injects PORT; http.server binds it directly (no proxy/nginx config).
CMD python -m http.server "${PORT:-8080}" --bind 0.0.0.0
