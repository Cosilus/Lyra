// Bridge between the page's provider (inpage.js, MAIN world) and the extension's
// background service worker. Runs in the content script's isolated world: the
// page can't read its variables or call chrome.* through it.
//
// It forwards only messages tagged by inpage.js, from this exact window, and
// passes nothing but method + params on. The background reads the site's
// origin from the port's sender (set by Chrome), never from the page.
(() => {
  const TO_CONTENT = "lyra-testnet-inpage-to-content";
  const TO_PAGE = "lyra-testnet-content-to-inpage";

  let port = null;
  const queued = [];

  function toPage(message) {
    window.postMessage({ target: TO_PAGE, ...message }, window.location.origin);
  }

  function connect() {
    try {
      port = chrome.runtime.connect({ name: "lyra-dapp" });
    } catch {
      port = null; // extension reloaded or removed: this page needs a refresh
      return;
    }
    port.onMessage.addListener((message) => toPage(message));
    port.onDisconnect.addListener(() => {
      port = null;
      // The service worker went to sleep or restarted: reconnect on the next request.
    });
    while (queued.length) port.postMessage(queued.shift());
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.target !== TO_CONTENT) return;
    const { id, method, params } = event.data;
    const message = { type: "request", id, method, params };
    if (!port) {
      queued.push(message);
      connect();
      if (!port) {
        queued.pop();
        toPage({ type: "response", id, error: { code: 4900, message: "Lyra isn't reachable. Reload this page." } });
      }
      return;
    }
    port.postMessage(message);
  });

  connect();
})();
