// Read-only P&L report for dry-run trades. Looks up each market's real
// resolution on Gamma, then computes P&L twice: at the logged Gamma price
// (optimistic) and at the real book fill price (realistic, only for
// trades logged after fillPrice tracking was added).
import { GAMMA_API_BASE } from "./polymarketConfig.js";
import { fetchJson } from "./net.js";
import { loadTrades } from "./risk.js";

function summarize(label, rows) {
  const staked = rows.reduce((s, r) => s + r.stake, 0);
  const pnl = rows.reduce((s, r) => s + r.pnl, 0);
  const wins = rows.filter(r => r.won).length;
  console.log(`${label}: ${rows.length} trades | ${wins}W/${rows.length - wins}L | staked $${staked.toFixed(2)} | P&L $${pnl.toFixed(2)} | ROI ${staked ? ((pnl / staked) * 100).toFixed(1) : "n/a"}%`);
}

export async function runReport({ since }) {
  const trades = loadTrades().filter(t => t.result === "dry-run" && (!since || t.timestamp >= since));
  const gammaRows = [];
  const fillRows = [];
  let unresolved = 0;
  let unfillable = 0;

  for (const t of trades) {
    const windowStartSec = Math.floor(new Date(t.windowEnd).getTime() / 1000) - 300;
    const res = await fetchJson(`${GAMMA_API_BASE}/events?slug=btc-updown-5m-${windowStartSec}`);
    const market = res.data?.[0]?.markets?.[0];
    if (!market?.closed) {
      unresolved++;
      continue;
    }
    const outcomes = JSON.parse(market.outcomes);
    const prices = JSON.parse(market.outcomePrices);
    const i = outcomes.findIndex(o => o.toLowerCase() === t.side.toLowerCase());
    const won = Number(prices[i]) >= 0.5;

    gammaRows.push({ stake: t.stakeUsd, won, pnl: won ? t.stakeUsd / t.entryPrice - t.stakeUsd : -t.stakeUsd });

    if (t.fillPrice === undefined) continue; // logged before fill tracking existed
    if (t.fillPrice === null) {
      unfillable++;
      continue;
    }
    fillRows.push({ stake: t.stakeUsd, won, pnl: won ? t.stakeUsd / t.fillPrice - t.stakeUsd : -t.stakeUsd });
  }

  summarize("At Gamma price (optimistic)", gammaRows);
  summarize("At real book fill price     ", fillRows);
  console.log(`Unresolved: ${unresolved} | Not fillable at stake size: ${unfillable}`);
}
