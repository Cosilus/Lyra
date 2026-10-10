// The wallet can run inside the floating card that public/overlay.js draws on
// a website ("card mode"). There:
//  - the whole card tilts with the mouse while the mouse is over the wallet.
//    The page gets no mouse events then (they go to this frame), so this frame
//    reports the pointer position to the overlay;
//  - the 3D side/top menus open outside the wallet, in transparent margins of
//    this frame. The overlay only lets those margins catch the mouse while a
//    menu is open, so this frame tells it when a menu opens or closes.
//
// All of it goes over a private MessageChannel, never a plain postMessage to
// the parent (the website would see every message). The overlay puts a random
// key in this frame's URL (?card=...) and hands over the channel with that key;
// the website can't read our URL, so it can't impersonate the overlay. The
// overlay uses the same channel to say when the mouse has left the card.
const cardKey = new URLSearchParams(window.location.search).get("card");

export const IS_CARD = !!cardKey && window.parent !== window;

// Where full-screen overlays go: in the floating card, over the wallet only
// (rounded, clipped, scrolling inside it), not over the whole frame with its
// transparent menu margins; elsewhere, the page.
export function overlayRoot() {
  return (IS_CARD && document.getElementById("card-overlays")) || document.body;
}

let port = null;
let lastDock = null;
let lastBusy = false;

// Close shortcut: holding C (outside any text field) for HOLD_TO_CLOSE_MS
// closes the wallet: the floating card on a website, or the side panel.
export const HOLD_TO_CLOSE_MS = 1500;

export function isTypingTarget(el) {
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function startCloseShortcut() {
  let timer = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  window.addEventListener("keydown", (e) => {
    if (e.repeat || timer || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== "c" && e.key !== "C") return;
    if (isTypingTarget(document.activeElement)) return;
    timer = setTimeout(() => {
      timer = 0;
      if (IS_CARD) port?.postMessage({ close: true });
      else window.close(); // the extension's side panel page
    }, HOLD_TO_CLOSE_MS);
  });
  window.addEventListener("keyup", (e) => { if (e.key === "c" || e.key === "C") cancel(); });
  window.addEventListener("blur", cancel);
}

// Moving the card: press and hold the wallet (anywhere that isn't a button,
// a link or a field) for MOVE_HOLD_MS, and it follows the mouse until the
// button is released. While the button is down Chrome sends every mouse event
// to this frame, so this frame reports how far the pointer has gone since the
// grab and the overlay moves the card by that much. The distance is measured
// in screen coordinates, which don't change when the card (and this frame
// with it) moves: measuring inside the frame would feed each move back into
// the next one and make the card jump around. Screen pixels are converted to
// page pixels with the zoom, read from the first few pixels of movement.
const MOVE_HOLD_MS = 450;
const MOVE_SLOP_PX = 6;
const NOT_A_HANDLE = "button, a, input, textarea, select, label, summary, [role='button'], [role='slider'], [contenteditable=''], [contenteditable='true'], .no-move";

function startMoveGesture() {
  let timer = 0;
  let start = null;      // where the press began: client and screen coordinates
  let moving = false;
  let zoom = null;       // screen pixels per page pixel, measured once per move
  let raf = 0;
  let pending = null;

  function reset() {
    clearTimeout(timer);
    timer = 0;
    start = null;
  }

  window.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.pointerType !== "mouse" || !port) return;
    if (e.target instanceof Element && e.target.closest(NOT_A_HANDLE)) return;
    start = { x: e.clientX, y: e.clientY, sx: e.screenX, sy: e.screenY, id: e.pointerId, target: e.target };
    timer = setTimeout(() => {
      timer = 0;
      moving = true;
      zoom = null;
      try { start.target.setPointerCapture?.(start.id); } catch { /* gone */ }
      document.documentElement.classList.add("lyra-moving");
      window.getSelection?.()?.removeAllRanges();
      port.postMessage({ move: "start" });
    }, MOVE_HOLD_MS);
  }, true);

  window.addEventListener("pointermove", (e) => {
    if (!start) return;
    if (!moving) {
      // moved before the hold time: a normal drag (selecting text...), not a move
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_SLOP_PX) reset();
      return;
    }
    e.preventDefault();
    const dsx = e.screenX - start.sx, dsy = e.screenY - start.sy;
    if (zoom === null) {
      // the card hasn't moved yet, so client and screen distances compare
      const dcx = e.clientX - start.x, dcy = e.clientY - start.y;
      const client = Math.abs(dcx) + Math.abs(dcy);
      if (client < 4) return;
      const ratio = (Math.abs(dsx) + Math.abs(dsy)) / client;
      zoom = Number.isFinite(ratio) && ratio > 0.2 && ratio < 6 ? ratio : 1;
    }
    pending = { move: "to", dx: dsx / zoom, dy: dsy / zoom };
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (pending) port?.postMessage(pending);
        pending = null;
      });
    }
  }, true);

  function end(e) {
    if (moving) {
      moving = false;
      cancelAnimationFrame(raf);
      raf = 0;
      if (pending) port?.postMessage(pending);
      pending = null;
      document.documentElement.classList.remove("lyra-moving");
      port?.postMessage({ move: "end" });
      // the release after a move is not a click on whatever is under it
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      e?.preventDefault?.();
    }
    reset();
  }
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  window.addEventListener("blur", () => end());
}

// While Lyra is working (a transaction being signed or sent), a click on the
// page must not close the card: the overlay ignores outside clicks then.
export function reportCardBusy(busy) {
  lastBusy = !!busy;
  port?.postMessage({ busy: lastBusy });
}

// Which menu is open ("left" | "right" | "top" | null), see Box3D.jsx.
export function reportCardDock(side) {
  lastDock = side || null;
  port?.postMessage({ dock: lastDock });
}

export function startCardBridge() {
  if (!IS_CARD) return;
  document.documentElement.classList.add("lyra-card");
  // Where the wallet's full-screen overlays go (App.jsx OverlayPortal): laid
  // over the wallet area, and a containing block for position: fixed.
  const overlays = document.createElement("div");
  overlays.id = "card-overlays";
  document.body.appendChild(overlays);

  let raf = 0;
  let pending = null;

  function flush() {
    raf = 0;
    if (port && pending) port.postMessage(pending);
    pending = null;
  }

  function send(msg) {
    pending = msg;
    if (!raf) raf = requestAnimationFrame(flush);
  }

  function onMove(e) {
    // -1..1 across this frame, 0 in the middle.
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    send({ nx, ny });
  }

  function onLeave() {
    send({ leave: true });
  }

  window.addEventListener("message", function onHandshake(e) {
    if (e.source !== window.parent || e.data?.type !== "lyra-card-port" || e.data.key !== cardKey || !e.ports?.[0]) return;
    window.removeEventListener("message", onHandshake);
    port = e.ports[0];
    startMoveGesture();
    // The overlay tells us when the mouse is back on the page (Chrome doesn't
    // reliably fire a leave event in this frame): pass it on to the 3D view.
    port.onmessage = (m) => {
      if (m.data?.type === "pointer-left") window.dispatchEvent(new Event("lyra-pointer-left"));
      // The mouse jumped from the wallet straight into a menu margin.
      if (m.data?.type === "pointer-edge" && ["left", "right", "top"].includes(m.data.side)) {
        window.dispatchEvent(new CustomEvent("lyra-pointer-edge", { detail: m.data.side }));
      }
    };
    if (lastDock) port.postMessage({ dock: lastDock });
    if (lastBusy) port.postMessage({ busy: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
  });
}
