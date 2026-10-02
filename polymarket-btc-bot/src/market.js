// Finds the currently-open "Bitcoin Up or Down" 5-minute market on
// Polymarket.
//
// Verified live 13.09.2026: these markets follow a fixed recurring slug
// convention, `btc-updown-5m-{epochSeconds}`, where epochSeconds is the
// window's OPEN time, always a multiple of 300 (UTC-aligned, timezone-
// agnostic). GET /events?slug=btc-updown-5m-{epoch} returns that exact
// window directly. Far more reliable than /public-search, which was
// tried first and confirmed to return stale/closed historical markets
// instead of the live one (public-search ranks by relevance/volume, not
// recency). The event's own top-level startDate/endDate are NOT the
// window's bounds (startDate is roughly when the market was *listed*,
// up to ~24h ahead of its actual window). The reliable window bounds
// are the slug's epoch (open) and market.endDate (close), confirmed
// against a live window: slug epoch 1789288200 decodes to exactly the
// window's stated open time, and market.endDate landed exactly 300s
// later.
//
// Resolution itself is on Chainlink's BTC/USD 60s-TWAP stream (confirmed
// from a live market's own description): "Up" if the TWAP over the
// window >= the price at window open, "Down" otherwise. Not a simple
// open-vs-close snapshot. Relevant to strategy.js: waiting until late in
// the window is an even stronger signal here than for a snapshot
// market, since by then most of the TWAP's contribution is already
// realized from the observed price path.
import { GAMMA_API_BASE } from "./polymarketConfig.js";
import { fetchJson } from "./net.js";

const WINDOW_SECONDS = 300;

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

function simplifyMarket(market, windowStartMs, windowEndMs) {
  const outcomes = parseJsonArrayField(market.outcomes);
  const outcomePrices = parseJsonArrayField(market.outcomePrices);
  const clobTokenIds = parseJsonArrayField(market.clobTokenIds);
  if (!outcomes || !clobTokenIds || outcomes.length !== clobTokenIds.length) return null;

  return {
    question: market.question,
    slug: market.slug,
    conditionId: market.conditionId,
    negRisk: !!market.negRisk,
    active: !!market.active,
    closed: !!market.closed,
    startDate: new Date(windowStartMs).toISOString(),
    endDate: new Date(windowEndMs).toISOString(),
    outcomes: outcomes.map((name, i) => ({
      name,
      tokenId: clobTokenIds[i],
      price: outcomePrices?.[i] != null ? Number(outcomePrices[i]) : null,
    })),
  };
}

// Fetches the specific 5-minute window starting at `windowStartEpochSec`
// (a multiple of 300), or null if Polymarket has no such market (e.g.
// too far in the future/past, or the naming convention has changed.
// see the module comment above).
async function fetchWindow(windowStartEpochSec) {
  const slug = `btc-updown-5m-${windowStartEpochSec}`;
  const res = await fetchJson(`${GAMMA_API_BASE}/events?slug=${slug}`);
  if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) return null;

  const event = res.data[0];
  const market = event.markets?.[0];
  if (!market) return null;

  const windowStartMs = windowStartEpochSec * 1000;
  const windowEndMs = windowStartMs + WINDOW_SECONDS * 1000;
  return simplifyMarket(market, windowStartMs, windowEndMs);
}

// Returns the currently-open 5-minute BTC up/down market (the one whose
// window contains "now"), or null if it can't be found. E.g. right at
// the boundary between two windows, or if Polymarket has changed the
// naming convention this relies on (run `npm run discover` after any
// unexpected null to check the raw API response by hand).
export async function findActiveBtc5MinMarket() {
  const now = Math.floor(Date.now() / 1000);
  const currentWindowStart = now - (now % WINDOW_SECONDS);

  const market = await fetchWindow(currentWindowStart);
  if (market && market.active && !market.closed) return market;

  return null;
}

export function findOutcome(market, name) {
  return market.outcomes.find(o => o.name.toLowerCase() === name.toLowerCase()) || null;
}
