/**
 * POLYMARKET INTEGRATION
 * ================================================================
 * Read-only helpers against Polymarket's two public APIs, both
 * unauthenticated for market data:
 *  - Gamma API (https://gamma-api.polymarket.com): market discovery,
 *    metadata, current prices.
 *  - CLOB API (https://clob.polymarket.com): live order-book prices.
 *
 * Handles both plain binary markets and neg-risk multi-outcome ones
 * (e.g. most team-sport match markets: home win / draw / away win as
 * three separate yes/no markets meant to sum to 100%). Each returned
 * market carries its own `negRisk` flag so the caller can route the
 * order through the right exchange contract (see polygon.polymarket
 * in src/config.js: ctfExchange vs negRiskExchange).
 */

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";
const DATA_API_BASE = "https://data-api.polymarket.com";

// Gamma returns outcomes/outcomePrices/clobTokenIds as JSON-encoded
// strings, not real arrays. Returns null on anything malformed
// instead of throwing, so one bad market doesn't kill a whole search.
function parseJsonArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function simplifyMarket(market) {
  const outcomes = parseJsonArrayField(market.outcomes);
  const outcomePrices = parseJsonArrayField(market.outcomePrices);
  const clobTokenIds = parseJsonArrayField(market.clobTokenIds);
  if (!outcomes || !clobTokenIds || outcomes.length !== clobTokenIds.length) return null;

  return {
    question: market.question,
    conditionId: market.conditionId,
    negRisk: !!market.negRisk,
    active: !!market.active,
    closed: !!market.closed,
    endDate: market.endDate || market.end_date_iso || null,
    outcomes: outcomes.map((name, i) => ({
      name,
      tokenId: clobTokenIds[i],
      price: outcomePrices?.[i] != null ? Number(outcomePrices[i]) : null,
    })),
  };
}

// Simple keyword scoring instead of a real search index: every query
// word found in the market question counts once, case-insensitive.
// Good enough for short queries like "PSG Bayern" or "Trump election".
function scoreMatch(question, query) {
  const q = (question || "").toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.reduce((score, w) => score + (q.includes(w) ? 1 : 0), 0);
}

// Searches Polymarket for open markets matching a free-text query.
// /events?search= silently ignores the search param and just returns
// its default-sorted list (confirmed by testing live, "liverpool
// fulham" came back with an unrelated top result); /public-search is
// the real full-text search endpoint. It doesn't filter by
// active/closed on its own, so that still happens locally below.
export async function searchPolymarketMarkets(query, limit = 5) {
  const url = new URL(`${GAMMA_API_BASE}/public-search`);
  url.searchParams.set("q", query);

  let events;
  try {
    // Without an explicit timeout, an unreachable/blocked host can hang
    // on the platform's own default (well over a minute), and this gets
    // called multiple times across the ticket-prep tool loop, compounding
    // into minutes of dead wait before ever reaching a real error.
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return { found: false, reason: `Polymarket search failed (HTTP ${response.status}).` };
    }
    const data = await response.json();
    events = data?.events;
  } catch (e) {
    return { found: false, reason: "Couldn't reach Polymarket for a market search." };
  }

  if (!Array.isArray(events) || events.length === 0) {
    return { found: false, reason: "No matching Polymarket market found." };
  }

  const candidates = [];
  for (const event of events) {
    for (const market of event.markets || []) {
      const simplified = simplifyMarket(market);
      if (!simplified || !simplified.active || simplified.closed) continue;
      candidates.push({ ...simplified, score: scoreMatch(simplified.question, query) });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.filter(c => c.score > 0).slice(0, limit);

  if (top.length === 0) {
    return { found: false, reason: "No open market matches that question yet." };
  }
  return { found: true, markets: top };
}

// Best current price for one outcome token (0-1, an implied
// probability). "buy" side is what a new bet actually pays.
export async function getClobPrice(tokenId, side = "buy") {
  const url = new URL(`${CLOB_API_BASE}/price`);
  url.searchParams.set("token_id", tokenId);
  url.searchParams.set("side", side);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return { found: false, reason: `Polymarket price lookup failed (HTTP ${response.status}).` };
    }
    const data = await response.json();
    const price = Number(data?.price);
    if (!price || Number.isNaN(price)) {
      return { found: false, reason: "Polymarket didn't return a valid price for this outcome." };
    }
    return { found: true, price };
  } catch (e) {
    return { found: false, reason: "Couldn't reach Polymarket for a live price." };
  }
}

// Looks up one market by its condition ID (not a text search): used by
// the Predictions tab to resolve a held position's negRisk flag (which
// exchange contract a cash-out sell order has to go through) and its
// open/closed state. "condition_ids" (snake_case) is the real filter
// param here, confirmed live: "conditionIds" (camelCase) silently
// returns Gamma's default, unfiltered listing instead of erroring, an
// easy trap since it looks like it worked.
export async function getPolymarketMarketByConditionId(conditionId) {
  const url = new URL(`${GAMMA_API_BASE}/markets`);
  url.searchParams.set("condition_ids", conditionId);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return { found: false, reason: `Polymarket market lookup failed (HTTP ${response.status}).` };
    }
    const data = await response.json();
    const market = Array.isArray(data) ? data[0] : null;
    const simplified = market ? simplifyMarket(market) : null;
    if (!simplified) {
      return { found: false, reason: "No market found for that condition ID." };
    }
    return { found: true, market: simplified };
  } catch (e) {
    return { found: false, reason: "Couldn't reach Polymarket for market data." };
  }
}

// This account's Polymarket positions (held outcome-token shares),
// straight from Polymarket's own public Data API: no auth needed, and
// (confirmed live) it indexes positions under the wallet's own EOA
// address as "proxyWallet", not the deposit-wallet address Lyra
// computes for on-chain purposes elsewhere. Pass the EOA here.
// `redeemable: true` means the market has resolved and this position's
// winnings are ready to claim; the Predictions tab uses that instead of
// a separate open/closed market lookup to tell a live position from a
// closed one.
export async function getPolymarketPositions(address) {
  const url = new URL(`${DATA_API_BASE}/positions`);
  url.searchParams.set("user", address);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return { found: false, reason: `Polymarket positions lookup failed (HTTP ${response.status}).` };
    }
    const positions = await response.json();
    return { found: true, positions: Array.isArray(positions) ? positions : [] };
  } catch (e) {
    return { found: false, reason: "Couldn't reach Polymarket for your positions." };
  }
}

// /positions only ever returns currently-held (non-zero) positions,
// so a fully cashed-out or already-redeemed bet simply vanishes from
// it with no trace. /activity is Polymarket's own permanent trade
// ledger for this address (every BUY/SELL, forever, confirmed live:
// it still returned trades from well before this session), the
// Predictions tab's "history" half is built by grouping these by
// market instead of relying on Lyra's own (session-only, non-
// persistent) state.
export async function getPolymarketActivity(address) {
  const url = new URL(`${DATA_API_BASE}/activity`);
  url.searchParams.set("user", address);
  url.searchParams.set("limit", "500");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return { found: false, reason: `Polymarket activity lookup failed (HTTP ${response.status}).` };
    }
    const activity = await response.json();
    return { found: true, activity: Array.isArray(activity) ? activity : [] };
  } catch (e) {
    return { found: false, reason: "Couldn't reach Polymarket for your trade history." };
  }
}

// CLOB auth (L1/L2) and order submission are built and signed entirely
// client-side (App.jsx), but the actual network calls go through this
// server now, via the /api/polymarket/clob-proxy route in server.js,
// not straight from the browser to clob.polymarket.com. They used to
// go direct, on the assumption that the browser's own DNS would
// sidestep the ISP-level DNS hijack this dev machine hits on
// Polymarket's domains (see DEV_DNS_OVERRIDE in server.js). Confirmed
// live that a browser can hit the exact same hijack, so that
// assumption doesn't hold unconditionally. The proxy forwards the
// request body as the exact raw bytes received, never re-parsed or
// re-serialized, so the HMAC signature (computed client-side over that
// exact JSON string) still matches what Polymarket receives.
