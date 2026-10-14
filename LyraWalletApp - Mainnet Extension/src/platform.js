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
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) document.documentElement.classList.add("lyra-standalone");
  if ("serviceWorker" in navigator && window.isSecureContext && !import.meta.env.DEV) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
        // no offline shell: the app still works online
      });
    });
  }
  if (!standalone) offerInstall();
}

// "Install Lyra": opened in the browser (not from the home screen), the app
// offers to install itself. On Android the browser's own install prompt opens
// from the button; on an iPhone, where Safari has no such prompt, the two taps
// to do are shown instead. Closed with ×, it stays away for a week.
const INSTALL_KEY = "lyra_install_hint_v1";
function offerInstall() {
  try {
    if (Date.now() - Number(localStorage.getItem(INSTALL_KEY) || 0) < 7 * 864e5) return;
  } catch { /* no storage: still offered */ }
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const phone = ios || /Android/.test(ua);
  if (!phone) return; // a computer: the Chrome extension is the way there
  let deferred = null;
  let el = null;

  const close = (remember) => {
    if (remember) { try { localStorage.setItem(INSTALL_KEY, String(Date.now())); } catch { /* not kept */ } }
    el?.classList.remove("is-in");
    setTimeout(() => el?.remove(), 300);
  };
  const show = () => {
    if (el || window.matchMedia?.("(display-mode: standalone)").matches) return;
    el = document.createElement("div");
    el.className = "lyra-install";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Install Lyra");
    const share = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
    const plus = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
    el.innerHTML = `
      <img class="lyra-install-logo" src="./apple-touch-icon.png" alt="" width="40" height="40">
      <div class="lyra-install-text">
        <b>Install Lyra</b>
        ${deferred ? "<span>Opens full screen from your home screen, like any app.</span>"
          : ios ? `<span>Tap ${share} <em>Share</em>, then ${plus} <em>Add to Home Screen</em>.</span>`
          : "<span>Open the browser menu <em>⋮</em>, then <em>Install app</em> (or <em>Add to Home screen</em>).</span>"}
      </div>
      ${deferred ? '<button type="button" class="lyra-install-go">Install</button>' : ""}
      <button type="button" class="lyra-install-x" aria-label="Not now">×</button>`;
    el.querySelector(".lyra-install-x").addEventListener("click", () => close(true));
    el.querySelector(".lyra-install-go")?.addEventListener("click", async () => {
      const prompt = deferred;
      deferred = null;
      if (!prompt) return;
      prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      close(choice?.outcome !== "accepted");
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el?.classList.add("is-in")));
  };

  // Android (Chrome, Edge, Samsung Internet): the browser says when it can install
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    if (el) { el.remove(); el = null; }
    setTimeout(show, 1200);
  });
  window.addEventListener("appinstalled", () => close(true));
  // iPhone: always by hand, a little after the app opened; Android without
  // the browser prompt (Firefox...): the menu to use
  setTimeout(() => { if (!deferred) show(); }, ios ? 2500 : 5000);
}
