// Lyra's EIP-1193 provider, injected into web pages (content script, MAIN world).
//
// This file runs inside the website itself, next to the site's own code, so it
// holds nothing secret: no key, no address book, no balance. It only forwards
// requests to content.js (window.postMessage), which forwards them to the
// extension's background service worker, where every request that needs the
// user's consent waits for an explicit confirmation in Lyra's own window.
//
// Discovery: announced via EIP-6963 so sites that list wallets show Lyra next
// to MetaMask and the others. window.ethereum is only set when no other wallet
// already took it: Lyra never hijacks another wallet's slot.
(() => {
  if (window.lyraTestnetEthereum) return;

  const TO_CONTENT = "lyra-testnet-inpage-to-content";
  const TO_PAGE = "lyra-testnet-content-to-inpage";

  const listeners = new Map();
  const pending = new Map();
  let nextId = 1;

  function emit(event, ...args) {
    for (const fn of listeners.get(event) || []) {
      try { fn(...args); } catch (e) { console.error("Lyra provider listener failed:", e); }
    }
  }

  function rpcError(code, message, data) {
    const err = new Error(message);
    err.code = code;
    if (data !== undefined) err.data = data;
    return err;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.target !== TO_PAGE) return;
    const msg = event.data;
    if (msg.type === "response") {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(rpcError(msg.error.code, msg.error.message, msg.error.data));
      else p.resolve(msg.result);
    } else if (msg.type === "state") {
      // Initial values on page load: set quietly, a "chainChanged" here
      // would make many sites reload themselves.
      provider.chainId = msg.chainId;
      provider.selectedAddress = msg.accounts[0] || null;
    } else if (msg.type === "event") {
      if (msg.event === "chainChanged") provider.chainId = msg.data;
      if (msg.event === "accountsChanged") provider.selectedAddress = msg.data[0] || null;
      emit(msg.event, msg.data);
    }
  });

  const provider = {
    isLyra: true,
    chainId: null,
    selectedAddress: null,

    request({ method, params } = {}) {
      if (typeof method !== "string" || !method) {
        return Promise.reject(rpcError(-32602, "Invalid request: method must be a non-empty string."));
      }
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        window.postMessage({ target: TO_CONTENT, id, method, params: params ?? [] }, window.location.origin);
      });
    },

    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return provider;
    },
    removeListener(event, fn) {
      listeners.get(event)?.delete(fn);
      return provider;
    },
    off(event, fn) { return provider.removeListener(event, fn); },

    // Legacy entry points some older sites still call.
    enable() { return provider.request({ method: "eth_requestAccounts" }); },
    send(methodOrPayload, paramsOrCallback) {
      if (typeof methodOrPayload === "string") {
        return provider.request({ method: methodOrPayload, params: paramsOrCallback });
      }
      return provider.sendAsync(methodOrPayload, paramsOrCallback);
    },
    sendAsync(payload, callback) {
      provider.request(payload).then(
        (result) => callback(null, { id: payload.id, jsonrpc: "2.0", result }),
        (error) => callback(error, null)
      );
    },
    isConnected() { return true; },
  };

  Object.defineProperty(window, "lyraTestnetEthereum", { value: provider, configurable: false, writable: false });
  if (!window.ethereum) {
    try { window.ethereum = provider; } catch { /* another wallet defined a read-only slot */ }
  }

  // EIP-6963: answer every "which wallets are there?" request.
  const info = Object.freeze({
    uuid: crypto.randomUUID(),
    name: "Lyra (Testnet)",
    rdns: "com.lyra.iwallet.testnet",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%2312091f'/%3E%3Cpath d='M32 8c1.6 13 4.6 20.4 24 24-19.4 3.6-22.4 11-24 24-1.6-13-4.6-20.4-24-24 19.4-3.6 22.4-11 24-24z' fill='%23e9e3ff'/%3E%3C/svg%3E",
  });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
    detail: Object.freeze({ info, provider }),
  }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
