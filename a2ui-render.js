// A2UI message -> DOM rendering, shared by the chat client (client.js) and the
// catalog gallery (catalog.js), so both render components from the same code
// and the same stylesheet (a2ui.css) rather than from lookalike copies.
//
// The component names here mirror the agent's catalog (app/catalog.json in the
// a2ui-agent repo). A component added there needs a renderer added here.
window.A2UI = (function () {
  // The component names this client knows how to render.
  const COMPONENTS = ["Text", "Button", "Row", "Column", "Card"];

  // Reference types that hold children by id: component name -> key holding the id(s).
  const CHILD_REF_KEYS = { Button: "child", Card: "child", Row: "children", Column: "children" };

  function justifyToCss(v) {
    return { spaceBetween: "space-between", spaceAround: "space-around", spaceEvenly: "space-evenly" }[v] || v;
  }
  function alignToCss(v) {
    return v;
  }

  // Component renderers: catalog component name -> props => element.
  // NOTE: renderers only CREATE the element. Children are attached afterwards in
  // a separate mount pass (render), because components can be listed in any
  // order — a parent may be created before its children exist.
  // onAction fires when a Button carrying action.event.name is clicked.
  function makeRenderers(onAction) {
    return {
      Text: (props) => {
        const el = document.createElement("div");
        el.className = `a2ui-text ${props.variant || "body"}`;
        el.textContent = props.text ?? "";
        return el;
      },
      Button: (props) => {
        const el = document.createElement("button");
        el.className = `a2ui-btn ${props.variant || "default"}`;
        const name = props.action?.event?.name;
        if (name) el.addEventListener("click", () => onAction(name));
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
  }

  // A surface host renders A2UI messages into `container`, appending one block
  // per surfaceId. Multiple surfaces coexist; each is mounted where the agent
  // produced it.
  //   onEvent(text)        - protocol note ("createSurface s1", warnings, ...)
  //   onSurfaceMounted(el) - a new surface block was just appended
  //   onAction(name)       - a Button was clicked (action.event.name)
  //   getCatalogId()       - the catalogId this client registered, used to
  //                          sanity-check the catalogId a surface declares
  function createSurfaceHost({
    container,
    getCatalogId = () => null,
    onEvent = () => {},
    onSurfaceMounted = () => {},
    onAction = () => {},
  }) {
    const renderers = makeRenderers(onAction);
    const surfaces = new Map();

    const host = {
      mountSurface(surfaceId) {
        const el = document.createElement("div");
        el.className = "a2ui-surface";
        el.dataset.surfaceId = surfaceId;
        container.appendChild(el);
        const surface = { el, componentEls: new Map() };
        surfaces.set(surfaceId, surface);
        onSurfaceMounted(el);
        return surface;
      },

      render(msg) {
        if (msg.createSurface) {
          const { surfaceId, catalogId } = msg.createSurface;
          const registered = getCatalogId();
          if (catalogId && catalogId !== registered) onEvent(`warning: surface catalog ${catalogId} != registered ${registered}`);
          onEvent(`createSurface ${surfaceId}`);
          host.mountSurface(surfaceId);
          return;
        }
        if (!msg.updateComponents) return;

        const { surfaceId, components } = msg.updateComponents;
        // updateComponents without a preceding createSurface still renders —
        // mount the surface block on demand instead of dropping the update.
        const { el: surfaceEl, componentEls } = surfaces.get(surfaceId) || host.mountSurface(surfaceId);

        // Pass 1: create every component element (children are not attached yet).
        const byId = new Map(components.map((c) => [c.id, c]));
        components.forEach((c) => {
          if (componentEls.has(c.id)) return; // already rendered (e.g. repeated update)
          const renderer = renderers[c.component];
          if (!renderer) {
            onEvent(`no renderer for component '${c.component}'`);
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
            else if (byId.has(childId)) onEvent(`component '${childId}' has no renderer`);
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
        onEvent(`updateComponents (${components.length} components)`);
      },
    };

    return host;
  }

  return { COMPONENTS, CHILD_REF_KEYS, createSurfaceHost };
})();
