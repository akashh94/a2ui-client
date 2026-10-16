// Catalog gallery: renders one example of every component this client has a
// renderer for, from static A2UI payloads.
//
// Nothing here talks to the agent — no fetch, no discovery. That makes this
// page the reliable fallback when the agent is unreachable or the model is
// having a bad day mid-demo, and it is the clearest way to show the vocabulary
// the client agreed to render.
//
// The component list is A2UI.COMPONENTS (a2ui-render.js); the examples below
// must cover it. A component added to the agent's catalog needs a renderer
// there and an example here.

const $ = (id) => document.getElementById(id);

// The catalogId these payloads declare. Taken from the configured agent URL so
// the JSON shows the id the deployed agent actually serves; falls back to the
// catalog's own $id when no agent is configured (e.g. plain local dev).
const AGENT_URL = (window.A2UI_AGENT_URL || "").replace(/\/$/, "");
const CATALOG_ID = AGENT_URL ? `${AGENT_URL}/catalog.json` : "https://a2ui-agent/catalog.json";

// A2UI messages are self-describing: every one carries its version, and the
// surface it applies to.
const createSurface = (surfaceId) => ({
  version: "v0.9",
  createSurface: { surfaceId, catalogId: CATALOG_ID },
});
const updateComponents = (surfaceId, components) => ({
  version: "v0.9",
  updateComponents: { surfaceId, components },
});

const EXAMPLES = [
  {
    component: "Text",
    about:
      "Plain text. The variant property picks the style: h1–h4, body (the default), or caption. " +
      "Shown here inside a Column root so the variants sit together.",
    messages: [
      createSurface("text_surface"),
      updateComponents("text_surface", [
        { id: "root", component: "Column", children: ["t_h2", "t_body", "t_caption"], justify: "start", align: "start" },
        { id: "t_h2", component: "Text", text: "A heading (variant: h2)", variant: "h2" },
        { id: "t_body", component: "Text", text: "Body text — the default variant." },
        { id: "t_caption", component: "Text", text: "A caption (variant: caption)", variant: "caption" },
      ]),
    ],
  },
  {
    component: "Button",
    about:
      "Labelled by a Text child referenced via child, and carrying an action.event.name. " +
      "variant is primary, default, or borderless. Click one: the event name it would send back to the agent appears below.",
    messages: [
      createSurface("button_surface"),
      updateComponents("button_surface", [
        { id: "root", component: "Column", children: ["b_primary", "b_default", "b_borderless"], justify: "start", align: "start" },
        { id: "b_primary", component: "Button", child: "b_primary_label", variant: "primary", action: { event: { name: "demo_button_click" } } },
        { id: "b_primary_label", component: "Text", text: "Primary" },
        { id: "b_default", component: "Button", child: "b_default_label", variant: "default", action: { event: { name: "demo_button_click" } } },
        { id: "b_default_label", component: "Text", text: "Default" },
        { id: "b_borderless", component: "Button", child: "b_borderless_label", variant: "borderless", action: { event: { name: "demo_button_click" } } },
        { id: "b_borderless_label", component: "Text", text: "Borderless" },
      ]),
    ],
  },
  {
    component: "Row",
    about:
      "Horizontal layout. children are component ids — never inline definitions — and justify " +
      "spreads them along the main axis (spaceBetween here).",
    messages: [
      createSurface("row_surface"),
      updateComponents("row_surface", [
        { id: "root", component: "Row", children: ["r_left", "r_center", "r_right"], justify: "spaceBetween", align: "center" },
        { id: "r_left", component: "Text", text: "Left" },
        { id: "r_center", component: "Text", text: "Center" },
        { id: "r_right", component: "Text", text: "Right" },
      ]),
    ],
  },
  {
    component: "Column",
    about:
      "Vertical layout, and the usual root of an agent's component tree. The body is a Column, " +
      "so the heading, text, and caption in the first example are stacked by one of these.",
    messages: [
      createSurface("column_surface"),
      updateComponents("column_surface", [
        { id: "root", component: "Column", children: ["c_one", "c_two", "c_three"], justify: "start", align: "start" },
        { id: "c_one", component: "Text", text: "First child", variant: "h3" },
        { id: "c_two", component: "Text", text: "Second child" },
        { id: "c_three", component: "Text", text: "Third child", variant: "caption" },
      ]),
    ],
  },
  {
    component: "Card",
    about:
      "A titled container around exactly one child. A multi-element body has to be wrapped in a " +
      "layout component — here the Card's child is a Column holding a Text and a Button.",
    messages: [
      createSurface("card_surface"),
      updateComponents("card_surface", [
        { id: "root", component: "Card", title: "Card title", child: "k_body" },
        { id: "k_body", component: "Column", children: ["k_text", "k_button"], justify: "start", align: "start" },
        { id: "k_text", component: "Text", text: "The card body is a Column holding two children." },
        { id: "k_button", component: "Button", child: "k_button_label", variant: "primary", action: { event: { name: "card_confirm" } } },
        { id: "k_button_label", component: "Text", text: "Confirm" },
      ]),
    ],
  },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildCard(example) {
  const card = el("article", "card");
  const heading = el("h3", null, example.component);
  heading.appendChild(el("span", "tag", "component"));
  card.appendChild(heading);
  card.appendChild(el("p", "about", example.about));

  const split = el("div", "split");

  // Left: the rendered result, using the same host the chat client uses.
  const renderPane = el("div", "pane");
  renderPane.appendChild(el("h4", null, "Rendered"));
  const renderArea = el("div", "renderArea");
  const events = el("div", "events");
  const notes = el("div", "notes");
  renderPane.append(renderArea, events, notes);

  const host = A2UI.createSurfaceHost({
    container: renderArea,
    getCatalogId: () => CATALOG_ID,
    onAction: (name) => events.appendChild(el("div", null, `action event fired: ${name}`)),
    onEvent: (text) => notes.appendChild(el("div", null, text)),
  });
  example.messages.forEach((msg) => host.render(msg));

  // Right: the exact JSON that produced it.
  const payloadPane = el("div", "pane");
  payloadPane.appendChild(el("h4", null, "A2UI payload"));
  payloadPane.appendChild(el("pre", "payload", JSON.stringify(example.messages, null, 2)));

  split.append(renderPane, payloadPane);
  card.appendChild(split);
  return card;
}

$("catalogId").textContent = CATALOG_ID;
$("chips").replaceChildren(...A2UI.COMPONENTS.map((name) => el("span", "chip", name)));
$("gallery").replaceChildren(...EXAMPLES.map(buildCard));

const missing = A2UI.COMPONENTS.filter((c) => !EXAMPLES.some((e) => e.component === c));
if (missing.length) console.warn("No gallery example for:", missing.join(", "));
