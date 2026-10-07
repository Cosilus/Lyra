// Relays dApp requests between the page's Lyra connector (inpage.js, MAIN
// world) and the extension's background (background.js). Runs in the
// extension's isolated world. The background identifies the site from this
// script's own connection, never from anything the page says.
(() => {
  let port = null;
  const inflight = new Set();

  function toPage(msg) {
    window.postMessage({ target: "lyra-inpage", ...msg }, location.origin);
  }

  function connect() {
    port = chrome.runtime.connect({ name: "lyra-provider" });
    port.onMessage.addListener((msg) => {
      if (msg.id != null) inflight.delete(msg.id);
      toPage(msg);
    });
    port.onDisconnect.addListener(() => {
      port = null;
      // The background restarted (or the extension was updated): anything
      // still waiting can't be answered any more.
      for (const id of inflight) {
        toPage({ id, error: { code: 4900, message: "Lyra was restarted, please try again." } });
      }
      inflight.clear();
    });
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const msg = e.data;
    if (!msg || msg.target !== "lyra-content" || typeof msg.method !== "string") return;
    try {
      if (!port) connect();
      inflight.add(msg.id);
      port.postMessage({ id: msg.id, method: msg.method, params: msg.params });
    } catch {
      // The extension was removed or reloaded: this page's copy of the
      // bridge is orphaned until the page reloads.
      toPage({ id: msg.id, error: { code: 4900, message: "Lyra is unavailable on this page, reload it." } });
    }
  });
})();
