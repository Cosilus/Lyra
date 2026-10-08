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

let port = null;
let lastDock = null;

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
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
  });
}
