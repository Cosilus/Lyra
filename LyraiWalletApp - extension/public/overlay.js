// Floating Lyra card, injected into the current tab when the toolbar icon is
// clicked (background.js). Running it again (second click) closes the card.
//
// The wallet itself runs in an <iframe> of the extension's own page, so the
// website can't read or script it; this file only draws the frame around it
// and tilts the whole card toward the mouse, like a card floating over the page.
(() => {
  const existing = window.__lyraCard;
  if (existing) {
    existing.close();
    return;
  }

  const MAX_TILT_DEG = 9;      // at the far edges of the window
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

  const frame = document.createElement("iframe");
  frame.src = chrome.runtime.getURL("index.html");
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

  // Tilt: the card leans toward wherever the mouse is on the page. The page
  // doesn't get mouse events while the pointer is over the wallet itself
  // (they go to the iframe), so there the card eases back flat, which also
  // keeps it steady while buttons are being clicked.
  let target = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };
  let raf = 0;

  function onMove(e) {
    if (reduceMotion) return;
    const r = card.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // -1..1 relative to the card centre, scaled to the window size.
    const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
    const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
    target = { x: -ny * MAX_TILT_DEG, y: nx * MAX_TILT_DEG };
    kick();
  }

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

  window.addEventListener("mousemove", onMove, { passive: true });
  card.addEventListener("mouseenter", flatten);
  document.addEventListener("mouseleave", flatten);
  window.addEventListener("blur", flatten);

  function close() {
    if (!window.__lyraCard) return;
    delete window.__lyraCard;
    window.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseleave", flatten);
    window.removeEventListener("blur", flatten);
    cancelAnimationFrame(raf);
    stage.classList.add("closing");
    const remove = () => host.remove();
    if (reduceMotion) remove();
    else stage.addEventListener("animationend", remove, { once: true });
  }

  window.__lyraCard = { close };
})();
