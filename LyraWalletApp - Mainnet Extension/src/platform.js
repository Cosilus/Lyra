// Where this build runs. The same code ships as the Chrome extension
// (`npm run build`) and as the installable web app for phones and tablets
// (`npm run build:app`, vite.app.config.js, mode "app").
export const IS_APP = import.meta.env.MODE === "app";

// The web app: the class the app-only CSS hangs off, and the service worker
// that makes it installable and opens it without a network round trip.
export function startApp() {
  if (!IS_APP) return;
  document.documentElement.classList.add("lyra-app");
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
}
