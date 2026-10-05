// Floating Lyra card, injected into the current tab when the toolbar icon is
// clicked (background.js). Running it again (second click) closes the card.
//
// The wallet itself runs in an <iframe> of the extension's own page, so the
// website can't read or script it; this file only draws the frame around it
// and tilts the whole card with the mouse while the mouse is over the wallet.
(() => {
  const existing = window.__lyraCard;
  if (existing) {
    existing.close();
    return;
  }

  const MAX_TILT_DEG = 9;      // with the mouse at the card's edges
  const EASE = 0.12;           // 0..1, how quickly the card catches up with the mouse
  const WIDTH = 400;
  const MAX_HEIGHT = 640;
  const MARGIN = 16;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Host element in a closed shadow root: page CSS can't restyle the card and
  // page scripts can't reach inside it.
  const host = document.createElement("lyra-wallet-card");
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; inset: 0; pointer-events: none;";
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .stage {
      position: fixed;
      top: ${MARGIN}px;
      right: ${MARGIN}px;
      width: ${WIDTH}px;
      max-width: calc(100vw - ${MARGIN * 2}px);
      height: min(${MAX_HEIGHT}px, calc(100vh - ${MARGIN * 2}px));
      perspective: 1100px;
      pointer-events: none;
      /* Open/close animate the stage, so they never fight the card's tilt. */
      animation: lyra-in 260ms cubic-bezier(.2,.8,.2,1) both;
    }
    .stage.closing { animation: lyra-out 180ms ease-in both; }
    .card {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 28px;
      transform-style: preserve-3d;
      will-change: transform;
      box-shadow:
        0 30px 80px -20px rgba(13, 9, 22, 0.75),
        0 0 0 1px rgba(167, 139, 250, 0.22),
        0 0 48px -12px rgba(167, 139, 250, 0.45);
      background: #0D0916;
      pointer-events: auto;
    }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: 28px;
      background: #0D0916;
      color-scheme: dark;
    }
    .close {
      position: absolute;
      top: -10px;
      right: -10px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1px solid rgba(167, 139, 250, 0.35);
      background: #150E20;
      color: #F3EBFF;
      font: 600 16px/26px system-ui, sans-serif;
      text-align: center;
      cursor: pointer;
      padding: 0;
      transform: translateZ(20px);
    }
    .close:hover { background: #2a1d44; }
    .close:focus-visible { outline: 2px solid #C4B0FF; outline-offset: 2px; }
    @keyframes lyra-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.96); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes lyra-out {
      to { opacity: 0; transform: translateY(-8px) scale(0.97); }
    }
    @media (prefers-reduced-motion: reduce) {
      .stage, .stage.closing { animation: none; }
    }
  `;

  const stage = document.createElement("div");
  stage.className = "stage";
  const card = document.createElement("div");
  card.className = "card";

  // Random key in the wallet's URL: only this script knows it (the page can't
  // read inside the closed shadow root), so only it can open the private
  // channel the wallet uses to report the mouse position (src/cardBridge.js).
  const key = crypto.randomUUID();
  const extensionOrigin = new URL(chrome.runtime.getURL("")).origin;
  const frame = document.createElement("iframe");
  frame.src = chrome.runtime.getURL("index.html?card=" + key);
  frame.title = "Lyra wallet";
  frame.allow = "clipboard-write; publickey-credentials-get; publickey-credentials-create";

  const closeBtn = document.createElement("button");
  closeBtn.className = "close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close Lyra");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => close());

  card.append(frame, closeBtn);
  stage.append(card);
  root.append(style, stage);
  document.documentElement.append(host);

  // Tilt: only while the mouse is over the wallet. The wallet frame reports
  // the pointer (-1..1 across the card) on a private channel; anywhere else on
  // the page the card stays flat.
  let target = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };
  let raf = 0;

  const channel = new MessageChannel();
  let pointerInWallet = false;
  channel.port1.onmessage = (e) => {
    const d = e.data || {};
    if (d.leave) {
      pointerInWallet = false;
      return flatten();
    }
    if (typeof d.nx !== "number" || typeof d.ny !== "number") return;
    pointerInWallet = true;
    if (reduceMotion) return;
    const nx = Math.max(-1, Math.min(1, d.nx));
    const ny = Math.max(-1, Math.min(1, d.ny));
    target = { x: -ny * MAX_TILT_DEG, y: nx * MAX_TILT_DEG };
    kick();
  };
  frame.addEventListener("load", () => {
    frame.contentWindow.postMessage({ type: "lyra-card-port", key }, extensionOrigin, [channel.port2]);
  }, { once: true });

  function flatten() {
    target = { x: 0, y: 0 };
    kick();
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(step);
  }

  function step() {
    current.x += (target.x - current.x) * EASE;
    current.y += (target.y - current.y) * EASE;
    const done = Math.abs(target.x - current.x) < 0.01 && Math.abs(target.y - current.y) < 0.01;
    if (done) current = { ...target };
    card.style.transform = `rotateX(${current.x.toFixed(3)}deg) rotateY(${current.y.toFixed(3)}deg)`;
    raf = done ? 0 : requestAnimationFrame(step);
  }

  // Chrome doesn't reliably tell the wallet frame when the mouse leaves it
  // for the page, so when the page sees the mouse again we tell the wallet
  // (it closes its edge menus) and lay the card flat.
  function pointerBackOnPage() {
    if (!pointerInWallet) return;
    pointerInWallet = false;
    channel.port1.postMessage({ type: "pointer-left" });
    flatten();
  }
  window.addEventListener("mousemove", pointerBackOnPage, { passive: true });
  card.addEventListener("mouseleave", pointerBackOnPage);

  function close() {
    if (!window.__lyraCard) return;
    delete window.__lyraCard;
    window.removeEventListener("mousemove", pointerBackOnPage);
    channel.port1.close();
    cancelAnimationFrame(raf);
    stage.classList.add("closing");
    const remove = () => host.remove();
    if (reduceMotion) remove();
    else stage.addEventListener("animationend", remove, { once: true });
  }

  window.__lyraCard = { close };
})();
