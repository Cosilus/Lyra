// Where this build runs. The same code ships as the Chrome extension
// (`npm run build`) and as the installable web app for phones and tablets
// (`npm run build:app`, vite.app.config.js, mode "app").
export const IS_APP = import.meta.env.MODE === "app";

// The web app: the class the app-only CSS hangs off, and the service worker
// that makes it installable and opens it without a network round trip.
export function startApp() {
  if (!IS_APP) return;
  document.documentElement.classList.add("lyra-app");
  // already dark: no browser may recolour it (Chrome's auto dark mode,
  // Samsung Internet's dark mode)
  document.documentElement.style.colorScheme = "only dark";
  // installed from the home screen (no browser bar): a few more safe-area rules
  if (isStandalone()) document.documentElement.classList.add("lyra-standalone");
  if ("serviceWorker" in navigator && window.isSecureContext && !import.meta.env.DEV) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
        // no offline shell: the app still works online
      });
    });
  }
  if (!isStandalone()) offerInstall();
}

// "Install Lyra": opened in the browser (not from the home screen), the app
// offers to install itself. On Android the browser's own install prompt opens
// from the button; on an iPhone, where Safari has no such prompt, the two taps
// to do are shown instead. Closed with ×, the banner stays away for 3 days;
// Settings keeps an Install button all the time (installState / installLyra).
const INSTALL_KEY = "lyra_install_hint_v2"; // v1 hid it for a week, even after an install
const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
const IOS = /iPhone|iPad|iPod/.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const PHONE = IOS || /Android/.test(ua);
let deferred = null; // the browser's install prompt, once it offers one
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

// What Settings' Install button can do here: "prompt" (the browser's own
// install), "ios" (Share, then Add to Home Screen), "menu" (the browser menu),
// or null (already installed, or not the web app).
export function installState() {
  if (!IS_APP || isStandalone()) return null;
  return deferred ? "prompt" : IOS ? "ios" : "menu";
}
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
// the browser's install prompt; true when the user accepted it
export async function installLyra() {
  const prompt = deferred;
  if (!prompt) return false;
  deferred = null;
  notify();
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  return choice?.outcome === "accepted";
}

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
function installHowHtml() {
  const state = installState();
  if (state === "prompt") return "Opens full screen from your home screen, like any app.";
  if (state === "ios") return `Tap ${SHARE_ICON} <em>Share</em>, then <em>Add to Home Screen</em>.`;
  return "Open the browser menu <em>⋮</em>, then <em>Install app</em> (or <em>Add to Home screen</em>).";
}

function offerInstall() {
  let el = null;
  const dismissed = () => {
    try { return Date.now() - Number(localStorage.getItem(INSTALL_KEY) || 0) < 3 * 864e5; } catch { return false; }
  };
  const close = (remember) => {
    if (remember) { try { localStorage.setItem(INSTALL_KEY, String(Date.now())); } catch { /* not kept */ } }
    const gone = el;
    el = null;
    gone?.classList.remove("is-in");
    setTimeout(() => gone?.remove(), 300);
  };
  const show = () => {
    if (!PHONE || el || isStandalone() || dismissed()) return;
    el = document.createElement("div");
    el.className = "lyra-install";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Install Lyra");
    el.innerHTML = `
      <img class="lyra-install-logo" src="./apple-touch-icon.png" alt="" width="40" height="40">
      <div class="lyra-install-text">
        <b>Install Lyra</b>
        <span>${installHowHtml()}</span>
      </div>
      ${deferred ? '<button type="button" class="lyra-install-go">Install</button>' : ""}
      <button type="button" class="lyra-install-x" aria-label="Not now">×</button>`;
    el.querySelector(".lyra-install-x").addEventListener("click", () => close(true));
    el.querySelector(".lyra-install-go")?.addEventListener("click", async () => {
      const ok = await installLyra();
      close(!ok);
    });
    document.body.appendChild(el);
    const mine = el;
    requestAnimationFrame(() => requestAnimationFrame(() => mine.classList.add("is-in")));
  };

  // Android (Chrome, Edge, Samsung Internet): the browser says when it can install
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    notify();
    if (el) close(false);
    setTimeout(show, 1200);
  });
  // installed: nothing to remember, the installed app never shows the banner
  window.addEventListener("appinstalled", () => { deferred = null; notify(); close(false); });
  // iPhone: always by hand, a little after the app opened; Android without
  // the browser prompt (Firefox...): the menu to use
  setTimeout(() => { if (!deferred) show(); }, IOS ? 2500 : 5000);
}
