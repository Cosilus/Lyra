// A menu's panel (Contacts, Settings, Network, Chart, Help, Rewards, the
// histories...) opens out of the button that opened it and, when closed,
// goes back into it, instead of popping in and vanishing.
//
// The panels are plain React portals (".contacts-overlay" > ".contacts-panel")
// mounted and unmounted at once, so this works from the outside, for all of
// them: the menu button pressed last is remembered; a panel that appears
// right after grows from that button; when React removes it, the same node is
// put back for a moment while it goes home, then removed for good (React
// never touches a node again once it has removed it).
//
// The panel itself is never moved or scaled: several of them measure their
// own size to animate it (framer-motion layout), and a transform on them
// would make those measures wrong and the panel jump. A plain silhouette of
// the panel (same background, edge and corners) makes the trip between the
// button and the panel, and the real panel only fades in and out on top.
// A panel opened another way (asking Lyra "open my contacts") keeps its
// usual entrance and exit.

const MENU_BUTTONS = ".d3-side-item, .circle-menu-item, .header-rewards, .d3-assets-menu, [data-menu-origin]";
const OPEN_MS = 440;
const CLOSE_MS = 340;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.55, 0, 0.75, 0.2)";

let lastPress = null;          // { x, y, w, at } of the menu button pressed last
const origins = new WeakMap(); // overlay node -> where it came from
const panels = new WeakMap();  // overlay node -> the panel that grew out of the button

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

// the panel on screen (a history window holds a hidden list panel and the shown one)
function visiblePanel(overlay) {
  return [...overlay.querySelectorAll(".contacts-panel")].find(p => {
    const r = p.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) || null;
}

// a silhouette of the panel, laid exactly over it inside the overlay
function silhouette(overlay, panel) {
  const o = overlay.getBoundingClientRect();
  const r = panel.getBoundingClientRect();
  const cs = getComputedStyle(panel);
  const g = document.createElement("div");
  g.setAttribute("aria-hidden", "true");
  Object.assign(g.style, {
    position: "absolute",
    left: `${r.left - o.left}px`,
    top: `${r.top - o.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    background: cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : "rgba(34, 23, 53, 0.97)",
    backgroundImage: cs.backgroundImage,
    border: cs.border,
    borderRadius: cs.borderRadius,
    boxShadow: cs.boxShadow,
    pointerEvents: "none",
    zIndex: "1",
    willChange: "transform, opacity",
  });
  overlay.appendChild(g);
  // the silhouette's pose sitting on the button: small, round, centred on it
  const atButton = (origin) => {
    const s = Math.max(0.06, Math.min(0.2, (origin.w || 40) / (r.width || 1)));
    return `translate(${origin.x - (r.left + r.width / 2)}px, ${origin.y - (r.top + r.height / 2)}px) scale(${s})`;
  };
  return { el: g, atButton, radius: cs.borderRadius || "20px" };
}

function grow(overlay) {
  if (!lastPress || Date.now() - lastPress.at > 1200) return;
  const panel = visiblePanel(overlay);
  if (!panel) return;
  const origin = { ...lastPress };
  lastPress = null;
  origins.set(overlay, origin);
  panels.set(overlay, panel);
  panel.style.animation = "none";
  overlay.style.animation = "none";
  const sil = silhouette(overlay, panel);
  panel.style.position = panel.style.position || "relative";
  panel.style.zIndex = "2";
  const trip = sil.el.animate([
    { transform: sil.atButton(origin), opacity: 0.4, borderRadius: "999px" },
    { opacity: 1, offset: 0.3 },
    { transform: "none", opacity: 1, borderRadius: sil.radius },
  ], { duration: OPEN_MS, easing: EASE_OUT, fill: "forwards" });
  // the real panel shows up as the silhouette lands
  panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: OPEN_MS * 0.55, easing: "ease-out", fill: "backwards" });
  overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
  const clean = () => sil.el.remove();
  trip.onfinish = clean;
  trip.oncancel = clean;
}

function shrink(overlay, parent, next) {
  const origin = origins.get(overlay);
  if (!origin || !parent?.isConnected) return;
  origins.delete(overlay);
  const panel = panels.get(overlay) || visiblePanel(overlay);
  if (!panel) return;
  // back on screen for the time it takes to go home, untouchable
  overlay.style.pointerEvents = "none";
  parent.insertBefore(overlay, next && next.parentNode === parent ? next : null);
  const sil = silhouette(overlay, panel);
  const done = () => overlay.remove();
  // the content fades first, then the silhouette goes back into the button
  panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, easing: "ease-in", fill: "forwards" });
  const trip = sil.el.animate([
    { transform: "none", opacity: 1, borderRadius: sil.radius },
    { opacity: 1, offset: 0.6 },
    { transform: sil.atButton(origin), opacity: 0, borderRadius: "999px" },
  ], { duration: CLOSE_MS, easing: EASE_IN, fill: "forwards" });
  overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: "ease-in", fill: "forwards" });
  trip.onfinish = done;
  trip.oncancel = done;
  setTimeout(done, CLOSE_MS + 200);
}

export function startMenuMorph() {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  // which menu button was pressed (capture: before the menu itself closes)
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target instanceof Element ? e.target.closest(MENU_BUTTONS) : null;
    if (!btn) return;
    lastPress = { ...centerOf(btn), at: Date.now() };
  }, true);

  new MutationObserver((records) => {
    for (const rec of records) {
      rec.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && n.classList.contains("contacts-overlay")) grow(n);
      });
      rec.removedNodes.forEach((n) => {
        if (n.nodeType === 1 && n.classList.contains("contacts-overlay") && origins.has(n)) shrink(n, rec.target, rec.nextSibling);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}
