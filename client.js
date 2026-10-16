// Minimal A2UI demo client: discovers the agent card, registers the custom
// catalog's components as renderers, sends A2A JSON-RPC messages with the
// A2UI extension, and renders incoming A2UI DataParts inline in the chat
// timeline (text and rendered UI share one scrolling transcript).
//
// The agent is a separate service. Its base URL is resolved in this order:
//   1. /?agent=<agent-url> runtime override (index.html sets A2UI_AGENT_URL),
//   2. agent_url.js injected at deploy time (per-environment AGENT_URL).
// No hardcoded fallback: a deploy that forgets to inject the URL fails
// loudly at discovery instead of silently pointing at the wrong agent.
const AGENT_URL = (window.A2UI_AGENT_URL || "").replace(/\/$/, "");
const CARD_URL = `${AGENT_URL}/.well-known/agent-card.json`;
const CATALOG_URL = `${AGENT_URL}/catalog.json`;
const RPC_URL = `${AGENT_URL}/a2a/a2ui_agent`; // A2A JSON-RPC endpoint (single POST)

const A2UI_EXT = "https://a2ui.org/a2a-extension/a2ui/v0.9";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

// ---- tiny state ----
let catalogId = null;

// Rendering lives in a2ui-render.js, shared with the catalog gallery. The host
// keeps per-surface state and appends each surface block to the chat timeline.
const surfaceHost = A2UI.createSurfaceHost({
  container: $("chatLog"),
  getCatalogId: () => catalogId,
  onEvent: (text) => log("event", text),
  onSurfaceMounted: scrollChat,
  onAction: (name) => logEvent(`button clicked: ${name}`),
});
function renderA2UI(msg) {
  surfaceHost.render(msg);
}

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
  // artifacts[] is the agent's final output and history[] echoes the same
  // parts, so prefer artifacts to avoid logging/rendering everything twice.
  const artifacts = result.artifacts || [];
  const parts = [];
  if (artifacts.length) {
    artifacts.forEach((a) => (a.parts || []).forEach((p) => parts.push(p)));
  } else {
    (result.history || []).forEach((m) => {
      if (m.role === "agent") (m.parts || []).forEach((p) => parts.push(p));
    });
  }

  // A failed turn — or one where the model wrote the tool call as text
  // instead of making a real function call — carries no Data parts. That text
  // is not an answer, so ask for a retry instead of dumping the raw call.
  const hasData = parts.some((p) => p.kind === "data");
  const bogusCall = parts.some(
    (p) => p.kind === "text" && /send_a2ui_json_to_client\(|malformed function call/i.test(p.text || "")
  );
  if (result.status?.state === "failed" || (bogusCall && !hasData)) {
    log("event", "The agent could not generate the UI (it wrote the tool call as text instead of calling it). Please try again.");
    statusEl.textContent = "failed — try again";
    return;
  }

  parts.forEach((p) => {
    if (p.kind === "text") log("agent", p.text);
    else if (p.kind === "data" && p.data) renderA2UI(p.data);
  });
  if (result.status?.state) statusEl.textContent = result.status.state;
}

function log(cls, text) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  $("chatLog").appendChild(div);
  scrollChat();
}
function scrollChat() {
  const el = $("chatLog");
  el.scrollTop = el.scrollHeight;
}
function logEvent(text) {
  log("event", `⏎ ${text}`);
}

async function init() {
  log("event", "Ask for UI or a text question to get started.");
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
  if (!v) return;
  $("prompt").value = "";
  sendMessage(v);
});
$("prompt").addEventListener("keydown", (e) => { if (e.key === "Enter") $("send").click(); });
$("demoA2UI").addEventListener("click", () => sendMessage("show me an A2UI demo with a button and some text"));
$("demoText").addEventListener("click", () => sendMessage("what is the capital of France?"));

init();
