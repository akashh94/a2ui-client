# A2UI Demo Client

A standalone browser client for the
[a2ui-agent](https://a2ui.org/guides/agent-development/) A2A service. It:

- fetches the agent's **agent card** (`/.well-known/agent-card.json`) and
  checks for the A2UI v0.9 extension,
- fetches the agent's **catalog** (`/catalog.json`) and registers its
  components (Text, Button, Row, Column, Card) as renderers,
- sends A2A JSON-RPC **`message/send`** messages with the A2UI extension and
  `a2uiClientCapabilities.supportedCatalogIds`,
- renders returned A2UI `DataPart`s (`createSurface` / `updateComponents`)
  into the page.

Pure static HTML/JS — no build step.

## Which agent does it talk to?

The agent is a **separate service**. Its base URL is resolved in this order:

1. **Per-page override** — open
   `https://<client-url>/?agent=https://<agent-url>`; the query param sets
   `window.A2UI_AGENT_URL` before `client.js` loads.
2. **Deploy-time injection** — `deploy.sh` / `deploy.personal.sh` pass the
   environment's `AGENT_URL` (from `a2ui.deploy.env` / `deploy.personal.env`)
   to `docker build --build-arg`, which writes it into `agent_url.js`.

There is **no hardcoded fallback**: a deploy that forgets to inject the URL
leaves `AGENT_URL` empty and discovery fails loudly, rather than silently
pointing at the wrong agent.

The card, catalog, and JSON-RPC URLs all derive from that single agent URL.

Because the client and agent are cross-origin, the agent's `ALLOW_ORIGINS`
env var must include this client's origin (the a2ui-agent deploy scripts set
it).

## Run locally

```bash
python -m http.server 8080
# open http://localhost:8080/?agent=https://<agent-url>
```

## Deploy (Cloud Run)

Prereqs: `gcloud` + `docker` on PATH.

```bash
# office (labs-gcp-msls-16495-1782829337 / us-east1)
./deploy.sh

# personal (adk-tut-499512 / us-central1) — deploy.personal.sh is gitignored
./deploy.personal.sh
```

After deploying, add the printed client URL to the **agent's** `ALLOW_ORIGINS`
and redeploy the agent.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page + inline `?agent=` override script |
| `client.js` | Discovery, catalog registration, A2A send, A2UI rendering |
| `Dockerfile` | Static container (`python -m http.server`, honors `$PORT`) |
| `deploy.sh` / `a2ui.deploy.env` | Office Cloud Run deploy |
| `deploy.personal.sh` / `deploy.personal.env` | Personal deploy (gitignored) |
