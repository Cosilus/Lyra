import "dotenv/config";
import { applyDevDnsOverride } from "./net.js";

applyDevDnsOverride();

const [, , command, ...rest] = process.argv;

async function main() {
  if (command === "discover") {
    const { findActiveBtc5MinMarket } = await import("./market.js");
    const market = await findActiveBtc5MinMarket();
    if (!market) {
      console.log("No active BTC 5-minute market found right now. Try again in a bit, or check src/market.js's MARKET_QUERY_CANDIDATES/filters if this never finds one.");
      return;
    }
    console.log(JSON.stringify(market, null, 2));
    return;
  }

  if (command === "report") {
    const sinceArg = rest.find(a => a.startsWith("--since="));
    const { runReport } = await import("./report.js");
    await runReport({ since: sinceArg ? sinceArg.slice("--since=".length) : null });
    return;
  }

  if (command === "run") {
    if (!process.env.PRIVATE_KEY) {
      console.error("PRIVATE_KEY is not set. Copy .env.example to .env and fill it in first.");
      process.exit(1);
    }
    const dryRun = rest.includes("--dry-run");
    const { runBot } = await import("./bot.js");
    await runBot({ dryRun });
    return;
  }

  console.log("Usage:\n  node src/index.js discover        Find and print the current BTC 5-min market\n  node src/index.js run --dry-run    Run the bot without placing real orders\n  node src/index.js run              Run the bot (LIVE_TRADING=true in .env required to actually trade)");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
