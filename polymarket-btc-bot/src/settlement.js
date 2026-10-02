// Resolves "pending" trades once their market has closed, so risk.js's
// daily P&L/consecutive-loss checks reflect real outcomes instead of
// just trade count. A resolved market's winning outcome settles to
// price 1, the losing one to 0 (confirmed shape of Gamma's own
// outcomePrices field on any closed market).
import { GAMMA_API_BASE } from "./polymarketConfig.js";
import { fetchJson } from "./net.js";
import { loadTrades } from "./risk.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const TRADES_FILE = path.join(DATA_DIR, "trades.json");

function saveTrades(trades) {
  fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2));
}

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

export async function settlePendingTrades(log) {
  const trades = loadTrades();
  const pending = trades.filter(t => t.result === "pending");
  if (pending.length === 0) return;

  for (const trade of pending) {
    // Give Polymarket's own resolution a couple of minutes of buffer
    // past window close before checking, it isn't instant.
    if (Date.now() < new Date(trade.windowEnd).getTime() + 2 * 60 * 1000) continue;

    const res = await fetchJson(`${GAMMA_API_BASE}/markets?condition_ids=${trade.conditionId}`);
    const market = Array.isArray(res.data) ? res.data[0] : null;
    if (!market || !market.closed) continue;

    const outcomes = parseJsonArrayField(market.outcomes);
    const outcomePrices = parseJsonArrayField(market.outcomePrices);
    if (!outcomes || !outcomePrices) continue;

    const idx = outcomes.findIndex(o => o.toLowerCase() === trade.side.toLowerCase());
    if (idx === -1) continue;

    const finalPrice = Number(outcomePrices[idx]);
    const won = finalPrice >= 0.5;
    trade.result = won ? "win" : "loss";
    trade.pnlUsd = won ? (trade.shares - trade.stakeUsd) : -trade.stakeUsd;
    log(`Settled trade ${trade.conditionId} (${trade.side}): ${trade.result}, P&L $${trade.pnlUsd.toFixed(2)}`);
  }

  saveTrades(trades);
}
