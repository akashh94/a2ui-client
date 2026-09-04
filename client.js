// Minimal A2UI demo client: discovers the agent card, registers the custom
// catalog's components as renderers, sends A2A JSON-RPC messages with the
// A2UI extension, and renders incoming A2UI DataParts into the #surface div.
//
// The agent is a separate service. Its base URL is resolved in this order:
//   1. /?agent=<agent-url> runtime override (index.html sets A2UI_AGENT_URL),
//   2. agent_url.js injected at deploy time (per-environment AGENT_URL),
//   3. fallback below for purely-local use.
const AGENT_URL = (window.A2UI_AGENT_URL || "https://a2ui-agent-personal-947331501288.us-central1.run.app").replace(/\/$/, "");
const CARD_URL = `${AGENT_URL}/.well-known/agent-card.json`;
const CATALOG_URL = `${AGENT_URL}/catalog.json`;
const RPC_URL = `${AGENT_URL}/a2a/a2ui_agent`; // A2A JSON-RPC endpoint (single POST)

const A2UI_EXT = "https://a2ui.org/a2a-extension/a2ui/v0.9";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

// ---- tiny state ----
let catalogId = null;
let surfaceEl = null; // current surface DOM root (per surfaceId)
const componentEls = new Map(); // component id -> element

// ---- component renderers: catalog component name -> props => element ----
// NOTE: renderers only CREATE the element. Children are attached afterwards in
// a separate mount pass (renderA2UI), because components can be listed in any
// order — a parent may be created before its children exist.
const renderers = {
  Text: (props) => {
    const el = document.createElement("div");
    el.className = `a2ui-text ${props.variant || "body"}`;
    el.textContent = props.text ?? "";
    return el;
  },
  Button: (props) => {
    const el = document.createElement("button");
    el.className = `a2ui-btn ${props.variant || "default"}`;
    if (props.action?.event?.name) {
      el.addEventListener("click", () => logEvent(`button clicked: ${props.action.event.name}`));
    }
    return el;
  },
  Row: (props) => {
    const el = document.createElement("div");
    el.className = "a2ui-row";
    if (props.justify) el.style.justifyContent = justifyToCss(props.justify);
    if (props.align) el.style.alignItems = alignToCss(props.align);
    return el;
  },
  Column: (props) => {
    const el = document.createElement("div");
    el.className = "a2ui-col";
    if (props.justify) el.style.justifyContent = justifyToCss(props.justify);
    if (props.align) el.style.alignItems = alignToCss(props.align);
    return el;
  },
  Card: (props) => {
    const el = document.createElement("div");
    el.className = "a2ui-card";
    if (props.title) {
      const t = document.createElement("div");
      t.className = "a2ui-title";
      t.textContent = props.title;
      el.appendChild(t);
    }
    return el;
  },
};

function justifyToCss(v) {
  return { spaceBetween: "space-between", spaceAround: "space-around", spaceEvenly: "space-evenly" }[v] || v;
}
function alignToCss(v) {
  return v;
}
// Reference types that hold children by id: component name -> key holding the id(s).
const CHILD_REF_KEYS = { Button: "child", Card: "child", Row: "children", Column: "children" };

// ---- catalog registration ----
async function loadCatalog() {
  const cat = await (await fetch(CATALOG_URL)).json();
  catalogId = cat.catalogId;
  statusEl.textContent = `catalog: ${catalogId}`;
  log("event", `Registered catalog ${catalogId} with components: ${Object.keys(cat.components).join(", ")}`);
}

// ---- A2A JSON-RPC (message/send; single POST, JSON result) ----
async function sendMessage(text) {
  log("user", text);
  const message = {
    messageId: `m-${crypto.randomUUID()}`,
    role: "user",
    parts: [{ text }],
    extensions: [A2UI_EXT],
    metadata: catalogId ? { a2uiClientCapabilities: { supportedCatalogIds: [catalogId] } } : undefined,
  };

  try {
    const resp = await fetch(`${RPC_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        jsonrpc: "2.0",
        method: "message/send",
        params: { message },
      }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${err.slice(0, 400)}`);
    }
    const rpc = await resp.json();
    if (rpc.error) throw new Error(JSON.stringify(rpc.error));
    handleTaskResult(rpc.result);
  } catch (e) {
    log("event", `error: ${e.message}`);
    statusEl.textContent = "error";
  }
}

function handleTaskResult(result) {
  // A failed/malformed turn (e.g. the model emitted the tool call as text)
  // carries a text part that is NOT a real answer — surface a clean message.
  const failed =
    result.status?.state === "failed" ||
    (result.artifacts || []).some((a) =>
      (a.parts || []).some((p) => p.text && /malformed function call/i.test(p.text))
    );
  if (failed) {
    log("event", "The agent could not generate the UI (malformed tool call). Please try again.");
    statusEl.textContent = "failed — try again";
    return;
  }
  // result.artifacts[].parts[] and result.history[] carry Text + Data parts.
  const parts = [];
  (result.artifacts || []).forEach((a) => (a.parts || []).forEach((p) => parts.push(p)));
  (result.history || []).forEach((m) => {
    if (m.role === "agent") (m.parts || []).forEach((p) => parts.push(p));
  });
  parts.forEach((p) => {
    if (p.kind === "text") log("agent", p.text);
    else if (p.kind === "data" && p.data) renderA2UI(p.data);
  });
  if (result.status?.state) statusEl.textContent = result.status.state;
}

// ---- A2UI rendering ----
function renderA2UI(msg) {
  if (msg.createSurface) {
    const { surfaceId, catalogId: cid } = msg.createSurface;
    if (cid && cid !== catalogId) log("event", `warning: surface catalog ${cid} != registered ${catalogId}`);
    surfaceEl = document.createElement("div");
    surfaceEl.dataset.surfaceId = surfaceId;
    $("surface").replaceChildren(surfaceEl);
    componentEls.clear();
    log("event", `createSurface ${surfaceId}`);
  } else if (msg.updateComponents) {
    const { components } = msg.updateComponents;
    if (!surfaceEl) {
      surfaceEl = document.createElement("div");
      $("surface").replaceChildren(surfaceEl);
      componentEls.clear();
    }
    // Pass 1: create every component element (children are not attached yet).
    const byId = new Map(components.map((c) => [c.id, c]));
    components.forEach((c) => {
      if (componentEls.has(c.id)) return; // already rendered (e.g. repeated update)
      const renderer = renderers[c.component];
      if (!renderer) {
        log("event", `no renderer for component '${c.component}'`);
        return;
      }
      const el = renderer(c);
      el.dataset.cid = c.id;
      componentEls.set(c.id, el);
    });
    // Pass 2: mount children into parents (parents may appear before children).
    components.forEach((c) => {
      const parent = componentEls.get(c.id);
      if (!parent) return;
      if (c.component === "Button") {
        // A Button's child is its label Text — show the label's text on the button.
        const label = componentEls.get(c.child);
        if (label) parent.textContent = label.textContent;
        return;
      }
      const key = CHILD_REF_KEYS[c.component];
      const refs = key === "children" ? c.children || [] : c.child ? [c.child] : [];
      refs.forEach((childId) => {
        const child = componentEls.get(childId);
        if (child) parent.appendChild(child);
        else if (byId.has(childId)) log("event", `component '${childId}' has no renderer`);
      });
    });
    // Attach root: find the component with no parent reference (children/child refs).
    const refd = new Set();
    components.forEach((c) => {
      const key = CHILD_REF_KEYS[c.component];
      const refs = key === "children" ? c.children || [] : c.child ? [c.child] : [];
      refs.forEach((id) => refd.add(id));
    });
    const root = components.find((c) => !refd.has(c.id));
    if (root) {
      const el = componentEls.get(root.id);
      if (el) surfaceEl.replaceChildren(el);
    }
    log("event", `updateComponents (${components.length} components)`);
  }
}

function log(cls, text) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  $("chatLog").appendChild(div);
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
}
function logEvent(text) {
  log("event", `⏎ ${text}`);
}

async function init() {
  try {
    const card = await (await fetch(CARD_URL)).json();
    log("event", `Agent card: ${card.name}`);
    const ext = (card.capabilities?.extensions || []).find((e) => e.uri === A2UI_EXT);
    if (!ext) log("event", "WARNING: agent does not advertise the A2UI extension");
    else statusEl.textContent = `A2UI ext v0.9 supported`;
    await loadCatalog();
  } catch (e) {
    log("event", `discovery failed: ${e.message}`);
    statusEl.textContent = "discovery failed";
  }
}

$("send").addEventListener("click", () => {
  const v = $("prompt").value.trim();
  if (v) sendMessage(v);
});
$("prompt").addEventListener("keydown", (e) => { if (e.key === "Enter") $("send").click(); });
$("demoA2UI").addEventListener("click", () => sendMessage("show me an A2UI demo with a button and some text"));
$("demoText").addEventListener("click", () => sendMessage("what is the capital of France?"));

init();
