// Lightweight BTC/USD spot price poller. Binance's public REST ticker
// needs no auth/key and is fast/liquid enough to serve as a reference
// for "did BTC actually move" during a Polymarket 5-minute window.
// Binance blocks some regions (HTTP 451). Falls back to Coinbase's
// public spot price endpoint in that case.
import { fetchJson } from "./net.js";

const BINANCE_TICKER_URL = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";
const COINBASE_TICKER_URL = "https://api.coinbase.com/v2/prices/BTC-USD/spot";

export async function getBtcPrice() {
  const binance = await fetchJson(BINANCE_TICKER_URL);
  if (binance.ok && binance.data?.price) return Number(binance.data.price);

  const coinbase = await fetchJson(COINBASE_TICKER_URL);
  if (coinbase.ok && coinbase.data?.data?.amount) return Number(coinbase.data.data.amount);

  throw new Error(`Couldn't fetch BTC price from Binance (HTTP ${binance.status}) or Coinbase (HTTP ${coinbase.status}).`);
}
