// dApp connection, background side (loaded by background.js).
//
// Websites talk to Lyra through inpage.js -> contentBridge.js -> a
// "lyra-provider" port here. The site's origin is taken from the port's
// sender (set by Chrome), never from the page.
//
//  - Plain reads (chain id, accounts of a connected site, block number,
//    balances, eth_call...) are answered here, the reads through the
//    current network's public RPC.
//  - Anything that commits the user (connecting a site, signing, sending a
//    transaction) opens Lyra's approval window (request.html) in a separate
//    window, where the request is translated into plain language
//    (src/signTranslator.js) and the wallet is unlocked to sign.
//
// Shared state, chrome.storage.local:
//   lyraAddress   the wallet address (written by the wallet pages)
//   lyraNetworks  [{ key, name, chainId, chainIdHex, rpcUrl, nativeSymbol }] (idem)
//   lyraChainId   the network dApps currently see (hex)
//   lyraSites     { [origin]: { connectedAt } } sites allowed to see the address

const READ_METHODS = new Set([
  "eth_blockNumber", "eth_call", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas",
  "eth_feeHistory", "eth_getBalance", "eth_getCode", "eth_getStorageAt", "eth_getTransactionCount",
  "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBlockByNumber", "eth_getBlockByHash",
  "eth_getLogs", "eth_sendRawTransaction", "web3_clientVersion", "eth_syncing",
]);
const SIGN_METHODS = new Set(["personal_sign", "eth_signTypedData_v4", "eth_signTypedData_v3", "eth_sendTransaction"]);
const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("")).origin;

const ports = new Set();              // every open site connection
const pendingApprovals = new Map();   // request id -> { port, msgId, origin, method, windowId }

function rpcError(code, message) {
  return { code, message };
}

async function getState() {
  const s = await chrome.storage.local.get(["lyraAddress", "lyraNetworks", "lyraChainId", "lyraSites"]);
  const networks = Array.isArray(s.lyraNetworks) ? s.lyraNetworks : [];
  const chainId = s.lyraChainId || networks[0]?.chainIdHex || null;
  return {
    address: s.lyraAddress || null,
    networks,
    chainId,
    network: networks.find((n) => n.chainIdHex === chainId) || networks[0] || null,
    sites: s.lyraSites || {},
  };
}

function originOf(port) {
  try {
    return new URL(port.sender?.url || "").origin;
  } catch {
    return null;
  }
}

function broadcast(event, valueFor) {
  for (const port of ports) {
    const value = typeof valueFor === "function" ? valueFor(originOf(port)) : valueFor;
    if (value === undefined) continue;
    try { port.postMessage({ event, value }); } catch { /* port closed */ }
  }
}

async function rpc(network, method, params) {
  if (!network?.rpcUrl) throw rpcError(4900, "Open Lyra once so it can set up its networks.");
  const res = await fetch(network.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }),
  });
  const body = await res.json();
  if (body.error) throw rpcError(body.error.code ?? -32603, body.error.message || "RPC error");
  return body.result;
}

async function openApproval(port, msgId, origin, method, params, state) {
  const id = crypto.randomUUID();
  await chrome.storage.session.set({
    ["lyraRequest:" + id]: { id, origin, method, params, chainId: state.chainId, createdAt: Date.now() },
  });

  // Next to the browser window the request came from, top right.
  const width = 420, height = 680;
  let left, top;
  try {
    const w = port.sender?.tab?.windowId != null ? await chrome.windows.get(port.sender.tab.windowId) : await chrome.windows.getLastFocused();
    left = Math.max(0, (w.left ?? 0) + (w.width ?? width) - width - 20);
    top = Math.max(0, (w.top ?? 0) + 70);
  } catch {
    // default placement
  }
  const options = { url: chrome.runtime.getURL(`request.html?id=${id}`), type: "popup", width, height, focused: true };
  let win;
  try {
    win = await chrome.windows.create({ ...options, left, top });
  } catch {
    // Chrome refuses a position mostly off-screen (several monitors, small
    // screen): let it place the window itself.
    try {
      win = await chrome.windows.create(options);
    } catch (e) {
      await chrome.storage.session.remove("lyraRequest:" + id);
      throw rpcError(-32603, "Lyra couldn't open its approval window.");
    }
  }
  pendingApprovals.set(id, { port, msgId, origin, method, windowId: win.id });
}

async function connectSite(origin) {
  const { sites } = await getState();
  sites[origin] = { connectedAt: Date.now() };
  await chrome.storage.local.set({ lyraSites: sites });
}

async function handle(port, msg) {
  const origin = originOf(port);
  const { method, params } = msg;
  const state = await getState();
  const connected = !!(origin && state.sites[origin] && state.address);

  switch (method) {
    case "eth_chainId":
      if (!state.chainId) throw rpcError(4900, "Open Lyra once so it can set up its networks.");
      return state.chainId;
    case "net_version":
      return state.chainId ? String(parseInt(state.chainId, 16)) : null;
    case "eth_accounts":
      return connected ? [state.address] : [];
    case "eth_coinbase":
      return connected ? state.address : null;
    case "eth_requestAccounts":
    case "wallet_requestPermissions":
      if (connected) {
        return method === "eth_requestAccounts" ? [state.address] : [{ parentCapability: "eth_accounts" }];
      }
      await openApproval(port, msg.id, origin, method, params, state);
      return undefined; // answered when the user decides
    case "wallet_getPermissions":
      return connected ? [{ parentCapability: "eth_accounts" }] : [];
    case "wallet_revokePermissions": {
      delete state.sites[origin];
      await chrome.storage.local.set({ lyraSites: state.sites });
      try { port.postMessage({ event: "accountsChanged", value: [] }); } catch { /* closed */ }
      return null;
    }
    case "wallet_switchEthereumChain": {
      const wanted = String(params?.[0]?.chainId || "").toLowerCase();
      const net = state.networks.find((n) => n.chainIdHex.toLowerCase() === wanted);
      if (!net) throw rpcError(4902, "Lyra doesn't support this network.");
      if (net.chainIdHex !== state.chainId) {
        await chrome.storage.local.set({ lyraChainId: net.chainIdHex });
        broadcast("chainChanged", net.chainIdHex);
      }
      return null;
    }
    case "wallet_addEthereumChain": {
      const wanted = String(params?.[0]?.chainId || "").toLowerCase();
      if (state.networks.some((n) => n.chainIdHex.toLowerCase() === wanted)) return null;
      throw rpcError(4200, "Lyra can't add networks yet.");
    }
    case "eth_sign":
      // Signs a raw hash: indistinguishable from a transaction. Never allowed.
      throw rpcError(4200, "Lyra doesn't support eth_sign, it is unsafe. Use personal_sign.");
  }

  if (SIGN_METHODS.has(method)) {
    if (!connected) throw rpcError(4100, "Connect this site to Lyra first.");
    await openApproval(port, msg.id, origin, method, params, state);
    return undefined;
  }

  if (READ_METHODS.has(method)) return rpc(state.network, method, params);

  throw rpcError(4200, `Lyra doesn't support ${method}.`);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "lyra-provider") return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(async (msg) => {
    try {
      const result = await handle(port, msg);
      if (result !== undefined) port.postMessage({ id: msg.id, result });
    } catch (e) {
      const error = e && typeof e.code === "number" ? e : rpcError(-32603, e?.message || "Internal error");
      try { port.postMessage({ id: msg.id, error }); } catch { /* closed */ }
    }
  });
});

// The approval window answers here. Only Lyra's own request.html may.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "lyra-keepalive") {
    sendResponse(true);
    return;
  }
  if (msg?.type !== "lyra-request-result") return;
  let senderOrigin = null;
  try { senderOrigin = new URL(sender.url).origin; } catch { /* none */ }
  if (sender.id !== chrome.runtime.id || senderOrigin !== EXTENSION_ORIGIN) return;

  (async () => {
    const pending = pendingApprovals.get(msg.id);
    await chrome.storage.session.remove("lyraRequest:" + msg.id);
    if (!pending) {
      sendResponse({ ok: false, reason: "The site stopped waiting for this request." });
      return;
    }
    pendingApprovals.delete(msg.id);
    let reply;
    if (msg.error) {
      reply = { id: pending.msgId, error: rpcError(msg.error.code ?? 4001, msg.error.message || "Rejected") };
    } else if (pending.method === "eth_requestAccounts" || pending.method === "wallet_requestPermissions") {
      await connectSite(pending.origin);
      const { address } = await getState();
      reply = { id: pending.msgId, result: pending.method === "eth_requestAccounts" ? [address] : [{ parentCapability: "eth_accounts" }] };
      try { pending.port.postMessage({ event: "accountsChanged", value: [address] }); } catch { /* closed */ }
    } else {
      reply = { id: pending.msgId, result: msg.result };
    }
    try {
      pending.port.postMessage(reply);
      sendResponse({ ok: true });
    } catch {
      sendResponse({ ok: false, reason: "The site's page was closed." });
    }
  })();
  return true; // async sendResponse
});

// Closing the approval window counts as "reject".
chrome.windows.onRemoved.addListener((windowId) => {
  for (const [id, p] of pendingApprovals) {
    if (p.windowId !== windowId) continue;
    pendingApprovals.delete(id);
    chrome.storage.session.remove("lyraRequest:" + id);
    try { p.port.postMessage({ id: p.msgId, error: rpcError(4001, "The user rejected the request.") }); } catch { /* closed */ }
  }
});

// The site's tab went away: close its approval window.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "lyra-provider") return;
  port.onDisconnect.addListener(() => {
    for (const [id, p] of pendingApprovals) {
      if (p.port !== port) continue;
      pendingApprovals.delete(id);
      chrome.storage.session.remove("lyraRequest:" + id);
      chrome.windows.remove(p.windowId).catch(() => {});
    }
  });
});

// The wallet changed (created, reset): tell connected sites.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.lyraAddress) return;
  const address = changes.lyraAddress.newValue || null;
  chrome.storage.local.get("lyraSites").then(({ lyraSites = {} }) => {
    broadcast("accountsChanged", (origin) => (lyraSites[origin] ? (address ? [address] : []) : undefined));
  });
});
