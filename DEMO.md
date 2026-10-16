# Demo — the agent card and the catalog

Two hand-offs make the A2UI flow work, and both happen **before** the user types
anything:

1. **Discovery** — the client reads the agent card and works out whether this
   agent speaks A2UI, and which catalogs it offers.
2. **The contract** — the client fetches one of those catalogs and checks it
   against the components it knows how to draw.

This document walks through both, with the exact code the client runs and a
captured example of each document. Nothing here needs a build step — the client
is three static files and the agent is a separate service.

---

## Part 0 — Where the agent URL comes from

Everything starts from a single base URL, resolved in this order:

1. **`?agent=<url>`** — per-page override, for pointing the browser at a
   different agent without redeploying. Set in `index.html` / `catalog.html`
   **after** `agent_url.js` loads (loading it before meant the injected value
   clobbered the override — see the note in `index.html`).
2. **`agent_url.js`** — generated at runtime by `serve.py` from the `AGENT_URL`
   env var, which `deploy*.sh` sets on the Cloud Run service. No rebuild is
   needed to point the image at a different agent.

There is deliberately **no hardcoded fallback**. A deploy that forgets to inject
the URL fails loudly at discovery rather than silently talking to the wrong
agent.

```bash
# Pin an agent for a demo without rebuilding:
http://localhost:8080/?agent=https://a2ui-agent-personal-mrqdudycsq-uc.a.run.app
```

---

## Part 1 — Getting the agent card

### The fetch

The card lives at a well-known path, so the client needs no prior knowledge
beyond the base URL (`client.js`):

```js
const AGENT_URL = (window.A2UI_AGENT_URL || "").replace(/\/$/, "");
const CARD_URL  = `${AGENT_URL}/.well-known/agent-card.json`;
```

Try it by hand — this is a good first demo beat, because it shows the "protocol"
is really just public JSON:

```bash
AGENT=https://a2ui-agent-personal-mrqdudycsq-uc.a.run.app
curl -s $AGENT/.well-known/agent-card.json | python -m json.tool
```

### What comes back

Captured live from the demo agent, trimmed to the parts that matter:

```json
{
  "name": "a2ui_agent",
  "description": "An ADK Agent",
  "version": "0.1.0",
  "url": "https://a2ui-agent-personal-mrqdudycsq-uc.a.run.app/a2a/a2ui_agent",
  "preferredTransport": "JSONRPC",
  "protocolVersion": "0.3.0",
  "capabilities": {
    "streaming": true,
    "extensions": [
      {
        "uri": "https://google.github.io/adk-docs/a2a/a2a-extension/",
        "description": "Ability to use the new agent executor implementation"
      },
      {
        "uri": "https://a2ui.org/a2a-extension/a2ui/v0.9",
        "description": "Provides agent driven UI using the A2UI JSON format.",
        "params": {
          "acceptsInlineCatalogs": true,
          "supportedCatalogIds": [
            "https://a2ui-agent-personal-mrqdudycsq-uc.a.run.app/catalog.json"
          ]
        }
      }
    ]
  },
  "skills": [
    { "id": "a2ui_agent", "name": "model", "tags": ["llm"] },
    { "id": "a2ui_agent-google_search_agent", "name": "google_search_agent", "tags": ["llm", "tools"] }
  ]
}
```

### The fields the client actually uses

| Field | Why it matters |
|---|---|
| `capabilities.extensions[]` | The whole point. This is where the agent says "I can do A2UI, here are my catalogs". |
| ↳ `uri` | The A2UI extension **and its version** — `…/a2ui/v0.9`. This is the capability gate. |
| ↳ `params.supportedCatalogIds` | The catalogs this agent can generate for. The client picks from this list. |
| ↳ `params.acceptsInlineCatalogs` | Whether the agent will accept a catalog *defined by the client* instead. `true` here, but the demo client doesn't use it. |
| `name` | Logged, and shown in the chat as `Agent card: a2ui_agent`. |
| `url` | The JSON-RPC endpoint. **Not read by this client** — it builds `/a2a/a2ui_agent` itself, so a renamed endpoint would break it. Worth knowing. |
| `preferredTransport`, `protocolVersion` | Confirms JSON-RPC and the A2A protocol version. |
| `skills[]` | What the agent can *do* (LLM + a Google-search sub-agent). Separate from what it can *render*. |

### The check the client performs

In `init()` (`client.js`) — this is the template step:

```js
const A2UI_EXT = "https://a2ui.org/a2a-extension/a2ui/v0.9";

const card = await (await fetch(CARD_URL)).json();
log("event", `Agent card: ${card.name}`);

const ext = (card.capabilities?.extensions || []).find((e) => e.uri === A2UI_EXT);
if (!ext) log("event", "WARNING: agent does not advertise the A2UI extension");
else statusEl.textContent = `A2UI ext v0.9 supported`;
```

Two things worth pointing out on stage:

- The client compares the **full versioned URI**, not a prefix. So an agent that
  upgrades to `v0.9.1` would fail this exact-match lookup and fall through to the
  warning — even though it is backwards compatible. Loosening it to a prefix
  match (`uri.startsWith("https://a2ui.org/a2a-extension/a2ui/")`) plus a version
  comparison is the correct fix.
- If this check fails, **nothing else A2UI happens** — the client still sends
  messages, but the agent returns plain text. This is Gate 1.

---

## Part 2 — Getting the catalog

### The fetch

```js
const CATALOG_URL = `${AGENT_URL}/catalog.json`;
const cat = await (await fetch(CATALOG_URL)).json();
catalogId = cat.catalogId;
```

The agent serves this itself (a small FastAPI route that reads
`app/catalog.json` and rewrites `$id` / `catalogId` to the deployed URL, so the
advertised ID always matches the environment).

### The shape

Top-level keys: `$schema`, `$id`, `title`, `description`, **`catalogId`**,
**`components`**, `$defs`.

- **`catalogId`** — the contract's name. Must equal the entry the card listed in
  `supportedCatalogIds`.
- **`components`** — `Text`, `Button`, `Row`, `Column`, `Card`. Each one is a
  JSON **Schema**, not an implementation.
- **`$defs`** — shared definitions (`CatalogComponentCommon`, `anyComponent`,
  `anyFunction`).

Here is `Button`, trimmed — note that this describes *what may be sent*, and
says nothing about how to draw it:

```json
{
  "Button": {
    "allOf": [
      { "$ref": "common_types.json#/$defs/ComponentCommon" },
      { "$ref": "#/$defs/CatalogComponentCommon" },
      { "$ref": "common_types.json#/$defs/Checkable" },
      {
        "type": "object",
        "properties": {
          "component": { "const": "Button" },
          "child":     { "$ref": "common_types.json#/$defs/ComponentId" },
          "variant":   { "enum": ["default", "primary", "borderless"], "default": "default" },
          "action":    { "$ref": "common_types.json#/$defs/Action" }
        },
        "required": ["component", "child", "action"]
      }
    ]
  }
}
```

### The three-way identity

This is the slide worth pausing on. The same string appears in three places, and
that agreement *is* the contract:

```
agent card . capabilities.extensions[].params.supportedCatalogIds[0]
        ══  catalog.json . catalogId
        ══  the message . metadata.a2uiClientCapabilities.supportedCatalogIds[0]
```

The client closes the loop when it sends a message (`client.js`):

```js
const message = {
  messageId: `m-${crypto.randomUUID()}`,
  role: "user",
  parts: [{ text }],
  extensions: [A2UI_EXT],                                    // Gate 1: I speak A2UI
  metadata: catalogId
    ? { a2uiClientCapabilities: { supportedCatalogIds: [catalogId] } }   // Gate 2: this catalog
    : undefined,
};
```

**What crosses the wire is the catalog's ID — never the component names.** The
agent matches that ID against the catalogs it supports, picks one, and injects
that catalog's schemas and examples into the model prompt, so the model can only
emit components from it.

---

## Part 3 — Checking the catalog against the client's renderers

### What the client can draw

The renderers are a fixed list in `a2ui-render.js`:

```js
// The component names this client knows how to render.
const COMPONENTS = ["Text", "Button", "Row", "Column", "Card"];

function makeRenderers(onAction) {
  return {
    Text:   (props) => { /* … */ },
    Button: (props) => { /* … */ },
    Row:    (props) => { /* … */ },
    Column: (props) => { /* … */ },
    Card:   (props) => { /* … */ },
  };
}
```

So "does the client support this catalog?" reduces to a name match:

```
catalog.json . components.<Name>   →   renderers[<Name>]
```

Everything else — which CSS classes, which DOM element, how children attach —
lives in this file and `a2ui.css`. The catalog cannot express it, which is why
every platform writes its own renderers.

### The one check it does perform: the surface's catalogId

Every `createSurface` message names the catalog it was built against. The client
compares that against the ID it registered, and warns if they differ
(`a2ui-render.js`):

```js
if (msg.createSurface) {
  const { surfaceId, catalogId } = msg.createSurface;
  const registered = getCatalogId();
  if (catalogId && catalogId !== registered)
    onEvent(`warning: surface catalog ${catalogId} != registered ${registered}`);
  // …then mount the surface
}
```

This is the client verifying that the agent honoured the negotiation — it catches
an agent that generated against some *other* catalog. Note it is a **warning,
not a rejection**: the surface is mounted anyway and the mismatch shows up as a
line in the chat log:

```
warning: surface catalog https://…/other.json != registered https://…/catalog.json
```

### The gap worth admitting on stage

`loadCatalog()` **logs** the component names; it does not compare them:

```js
log("event", `Registered catalog ${catalogId} with components: ${Object.keys(cat.components).join(", ")}`);
```

So the check is implicit, and it happens late — at render time, component by
component:

```js
const renderer = renderers[c.component];
if (!renderer) {
  onEvent(`no renderer for component '${c.component}'`);
  return;                       // the component is skipped, silently
}
```

What a mismatch looks like:

- A non-root component goes missing, and children referring to it are dropped
  too.
- If the **root** has no renderer, the surface stays empty — you get the dashed
  surface box with nothing in it, and no error.

If the agent ever adds a sixth component to `catalog.json`, the client will
happily declare that catalog ID, fetch the file without complaint, and only
reveal the problem when the UI fails to appear. Nothing on the wire prevents it.

### Closing the gap

The check is a few lines, and this is the natural place for it — right after the
fetch, while you still have `cat.components`:

```js
const declared   = Object.keys(cat.components);
const renderable = A2UI.COMPONENTS;
const missing    = declared.filter((name) => !renderable.includes(name));
const extra      = renderable.filter((name) => !declared.includes(name));

if (missing.length) log("event", `WARNING: catalog declares components with no renderer: ${missing.join(", ")}`);
if (extra.length)   log("event", `note: renderers not offered by this catalog: ${extra.join(", ")}`);
```

`missing` is the dangerous direction. Failing loudly here turns a silent blank
surface during a demo into a readable line in the chat log.

---

## Part 4 — The 60-second demo

1. **`curl` the card.** Point at `capabilities.extensions` → *"this is how the
   client learns A2UI is available and which catalogs exist. Plain JSON, no SDK."*
2. **`curl` the catalog.** Point at `catalogId` and the `components` schemas →
   *"this is the vocabulary. Compare the ID to what the card advertised — same
   string."*
3. **Open `/catalog.html`.** *"These are the client's renderers, drawn from
   static payloads — no agent, no network."* Click a button to show the
   `action.event.name` it would send back.
4. **Open `/` and send a UI prompt.** Then DevTools → Network → the POST to
   `/a2a/a2ui_agent`. Show that it carries `extensions` + `supportedCatalogIds`,
   and that the response comes back as `data` parts, not text.
5. **Back to `/catalog.html`** if the model misbehaves — it always renders.

---

## Files referenced

| File | Role |
|---|---|
| `client.js` | Discovery, catalog fetch, JSON-RPC send, dispatch of text vs data parts |
| `a2ui-render.js` | The renderers and the surface host (shared with the gallery) |
| `a2ui.css` | Component styling — the other half of "what a component looks like" |
| `catalog.html` / `catalog.js` | The no-agent component gallery |
| `agent_url.js` | Generated at runtime by `serve.py` from the `AGENT_URL` env var |
