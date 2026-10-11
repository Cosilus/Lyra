// Website requests (browser extension): what a transaction would really do,
// and what is known about the site and the contract it talks to.
//
//   POST /api/dapp/analyze { network, origin, from, tx?, address? }
//   -> { site, simulation, contract }
//
// Everything here is best effort and fails open: a check that couldn't run
// comes back as null, never as "safe", and never blocks the request on its
// own. The wallet page decides what to show (src/dapp/DappRequests.jsx).
import { ethers } from "ethers";

const TRANSFER = ethers.id("Transfer(address,address,uint256)");
const APPROVAL = ethers.id("Approval(address,address,uint256)");
const APPROVAL_FOR_ALL = ethers.id("ApprovalForAll(address,address,bool)");
const TRANSFER_SINGLE = ethers.id("TransferSingle(address,address,address,uint256,uint256)");
const TRANSFER_BATCH = ethers.id("TransferBatch(address,address,address,uint256[],uint256[])");
// eth_simulateV1 with traceTransfers reports native coin moves as Transfer
// logs from this pseudo address (ERC-7528).
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const BLOCKSCOUT = {
  1: "https://eth.blockscout.com",
  8453: "https://base.blockscout.com",
  137: "https://polygon.blockscout.com",
};

const ERC20_META = new ethers.Interface([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
]);

// ---------------------------------------------------------------- phishing domains
// MetaMask's public phishing list (eth-phishing-detect), refreshed every 6h,
// plus GoPlus' phishing-site check per request.
let phishingList = { blacklist: new Set(), whitelist: new Set(), loadedAt: 0, loading: null };
async function loadPhishingList() {
  if (Date.now() - phishingList.loadedAt < 6 * 3600 * 1000) return phishingList;
  if (phishingList.loading) return phishingList.loading;
  phishingList.loading = (async () => {
    try {
      const r = await fetch("https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json", { signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      phishingList = { blacklist: new Set(j.blacklist || []), whitelist: new Set(j.whitelist || []), loadedAt: Date.now(), loading: null };
    } catch (e) {
      console.error("Phishing list unavailable:", e.message);
      phishingList.loading = null;
    }
    return phishingList;
  })();
  return phishingList.loading;
}
loadPhishingList();

// "app.evil.xyz" is listed if "evil.xyz" is.
const domainAndParents = (host) => host.split(".").map((_, i, parts) => parts.slice(i).join(".")).filter(d => d.includes("."));

async function checkSite(origin) {
  let host;
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return null; }
  if (host === "localhost" || host === "127.0.0.1") return { host, phishing: false, sources: [] };
  const sources = [];
  const list = await loadPhishingList();
  const candidates = domainAndParents(host);
  if (!candidates.some(d => list.whitelist.has(d)) && candidates.some(d => list.blacklist.has(d))) sources.push("MetaMask phishing list");
  try {
    const r = await fetch(`https://api.gopluslabs.io/api/v1/phishing_site?url=${encodeURIComponent(origin)}`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (j?.result?.phishing_site === 1) sources.push("GoPlus");
  } catch { /* unavailable: the list above still counts */ }
  return { host, phishing: sources.length > 0, sources };
}

// ---------------------------------------------------------------- contract facts
async function checkContract(network, address, provider, lookupSecurityBadges) {
  if (!ethers.isAddress(address)) return null;
  const out = { address, isContract: null, verified: null, name: null, ageDays: null, flags: [] };
  try {
    const code = await provider.getCode(address);
    const delegated = /^0xef0100[0-9a-f]{40}$/i.test(code);
    out.isContract = code !== "0x" && !delegated;
  } catch { /* unknown */ }
  if (!out.isContract) return out;

  const tasks = [];
  tasks.push(fetch(`https://sourcify.dev/server/v2/contract/${network.chainId}/${address}`, { signal: AbortSignal.timeout(6000) })
    .then(r => (r.ok ? r.json() : null))
    .then(j => { if (j?.match) out.verified = true; })
    .catch(() => {}));
  const scout = BLOCKSCOUT[network.chainId];
  if (scout) {
    tasks.push((async () => {
      const r = await fetch(`${scout}/api/v2/addresses/${address}`, { signal: AbortSignal.timeout(6000) });
      const a = await r.json();
      if (a.is_verified) out.verified = true;
      else if (out.verified === null && a.is_verified === false) out.verified = false;
      out.name = a.name || out.name;
      if (a.reputation === "scam") out.flags.push("marked as scam on Blockscout");
      const hash = a.creation_transaction_hash || a.creation_tx_hash;
      if (hash) {
        const t = await (await fetch(`${scout}/api/v2/transactions/${hash}`, { signal: AbortSignal.timeout(6000) })).json();
        if (t.timestamp) out.ageDays = Math.floor((Date.now() - Date.parse(t.timestamp)) / 86400000);
      }
    })().catch(() => {}));
  }
  tasks.push(lookupSecurityBadges(network, address).then(b => { out.flags.push(...b.flags); if (b.token?.name && !out.name) out.name = b.token.name; }).catch(() => {}));
  await Promise.all(tasks);
  return out;
}

// ---------------------------------------------------------------- simulation
const tokenMetaCache = new Map();
async function tokenMeta(provider, network, address) {
  const key = `${network.chainId}:${address.toLowerCase()}`;
  if (address.toLowerCase() === NATIVE) return { symbol: network.nativeSymbol, decimals: 18 };
  if (!tokenMetaCache.has(key)) {
    const call = (fn) => provider.call({ to: address, data: ERC20_META.encodeFunctionData(fn) }).then(r => ERC20_META.decodeFunctionResult(fn, r)[0]).catch(() => null);
    tokenMetaCache.set(key, Promise.all([call("symbol"), call("decimals"), call("name")]).then(([symbol, decimals, name]) => ({ symbol: symbol || null, decimals: decimals == null ? null : Number(decimals), name: name || null })));
  }
  return tokenMetaCache.get(key);
}

const topicAddress = (t) => ethers.getAddress("0x" + t.slice(26)).toLowerCase();

async function simulate(network, provider, from, tx) {
  const call = { from, to: tx.to || undefined, data: tx.data || "0x", value: tx.value ? ethers.toQuantity(BigInt(tx.value)) : "0x0" };
  if (tx.gas) call.gas = ethers.toQuantity(BigInt(tx.gas));
  let res;
  try {
    res = await provider.send("eth_simulateV1", [{ blockStateCalls: [{ calls: [call] }], traceTransfers: true, validation: false }, "latest"]);
  } catch (e) {
    // The node refuses the whole simulation when the wallet can't even pay
    // the value + fee (-38014): that's a failing transaction, not "unknown".
    const rpcMessage = e.error?.message || e.info?.error?.message || "";
    if (e.error?.code === -38014 || /insufficient funds/i.test(rpcMessage)) {
      return { available: true, reverted: true, error: `not enough ${network.nativeSymbol} for this amount plus the network fee` };
    }
    return { available: false, reason: rpcMessage || e.shortMessage || e.message };
  }
  const result = res?.[0]?.calls?.[0];
  if (!result) return { available: false, reason: "No result" };
  if (result.status !== "0x1") {
    return { available: true, reverted: true, error: result.error?.message || "The transaction would fail." };
  }

  const me = from.toLowerCase();
  const moves = new Map(); // token -> { out, in, nfts out/in }
  const approvals = [];
  const bucket = (token) => {
    if (!moves.has(token)) moves.set(token, { token, out: 0n, in: 0n, nftsOut: [], nftsIn: [] });
    return moves.get(token);
  };
  for (const log of result.logs || []) {
    const token = log.address.toLowerCase();
    const [t0, t1, t2, t3] = log.topics;
    if (t0 === TRANSFER && log.topics.length === 3) {
      const f = topicAddress(t1), t = topicAddress(t2), amount = BigInt(log.data);
      if (f === me) bucket(token).out += amount;
      if (t === me) bucket(token).in += amount;
    } else if (t0 === TRANSFER && log.topics.length === 4) {
      const f = topicAddress(t1), t = topicAddress(t2), id = BigInt(t3).toString();
      if (f === me) bucket(token).nftsOut.push(id);
      if (t === me) bucket(token).nftsIn.push(id);
    } else if (t0 === TRANSFER_SINGLE) {
      const f = topicAddress(t2), t = topicAddress(t3);
      const [id, amount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], log.data);
      if (f === me) bucket(token).nftsOut.push(`${id}${amount > 1n ? ` ×${amount}` : ""}`);
      if (t === me) bucket(token).nftsIn.push(`${id}${amount > 1n ? ` ×${amount}` : ""}`);
    } else if (t0 === TRANSFER_BATCH) {
      const f = topicAddress(t2), t = topicAddress(t3);
      const [ids] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256[]", "uint256[]"], log.data);
      if (f === me) bucket(token).nftsOut.push(...ids.map(String));
      if (t === me) bucket(token).nftsIn.push(...ids.map(String));
    } else if (t0 === APPROVAL && log.topics.length === 3 && topicAddress(t1) === me) {
      approvals.push({ token, spender: topicAddress(t2), amount: BigInt(log.data).toString(), all: false });
    } else if (t0 === APPROVAL_FOR_ALL && topicAddress(t1) === me) {
      const on = BigInt(log.data) !== 0n;
      if (on) approvals.push({ token, spender: topicAddress(t2), all: true });
    }
  }

  const changes = [];
  for (const m of moves.values()) {
    const meta = await tokenMeta(provider, network, m.token);
    const fmt = (raw) => (meta.decimals == null ? raw.toString() : ethers.formatUnits(raw, meta.decimals));
    const net = m.in - m.out;
    if (net !== 0n) changes.push({ token: m.token, symbol: meta.symbol, direction: net > 0n ? "in" : "out", amount: fmt(net > 0n ? net : -net), kind: "fungible" });
    if (m.nftsOut.length) changes.push({ token: m.token, symbol: meta.symbol || meta.name, direction: "out", ids: m.nftsOut, kind: "nft" });
    if (m.nftsIn.length) changes.push({ token: m.token, symbol: meta.symbol || meta.name, direction: "in", ids: m.nftsIn, kind: "nft" });
  }
  for (const a of approvals) {
    const meta = await tokenMeta(provider, network, a.token);
    a.symbol = meta.symbol;
    if (!a.all) a.unlimited = BigInt(a.amount) >= ethers.MaxUint256 / 2n;
    if (!a.all && !a.unlimited && meta.decimals != null) a.amountText = ethers.formatUnits(a.amount, meta.decimals);
  }
  return { available: true, reverted: false, changes, approvals };
}

// ---------------------------------------------------------------- plan simulation
// A Lyra plan (send, approve + swap, approve + stake...) as one block of
// calls: each call sees the state the previous ones left, so a stake right
// after a swap is simulated with the swapped tokens. Returns the wallet's net
// token moves over the whole plan, or the first call that would fail.
async function simulatePlan(network, provider, from, calls) {
  const toCall = (tx) => ({ from, to: tx.to, data: tx.data || "0x", value: tx.value ? ethers.toQuantity(BigInt(tx.value)) : "0x0" });
  let res;
  try {
    res = await provider.send("eth_simulateV1", [{ blockStateCalls: [{ calls: calls.map(toCall) }], traceTransfers: true, validation: false }, "latest"]);
  } catch (e) {
    const rpcMessage = e.error?.message || e.info?.error?.message || "";
    if (e.error?.code === -38014 || /insufficient funds/i.test(rpcMessage)) {
      return { available: true, reverted: true, failedIndex: 0, step: calls[0]?.step ?? 0, error: `not enough ${network.nativeSymbol} for this amount plus the network fee` };
    }
    return { available: false, reason: rpcMessage || e.shortMessage || e.message };
  }
  const results = res?.[0]?.calls || [];
  if (results.length !== calls.length) return { available: false, reason: "No result" };
  const failedIndex = results.findIndex(r => r.status !== "0x1");
  if (failedIndex >= 0) {
    const r = results[failedIndex];
    let reason = r.error?.message || "The transaction would fail.";
    // a plain revert string (Error(string)) reads better than "execution reverted"
    const data = r.error?.data || r.returnData;
    if (typeof data === "string" && data.startsWith("0x08c379a0")) {
      try { reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + data.slice(10))[0]; } catch { /* keep the generic one */ }
    }
    return { available: true, reverted: true, failedIndex, step: calls[failedIndex].step ?? null, error: reason };
  }

  const me = from.toLowerCase();
  const net = new Map(); // token -> net raw amount
  for (const log of results.flatMap(r => r.logs || [])) {
    if (log.topics?.[0] !== TRANSFER || log.topics.length !== 3) continue;
    const token = log.address.toLowerCase();
    const f = topicAddress(log.topics[1]), t = topicAddress(log.topics[2]);
    const amount = BigInt(log.data);
    if (f === me) net.set(token, (net.get(token) || 0n) - amount);
    if (t === me) net.set(token, (net.get(token) || 0n) + amount);
  }
  const changes = [];
  for (const [token, raw] of net) {
    if (raw === 0n) continue;
    const meta = await tokenMeta(provider, network, token);
    const abs = raw > 0n ? raw : -raw;
    changes.push({ token, symbol: meta.symbol, direction: raw > 0n ? "in" : "out", amount: meta.decimals == null ? abs.toString() : ethers.formatUnits(abs, meta.decimals) });
  }
  const gasUsed = results.reduce((sum, r) => sum + BigInt(r.gasUsed || 0), 0n);
  let fee = null;
  try {
    const fd = await provider.getFeeData();
    const price = fd.gasPrice ?? fd.maxFeePerGas;
    if (price) fee = ethers.formatEther(gasUsed * price);
  } catch { /* the fee line is optional */ }
  return { available: true, reverted: false, changes, gasUsed: gasUsed.toString(), fee, feeSymbol: network.nativeSymbol };
}

// ---------------------------------------------------------------- route
export function registerDappRoutes(app, { resolveNetwork, getServerRpc, lookupSecurityBadges }) {
  //   POST /api/simulate/plan { network, from, calls: [{ to, data, value, step }] }
  app.post("/api/simulate/plan", async (req, res) => {
    const { network: networkKey, from, calls } = req.body || {};
    if (!ethers.isAddress(from || "")) return res.status(400).json({ error: "from must be an address." });
    if (!Array.isArray(calls) || !calls.length || calls.length > 24 || !calls.every(c => ethers.isAddress(c?.to || ""))) {
      return res.status(400).json({ error: "calls must be 1 to 24 transactions." });
    }
    const network = resolveNetwork(networkKey);
    const provider = getServerRpc(network);
    try {
      res.json(await simulatePlan(network, provider, from, calls));
    } catch (e) {
      res.json({ available: false, reason: e.message });
    }
  });

  app.post("/api/dapp/analyze", async (req, res) => {
    const { network: networkKey, origin, from, tx, address } = req.body || {};
    if (!ethers.isAddress(from || "")) return res.status(400).json({ error: "from must be an address." });
    const network = resolveNetwork(networkKey);
    const provider = getServerRpc(network);
    const contractAddress = address || tx?.to || null;

    const [site, simulation, contract] = await Promise.all([
      origin ? checkSite(origin).catch(() => null) : null,
      tx ? simulate(network, provider, from, tx).catch(e => ({ available: false, reason: e.message })) : null,
      contractAddress ? checkContract(network, contractAddress, provider, lookupSecurityBadges).catch(() => null) : null,
    ]);
    res.json({ site, simulation, contract });
  });
}
