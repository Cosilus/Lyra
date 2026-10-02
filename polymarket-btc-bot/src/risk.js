// All limits are re-derived from the persisted trade log on every
// check, not kept as separate in-memory counters, so a restarted bot
// can't accidentally reset its own daily caps mid-day.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const TRADES_FILE = path.join(DATA_DIR, "trades.json");

export function loadTrades() {
  if (!fs.existsSync(TRADES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TRADES_FILE, "utf8"));
  } catch {
    return [];
  }
}

export function appendTrade(trade) {
  const trades = loadTrades();
  trades.push(trade);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2));
}

function isToday(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
}

// A trade is "resolved" once its outcome (win/loss) has been filled in
// by the settlement checker; unresolved trades don't count toward P&L
// yet but do count toward the daily trade-count cap.
export function getTodayStats(trades) {
  const today = trades.filter(t => isToday(t.timestamp));
  const resolved = today.filter(t => t.result === "win" || t.result === "loss");
  const realizedPnl = resolved.reduce((sum, t) => sum + (t.pnlUsd || 0), 0);

  let consecutiveLosses = 0;
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (resolved[i].result === "loss") consecutiveLosses++;
    else break;
  }

  return {
    tradesToday: today.length,
    realizedPnl,
    consecutiveLosses,
    lastTradeAt: today.length ? today[today.length - 1].timestamp : null,
  };
}

// Returns { allowed: boolean, reason?: string }.
export function checkRiskLimits(config) {
  const trades = loadTrades();
  const stats = getTodayStats(trades);

  if (stats.tradesToday >= config.maxTradesPerDay) {
    return { allowed: false, reason: `Hit the daily trade cap (${config.maxTradesPerDay}).` };
  }
  if (stats.realizedPnl <= -config.maxDailyLossUsd) {
    return { allowed: false, reason: `Hit the daily loss limit ($${config.maxDailyLossUsd}). Realized P&L today: $${stats.realizedPnl.toFixed(2)}.` };
  }
  if (stats.realizedPnl >= config.maxDailyProfitUsd) {
    return { allowed: false, reason: `Hit the daily profit target ($${config.maxDailyProfitUsd}). Locking in gains for today.` };
  }
  if (stats.consecutiveLosses >= config.maxConsecutiveLosses) {
    const cooldownMs = config.consecutiveLossCooldownMin * 60 * 1000;
    const sinceLast = Date.now() - new Date(stats.lastTradeAt).getTime();
    if (sinceLast < cooldownMs) {
      const remainingMin = Math.ceil((cooldownMs - sinceLast) / 60000);
      return { allowed: false, reason: `${stats.consecutiveLosses} losses in a row, cooling down for ${remainingMin} more minute(s).` };
    }
  }

  return { allowed: true, stats };
}
