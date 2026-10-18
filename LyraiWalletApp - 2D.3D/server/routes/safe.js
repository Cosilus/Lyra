// Proxy to Safe's Transaction Service (the multisig's shared queue of
// pending transactions). The API key lives here, in SAFE_API_KEY, never
// in the browser bundle: a VITE_ variable ends up in the public JS, and
// anyone who copied it could burn the whole monthly quota (50,000
// requests on Safe's free plan), after which every user's multisig
// would get a 429 until the next month.
//
// Only the exact endpoints src/multisig.js calls are forwarded, so this
// can't be used as an open relay to the rest of Safe's API, and two
// small in-memory limits keep one client from eating the shared quota.

import { getNetworkByKey } from "../../src/config.js";

// Safe's Transaction Service short name per chain id, from
// safe-config.safe.global (03.10.2026). Keyed by chain id because the
// mainnet and testnet builds share network keys ("ethereum" is Sepolia
// on testnet). Same chain list as SAFE_CHAIN_IDS in src/multisig.js.
const TX_SERVICE_SHORT_NAME = {
  1: "eth",
  8453: "base",
  137: "pol",
  9745: "plasma",
  11155111: "sep",
  84532: "basesep",
};

const ADDRESS = "0x[0-9a-fA-F]{40}";
const HASH = "0x[0-9a-fA-F]{64}";
const ALLOWED = [
  { method: "GET", re: new RegExp(`^/v1/safes/${ADDRESS}/$`) },
  { method: "GET", re: new RegExp(`^/v2/safes/${ADDRESS}/multisig-transactions/$`) },
  { method: "POST", re: new RegExp(`^/v2/safes/${ADDRESS}/multisig-transactions/$`) },
  { method: "GET", re: new RegExp(`^/v2/multisig-transactions/${HASH}/$`) },
  { method: "POST", re: new RegExp(`^/v1/multisig-transactions/${HASH}/confirmations/$`) },
  // which Safes an address owns (a co-owner on another device finds them), and how a Safe was created
  { method: "GET", re: new RegExp(`^/v1/owners/${ADDRESS}/safes/$`) },
  { method: "GET", re: new RegExp(`^/v1/safes/${ADDRESS}/creation/$`) },
  // a Safe's history in the wallet's Multisig tabs: what came in
  { method: "GET", re: new RegExp(`^/v1/safes/${ADDRESS}/incoming-transfers/$`) },
];
// Query strings: the pending list (executed, nonce__gte) and the history pages (limit).
const ALLOWED_QUERY_KEYS = new Set(["executed", "nonce__gte", "limit"]);

// One multisig transaction from start to finish is about 10 requests,
// so 30 a minute per client is plenty for real use. The global cap
// stays under Safe's own 5 requests/second on the free plan.
const PER_CLIENT_PER_MINUTE = 30;
const GLOBAL_PER_MINUTE = 240;
const WINDOW_MS = 60 * 1000;

let windowStart = Date.now();
let globalCount = 0;
const countsByClient = new Map();

function overLimit(clientKey) {
  const now = Date.now();
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    globalCount = 0;
    countsByClient.clear();
  }
  const count = (countsByClient.get(clientKey) || 0) + 1;
  countsByClient.set(clientKey, count);
  globalCount++;
  return count > PER_CLIENT_PER_MINUTE || globalCount > GLOBAL_PER_MINUTE;
}

// Behind Render's proxy the socket address is the proxy itself; the
// last X-Forwarded-For entry is the one the proxy added for the real
// client (earlier entries can be written by the client and are ignored).
function clientKeyOf(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
  return forwarded[forwarded.length - 1] || req.socket.remoteAddress || "unknown";
}

export function registerSafeRoutes(app) {
  if (!process.env.SAFE_API_KEY) {
    console.warn("[safe] SAFE_API_KEY is not set: multisig calls go to Safe unauthenticated (2 requests/s, 5,000/month). Free key: https://developer.safe.global");
  }

  app.use("/api/safe/:network", async (req, res) => {
    const shortName = TX_SERVICE_SHORT_NAME[getNetworkByKey(req.params.network)?.chainId];
    if (!shortName) {
      return res.status(400).json({ error: "Multisig isn't available on this network." });
    }

    const path = req.path;
    if (!ALLOWED.some(a => a.method === req.method && a.re.test(path))) {
      return res.status(404).json({ error: "Unknown multisig endpoint." });
    }

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (!ALLOWED_QUERY_KEYS.has(key) || typeof value !== "string") {
        return res.status(400).json({ error: "Unexpected query parameter." });
      }
      query.set(key, value);
    }

    if (overLimit(clientKeyOf(req))) {
      return res.status(429).json({ error: "Too many multisig requests, try again in a minute." });
    }

    const headers = { "Content-Type": "application/json" };
    if (process.env.SAFE_API_KEY) headers.Authorization = `Bearer ${process.env.SAFE_API_KEY}`;

    const qs = query.toString();
    const url = `https://api.safe.global/tx-service/${shortName}/api${path}${qs ? `?${qs}` : ""}`;

    try {
      const upstream = await fetch(url, {
        method: req.method,
        headers,
        body: req.method === "POST" ? JSON.stringify(req.body || {}) : undefined,
      });
      // Passed through as-is (status and body, which can be empty on a
      // successful POST): src/multisig.js already handles both.
      const text = await upstream.text();
      res.status(upstream.status);
      res.type(upstream.headers.get("content-type") || "application/json");
      res.send(text);
    } catch (error) {
      console.error("Safe Transaction Service proxy error:", error);
      res.status(502).json({ error: "Couldn't reach Safe's Transaction Service right now." });
    }
  });
}
