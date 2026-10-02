import { ethers } from "ethers";
import { findActiveBtc5MinMarket, findOutcome } from "./market.js";
import { getBtcPrice } from "./priceFeed.js";
import { decideEntry } from "./strategy.js";
import { checkRiskLimits, appendTrade } from "./risk.js";
import { settlePendingTrades } from "./settlement.js";
import { getOrDeriveClobCreds } from "./clobAuth.js";
import { placeMarketBuy, getOrderBook, getMarketablePriceFromBook } from "./orders.js";

const POLL_MS = 3000;

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function loadRiskConfig() {
  return {
    stakeUsd: Number(process.env.STAKE_USD || 2),
    maxDailyLossUsd: Number(process.env.MAX_DAILY_LOSS_USD || 20),
    maxDailyProfitUsd: Number(process.env.MAX_DAILY_PROFIT_USD || 40),
    maxConsecutiveLosses: Number(process.env.MAX_CONSECUTIVE_LOSSES || 4),
    consecutiveLossCooldownMin: Number(process.env.CONSECUTIVE_LOSS_COOLDOWN_MIN || 30),
    maxTradesPerDay: Number(process.env.MAX_TRADES_PER_DAY || 60),
  };
}

function loadStrategyConfig() {
  return {
    entryWindowFraction: Number(process.env.ENTRY_WINDOW_FRACTION || 0.9),
    minMoveThreshold: Number(process.env.MIN_MOVE_THRESHOLD || 0.0006),
    maxEntryPrice: Number(process.env.MAX_ENTRY_PRICE || 0.93),
    minEntryPrice: Number(process.env.MIN_ENTRY_PRICE || 0.55),
  };
}

export async function runBot({ dryRun }) {
  const liveTrading = process.env.LIVE_TRADING === "true" && !dryRun;
  log(liveTrading ? "LIVE TRADING ENABLED. Real orders will be placed." : "Dry-run mode: no real orders will be placed.");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const address = await wallet.getAddress();
  log(`Wallet: ${address}`);

  let creds = null;
  if (liveTrading) {
    creds = await getOrDeriveClobCreds(wallet);
    log("Authenticated with Polymarket CLOB.");
  }

  const riskConfig = loadRiskConfig();
  const strategyConfig = loadStrategyConfig();

  let currentWindow = null; // { conditionId, openPrice, upToken, downToken, negRisk, start, end, tradedThisWindow }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await settlePendingTrades(log);

      const market = await findActiveBtc5MinMarket();
      if (!market) {
        log("No active BTC 5-minute market found right now.");
        await sleep(POLL_MS);
        continue;
      }

      const upOutcome = findOutcome(market, "Up");
      const downOutcome = findOutcome(market, "Down");
      if (!upOutcome || !downOutcome) {
        log(`Market found (${market.question}) but couldn't identify Up/Down outcomes. Skipping.`);
        await sleep(POLL_MS);
        continue;
      }

      const start = new Date(market.startDate).getTime();
      const end = new Date(market.endDate).getTime();

      if (!currentWindow || currentWindow.conditionId !== market.conditionId) {
        const openPrice = await getBtcPrice();
        currentWindow = {
          conditionId: market.conditionId,
          openPrice,
          start,
          end,
          tradedThisWindow: false,
        };
        log(`New window: ${market.question} | open BTC price $${openPrice.toFixed(2)} | closes ${new Date(end).toISOString()}`);
      }

      if (currentWindow.tradedThisWindow) {
        await sleep(POLL_MS);
        continue;
      }

      const risk = checkRiskLimits(riskConfig);
      if (!risk.allowed) {
        log(`Risk limit hit: ${risk.reason}`);
        await sleep(POLL_MS);
        continue;
      }

      const currentPrice = await getBtcPrice();
      const decision = decideEntry({
        now: Date.now(),
        windowStart: currentWindow.start,
        windowEnd: currentWindow.end,
        openPrice: currentWindow.openPrice,
        currentPrice,
        upOutcomePrice: upOutcome.price,
        downOutcomePrice: downOutcome.price,
        ...strategyConfig,
      });

      if (!decision) {
        await sleep(POLL_MS);
        continue;
      }

      const outcome = decision.side === "Up" ? upOutcome : downOutcome;
      log(`Signal: ${decision.side} (BTC moved ${decision.movePct.toFixed(3)}% from open), entry price ${decision.entryPrice}`);

      currentWindow.tradedThisWindow = true; // claim this window regardless of outcome, never double-bet it

      if (!liveTrading) {
        // Real executable price from the live book, same call a live FOK
        // order uses. null = book too thin to fill the full stake.
        let fillPrice = null;
        try {
          const book = await getOrderBook(outcome.tokenId);
          fillPrice = getMarketablePriceFromBook(book, riskConfig.stakeUsd);
        } catch (err) {
          log(`[DRY RUN] Book check failed: ${err.message}`);
        }
        log(`[DRY RUN] Would BUY "${decision.side}" for $${riskConfig.stakeUsd} | gamma price ${decision.entryPrice} | real fill price ${fillPrice ?? "NOT FILLABLE"}`);
        appendTrade({
          timestamp: new Date().toISOString(),
          conditionId: market.conditionId,
          side: decision.side,
          entryPrice: decision.entryPrice,
          fillPrice,
          stakeUsd: riskConfig.stakeUsd,
          shares: riskConfig.stakeUsd / (fillPrice ?? decision.entryPrice),
          windowEnd: new Date(currentWindow.end).toISOString(),
          result: "dry-run",
          pnlUsd: 0,
        });
        await sleep(POLL_MS);
        continue;
      }

      try {
        const { result, price, stakeUsd } = await placeMarketBuy({
          wallet,
          creds,
          tokenId: outcome.tokenId,
          negRisk: market.negRisk,
          stakeUsd: riskConfig.stakeUsd,
        });
        log(`Order placed: ${JSON.stringify(result)}`);
        appendTrade({
          timestamp: new Date().toISOString(),
          conditionId: market.conditionId,
          side: decision.side,
          entryPrice: price,
          stakeUsd,
          shares: stakeUsd / price,
          windowEnd: new Date(currentWindow.end).toISOString(),
          result: "pending",
          pnlUsd: null,
        });
      } catch (err) {
        log(`Order failed: ${err.message}`);
      }
    } catch (err) {
      log(`Loop error: ${err.message}`);
    }

    await sleep(POLL_MS);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
