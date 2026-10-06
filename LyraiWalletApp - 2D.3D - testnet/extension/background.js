// Clicking the toolbar icon opens the wallet in the browser's side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error("Lyra: couldn't set the side panel behavior", e));
});

// ============================================================
// Websites (dApps): requests from inpage.js, via content.js
// ============================================================
//
// What the background knows: the wallet's public address, the active network
// and its RPC url (written to chrome.storage.local by the wallet page, see
// src/dapp/dappBridge.js), and which sites the user connected. Never the key:
// anything that signs is done in Lyra's own window, after the user confirms.
//
// Every request that needs consent (connect, send a transaction, sign a
// message, switch network) waits in `pending` until the user answers in the
// approval window. Read-only calls (balances, eth_call, gas...) go straight to
// the active network's RPC, the way any wallet answers them.

const STATE_KEY = "lyraWalletState";      // { address, chainId, rpcUrl, networks: [{ chainId, key, name }] }
const SITES_KEY = "lyraConnectedSites";   // { [origin]: { address, connectedAt } }

const READ_ONLY_METHODS = new Set([
  "eth_blockNumber", "eth_call", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas",
  "eth_feeHistory", "eth_getBalance", "eth_getCode", "eth_getStorageAt", "eth_getTransactionCount",
  "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBlockByNumber", "eth_getBlockByHash",
  "eth_getLogs", "eth_syncing", "net_listening",
]);
const NEEDS_CONNECTION = new Set(["eth_sendTransaction", "personal_sign", "eth_signTypedData_v4", "eth_signTypedData_v3", "wallet_switchEthereumChain"]);

const ports = new Set();            // open pages: { port, origin }
const pending = new Map();          // approval id -> { origin, method, params, port, pageId, title, icon }
let nextApprovalId = 1;
let approvalWindowId = null;

const err = (code, message) => ({ code, message });
const USER_REJECTED = err(4001, "The user rejected the request.");
const UNAUTHORIZED = err(4100, "Connect this site to Lyra first.");

async function getState() {
  const { [STATE_KEY]: state } = await chrome.storage.local.get(STATE_KEY);
  return state || null;
}
async function getSites() {
  const { [SITES_KEY]: sites } = await chrome.storage.local.get(SITES_KEY);
  return sites || {};
}
async function connectedAccounts(origin) {
  const [state, sites] = await Promise.all([getState(), getSites()]);
  return sites[origin] && state?.address ? [state.address] : [];
}

function originOf(port) {
  const sender = port.sender || {};
  if (sender.origin) return sender.origin;
  try { return new URL(sender.url || sender.tab?.url).origin; } catch { return null; }
}

async function rpc(method, params) {
  const state = await getState();
  if (!state?.rpcUrl) throw err(4900, "Open Lyra once so it knows which network to use.");
  const res = await fetch(state.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw err(body.error.code ?? -32603, body.error.message || "RPC error");
  return body.result;
}

// ---------------------------------------------------------------- approvals
async function openApprovalWindow() {
  if (approvalWindowId !== null) {
    try {
      await chrome.windows.update(approvalWindowId, { focused: true });
      return;
    } catch { approvalWindowId = null; }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("index.html?dapp=1"),
    type: "popup",
    width: 420,
    height: 720,
    focused: true,
  });
  approvalWindowId = win.id;
}

function askUser(entry) {
  return new Promise((resolve, reject) => {
    const id = nextApprovalId++;
    pending.set(id, { ...entry, id, resolve, reject });
    openApprovalWindow().catch((e) => {
      pending.delete(id);
      reject(err(-32603, "Couldn't open Lyra: " + e.message));
    });
  });
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId !== approvalWindowId) return;
  approvalWindowId = null;
  // Closing the window answers "no" to everything still waiting.
  for (const entry of pending.values()) entry.reject(USER_REJECTED);
  pending.clear();
});

// ---------------------------------------------------------------- auto-lock
// The unlocked session (chrome.storage.session, see src/dapp/dappBridge.js)
// ends after the user's auto-lock delay without activity in any Lyra page,
// even when no Lyra page is open to run its own timer. The background never
// reads the key itself, only these timestamps.
const SESSION_KEY = "lyraUnlockedSession";
async function enforceAutoLock() {
  const { [SESSION_KEY]: s } = await chrome.storage.session.get(SESSION_KEY);
  if (s && s.autoLockMinutes > 0 && Date.now() - s.lastActive > s.autoLockMinutes * 60 * 1000) {
    await chrome.storage.session.remove(SESSION_KEY);
  }
}
enforceAutoLock();

// ---------------------------------------------------------------- requests
async function handle(method, params, ctx) {
  await enforceAutoLock();
  const { origin } = ctx;
  const state = await getState();

  switch (method) {
    case "eth_chainId":
      if (!state?.chainId) throw err(4900, "Open Lyra once so it knows which network to use.");
      return state.chainId;
    case "net_version":
      if (!state?.chainId) throw err(4900, "Open Lyra once so it knows which network to use.");
      return String(parseInt(state.chainId, 16));

    case "eth_accounts":
      return connectedAccounts(origin);

    case "eth_requestAccounts":
    case "wallet_requestPermissions": {
      let accounts = await connectedAccounts(origin);
      if (!accounts.length) {
        accounts = await askUser({ ...ctx, method: "eth_requestAccounts", params: [] });
        const sites = await getSites();
        sites[origin] = { address: accounts[0], connectedAt: Date.now() };
        await chrome.storage.local.set({ [SITES_KEY]: sites });
        broadcast(origin, { type: "event", event: "accountsChanged", data: accounts });
      }
      return method === "wallet_requestPermissions" ? [{ parentCapability: "eth_accounts" }] : accounts;
    }
    case "wallet_getPermissions":
      return (await connectedAccounts(origin)).length ? [{ parentCapability: "eth_accounts" }] : [];
    case "wallet_revokePermissions": {
      const sites = await getSites();
      delete sites[origin];
      await chrome.storage.local.set({ [SITES_KEY]: sites });
      broadcast(origin, { type: "event", event: "accountsChanged", data: [] });
      return null;
    }

    // Raw-hash signing can authorize anything (it's how many drainers work)
    // and no legitimate site needs it any more.
    case "eth_sign":
      throw err(4200, "Lyra never signs raw hashes (eth_sign): it's a common way to steal funds.");
    // The original v1 format (an array of fields, no domain) can't be tied to
    // a site, a network or a contract; every current app uses v3/v4.
    case "eth_signTypedData":
      throw err(4200, "Lyra only signs typed data in the v4 format (eth_signTypedData_v4).");
    case "wallet_addEthereumChain": {
      const wanted = String(params?.[0]?.chainId || "").toLowerCase();
      if (state?.networks?.some((n) => n.chainId === wanted)) return handle("wallet_switchEthereumChain", [{ chainId: wanted }], ctx);
      throw err(4200, "Lyra only works with its own networks.");
    }
    case "wallet_watchAsset":
      return false; // tokens are listed by Lyra itself
  }

  if (NEEDS_CONNECTION.has(method)) {
    if (!(await connectedAccounts(origin)).length) throw UNAUTHORIZED;
    if (method === "wallet_switchEthereumChain") {
      const wanted = String(params?.[0]?.chainId || "").toLowerCase();
      if (!state?.networks?.some((n) => n.chainId === wanted)) {
        throw err(4902, "Lyra doesn't support this network.");
      }
      if (wanted === state.chainId) return null;
    }
    if (method === "eth_signTypedData_v4" || method === "eth_signTypedData_v3") {
      const who = (params || []).find((p) => typeof p === "string" && /^0x[0-9a-fA-F]{40}$/.test(p));
      if (who && who.toLowerCase() !== state.address.toLowerCase()) throw err(4100, "This account isn't the one connected to this site.");
    }
    if (method === "eth_sendTransaction") {
      const from = String(params?.[0]?.from || "").toLowerCase();
      if (from && from !== state.address.toLowerCase()) throw err(4100, "This account isn't the one connected to this site.");
    }
    return askUser({ ...ctx, method, params });
  }

  if (READ_ONLY_METHODS.has(method)) return rpc(method, params);

  throw err(4200, `Lyra doesn't support ${method}.`);
}

// ---------------------------------------------------------------- events
function broadcast(origin, message) {
  for (const p of ports) {
    if (origin === null || p.origin === origin) {
      try { p.port.postMessage(message); } catch { /* page gone */ }
    }
  }
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes[STATE_KEY]) return;
  const before = changes[STATE_KEY].oldValue || {};
  const after = changes[STATE_KEY].newValue || {};
  if (before.chainId !== after.chainId && after.chainId) {
    broadcast(null, { type: "event", event: "chainChanged", data: after.chainId });
  }
  if (before.address !== after.address) {
    const sites = await getSites();
    for (const p of ports) {
      const accounts = sites[p.origin] && after.address ? [after.address] : [];
      try { p.port.postMessage({ type: "event", event: "accountsChanged", data: accounts }); } catch { /* gone */ }
    }
  }
});

chrome.runtime.onConnect.addListener(async (port) => {
  if (port.name !== "lyra-dapp") return;
  const origin = originOf(port);
  if (!origin) return port.disconnect();
  const entry = { port, origin };
  ports.add(entry);
  port.onDisconnect.addListener(() => ports.delete(entry));

  port.onMessage.addListener(async (message) => {
    if (message?.type !== "request") return;
    const ctx = {
      origin,
      title: port.sender?.tab?.title || origin,
      icon: port.sender?.tab?.favIconUrl || null,
    };
    try {
      const result = await handle(message.method, message.params, ctx);
      port.postMessage({ type: "response", id: message.id, result });
    } catch (e) {
      const error = e && typeof e.code === "number" ? e : err(-32603, e?.message || "Internal error");
      try { port.postMessage({ type: "response", id: message.id, error }); } catch { /* page gone */ }
    }
  });

  const state = await getState();
  const accounts = await connectedAccounts(origin);
  try { port.postMessage({ type: "state", chainId: state?.chainId || null, accounts }); } catch { /* gone */ }
});

// ---------------------------------------------------------------- the approval window
// Lyra's own page asks for the next request and answers it. Only Lyra's own
// pages may: a website can't reach this listener at all (no
// externally_connectable), and the content script runs on the site's url, so
// checking the sender's url keeps it out too. (The approval window is an
// extension page inside a window, so it does have a sender.tab.)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !String(sender.url || "").startsWith(chrome.runtime.getURL(""))) return;

  if (message?.type === "lyra-dapp-pending") {
    sendResponse([...pending.values()].map(({ id, origin, title, icon, method, params }) => ({ id, origin, title, icon, method, params })));
    return;
  }
  if (message?.type === "lyra-dapp-resolve") {
    const entry = pending.get(message.id);
    if (entry) {
      pending.delete(message.id);
      if (message.error) entry.reject(message.error);
      else entry.resolve(message.result);
    }
    sendResponse({ ok: !!entry, remaining: pending.size });
    return;
  }
  if (message?.type === "lyra-dapp-sites") {
    getSites().then(sendResponse);
    return true;
  }
  if (message?.type === "lyra-dapp-disconnect") {
    getSites().then(async (sites) => {
      delete sites[message.origin];
      await chrome.storage.local.set({ [SITES_KEY]: sites });
      broadcast(message.origin, { type: "event", event: "accountsChanged", data: [] });
      sendResponse(sites);
    });
    return true;
  }
});
