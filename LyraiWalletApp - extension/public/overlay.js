// Floating Lyra card, injected into the current tab when the toolbar icon is
// clicked (background.js). Running it again (second click) closes the card.
//
// The wallet itself runs in an <iframe> of the extension's own page, so the
// website can't read or script it. This file only draws the card's frame and
// shadow, and tilts the whole card with the mouse while the mouse is over the
// wallet.
//
// The iframe is bigger than the wallet: transparent margins on the left, right
// and top hold the wallet's 3D menus, which open outside the wallet (see the
// card rules at the end of src/styles.css). The margins only catch the mouse
// while a menu is open; the rest of the time they are clipped away so the
// website underneath stays clickable.
(() => {
  const existing = window.__lyraCard;
  if (existing) {
    existing.close();
    return;
  }
  // A card left by an earlier copy of the extension (it was reloaded or
  // updated while this page stayed open) isn't known to this script: the
  // click still means "close", so remove it.
  const stale = document.querySelectorAll("lyra-wallet-card");
  if (stale.length) {
    stale.forEach((el) => el.remove());
    return;
  }

  const MAX_TILT_DEG = 9;      // with the mouse at the card's edges
  // While a menu is open the wallet shrinks a little (the menus don't): its
  // shadow here shrinks with it. Keep in sync with CARD_DOCK.scale in
  // src/three-d/config3d.js.
  const MENU_SCALE = 0.94;
  const MENU_EASE = "0.35s cubic-bezier(0.22, 1, 0.36, 1)";
  const EASE = 0.12;           // 0..1, how quickly the card catches up with the mouse
  const WALLET_WIDTH = 400;
  const WALLET_MAX_HEIGHT = 640;
  const MARGIN = 16;           // between the card and the window edges
  const RADIUS = 28;
  // Keep in sync with --card-side / --card-top in src/styles.css.
  const SIDE_PX = 96;          // room for a side menu, left and right of the wallet
  const TOP_PX = 110;          // room for the assets menu, above the wallet

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Host element in a closed shadow root: page CSS can't restyle the card and
  // page scripts can't reach inside it.
  const host = document.createElement("lyra-wallet-card");
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; inset: 0; pointer-events: none;";
  const root = host.attachShadow({ mode: "closed" });

  const walletClip = `inset(${TOP_PX}px ${SIDE_PX}px 0 ${SIDE_PX}px round ${RADIUS}px)`;

  const style = document.createElement("style");
  style.textContent = `
    .stage {
      position: fixed;
      top: ${MARGIN}px;
      right: ${MARGIN}px;
      width: ${WALLET_WIDTH + SIDE_PX * 2}px;
      max-width: calc(100vw - ${MARGIN * 2}px);
      height: min(${WALLET_MAX_HEIGHT + TOP_PX}px, calc(100vh - ${MARGIN * 2}px));
      pointer-events: none;
      /* Open/close animate the stage, so they never fight the card's tilt. */
      animation: lyra-in 260ms cubic-bezier(.2,.8,.2,1) both;
    }
    .stage.closing { animation: lyra-out 180ms ease-in both; }
    .card {
      position: relative;
      width: 100%;
      height: 100%;
    }
    /* The wallet's shadow and glow, behind the (transparent) iframe. */
    .shadow {
      position: absolute;
      top: ${TOP_PX}px;
      left: ${SIDE_PX}px;
      right: ${SIDE_PX}px;
      bottom: 0;
      border-radius: ${RADIUS}px;
      background: #0D0916;
      box-shadow:
        0 30px 80px -20px rgba(13, 9, 22, 0.75),
        0 0 0 1px rgba(167, 139, 250, 0.22),
        0 0 48px -12px rgba(167, 139, 250, 0.45);
    }
    iframe {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: transparent;
      color-scheme: dark;
      pointer-events: auto;
      clip-path: ${walletClip};
    }
    .card.menu-open iframe { clip-path: none; }
    .shadow { transition: transform ${MENU_EASE}; }
    .card.menu-open .shadow { transform: scale(${MENU_SCALE}); }
    @media (prefers-reduced-motion: reduce) {
      .card.menu-open .shadow { transform: none; }
    }
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
  const shadow = document.createElement("div");
  shadow.className = "shadow";

  // Random key in the wallet's URL: only this script knows it (the page can't
  // read inside the closed shadow root), so only it can open the private
  // channel the wallet uses to talk to the card (src/cardBridge.js).
  const key = crypto.randomUUID();
  const extensionOrigin = new URL(chrome.runtime.getURL("")).origin;
  const frame = document.createElement("iframe");
  frame.src = chrome.runtime.getURL("index.html?card=" + key);
  frame.title = "Lyra wallet";
  frame.allow = "clipboard-write; publickey-credentials-get; publickey-credentials-create";

  card.append(shadow, frame);
  stage.append(card);
  root.append(style, stage);
  document.documentElement.append(host);

  // Tilt: only while the mouse is over the wallet (or one of its open menus).
  // The wallet frame reports the pointer (-1..1 across the frame) on a private
  // channel; anywhere else on the page the card stays flat.
  let target = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };
  let raf = 0;

  const channel = new MessageChannel();
  let pointerInWallet = false;
  channel.port1.onmessage = (e) => {
    const d = e.data || {};
    if ("dock" in d) {
      // A menu opened or closed: let the margins catch the mouse only while
      // a menu is open.
      setMenuOpen(!!d.dock);
      return;
    }
    if (d.leave) {
      pointerInWallet = false;
      return flatten();
    }
    if (typeof d.nx !== "number" || typeof d.ny !== "number") return;
    pointerInWallet = true;
    if (reduceMotion) return;
    const nx = Math.max(-1, Math.min(1, d.nx));
    const ny = Math.max(-1, Math.min(1, d.ny));
    // Mouse on the right: the right edge comes up toward the viewer (same on
    // the left). Mouse at the top: the top edge goes down, away from the viewer.
    target = { ...target, x: -ny * MAX_TILT_DEG, y: -nx * MAX_TILT_DEG };
    kick();
  };

  // A menu opened or closed: the margins catch the mouse only while a menu
  // is open, and the wallet's shadow follows the wallet as it shrinks.
  function setMenuOpen(open) {
    card.classList.toggle("menu-open", open);
  }
  frame.addEventListener("load", () => {
    frame.contentWindow.postMessage({ type: "lyra-card-port", key }, extensionOrigin, [channel.port2]);
  }, { once: true });

  function flatten() {
    target = { ...target, x: 0, y: 0 };
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
    const flat = done && current.x === 0 && current.y === 0;
    // Back flat: no transform at all, so Chrome draws the wallet as plain,
    // sharp text again (a "zero" 3D rotation still renders it as a texture).
    // The perspective is part of the transform (not a parent's "perspective"
    // style), so at rest nothing around the wallet is 3D any more.
    card.style.transform = flat ? "" : `perspective(1100px) rotateX(${current.x.toFixed(3)}deg) rotateY(${current.y.toFixed(3)}deg)`;
    // Only hint "this moves" while it actually moves: with the hint left on,
    // Chrome keeps the wallet's image at one resolution and it looks blurry.
    card.style.willChange = done ? "" : "transform";
    raf = done ? 0 : requestAnimationFrame(step);
  }

  // Which menu margin (left, right or top of the wallet) a page point is in,
  // or null. Used when a fast mouse jumps out of the wallet straight into a
  // margin before the wallet had time to open that menu (the margin doesn't
  // catch the mouse until a menu is open).
  function marginSideAt(x, y) {
    const r = shadow.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    if (y >= r.top && y <= r.bottom) {
      if (x < r.left && x >= s.left) return "left";
      if (x > r.right && x <= s.right) return "right";
    }
    if (y < r.top && y >= s.top && x >= r.left && x <= r.right) return "top";
    return null;
  }

  // Chrome doesn't reliably tell the wallet frame when the mouse leaves it
  // for the page, so when the page sees the mouse again we tell the wallet
  // (it closes its menus) and lay the card flat.
  function pointerBackOnPage(e) {
    if (!pointerInWallet) return;
    const side = marginSideAt(e.clientX, e.clientY);
    if (side) {
      // Straight from the wallet into a menu margin: open that menu.
      channel.port1.postMessage({ type: "pointer-edge", side });
      setMenuOpen(true);
      return;
    }
    pointerInWallet = false;
    channel.port1.postMessage({ type: "pointer-left" });
    setMenuOpen(false);
    flatten();
  }
  window.addEventListener("mousemove", pointerBackOnPage, { passive: true });

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
