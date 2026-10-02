/**
 * ONRAMPER (fiat <-> crypto), REAL INTEGRATION
 * ================================================================
 *
 * Onramper aggregates 30+ fiat onramps/offramps behind one widget
 * (buy.onramper.com). Lyra never touches a card number or bank
 * detail: the widget is a page Onramper hosts, opened in a new tab,
 * and this server's own signed link just tells it which wallet to
 * pay into (or out of) and how much. No KYC form, no payment field,
 * is ever rendered inside Lyra itself.
 *
 * SIGNING: any widget URL that carries a wallet address must be
 * signed server-side ("V2" scheme, Ed25519) with a private key from
 * the Onramper dashboard, never sent to the browser. signWidgetUrlV2
 * below is ported verbatim from Onramper's own documented example at
 * https://docs.onramper.com/docs/widget-sign-a-url-v2 (fetched and
 * cross-checked live on 27.09.2026), not reimplemented from memory.
 *
 * MODE PARAMETER: single domain, no separate "sell" domain --
 * buy.onramper.com?mode=buy|sell|buy,sell (verified live against
 * https://docs.onramper.com/docs/supported-widget-parameters, the
 * "Mode" section).
 *
 * TARGET ASSET: ETH on Ethereum, not Plasma. Onramper doesn't list
 * Plasma (too young/niche for its aggregated onramps) and there's no
 * verified per-network Onramper "Token ID" catalog for Lyra's other
 * five networks to draw from safely, so this deliberately doesn't
 * guess one. ETH on Ethereum is the one asset essentially every
 * onramp in Onramper's aggregation lists. It lands on the SAME
 * address either way (an EOA is identical across every EVM chain,
 * see HYPERLIQUID_MAINNET's own comment in config.js for the same
 * fact applied to Hyperliquid) -- Lyra's own consolidate flow
 * (scanForStrayBalances in App.jsx) already knows how to bring it
 * back to Plasma afterwards if the user asks.
 *
 * OFFRAMP GAP: Onramper's "wallet initiation" redirect flow (the
 * one that would hand this server back a deposit address + amount
 * so Lyra could build a real signed send, the same pattern as
 * consolidate) isn't in the public docs -- only that it exists and
 * needs offrampCashoutRedirectUrl, with no documented payload shape.
 * Guessing that shape risks silently sending funds to a
 * misinterpreted address, so this file deliberately does NOT attempt
 * it. The sell widget is opened without offrampCashoutRedirectUrl,
 * which makes Onramper show its own in-widget deposit address/QR
 * instead -- the user finishes that leg with Lyra's own SEND_XPL
 * ticket, same as sending to anyone else.
 */
import { createHash, createPrivateKey, randomUUID, sign } from "node:crypto";

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

// Ported 1:1 from Onramper's docs, only renamed from TS to JS (no
// type annotations, no other logic changes).
function signWidgetUrlV2({ baseUrl, privateKeyPem, fields, expiryMinutes = 15 }) {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

  // Canonical query: URLSearchParams matches server-side encoding exactly.
  const canonicalParams = new URLSearchParams(fields);
  canonicalParams.sort();
  const canonicalQuery = canonicalParams.toString();

  // 8-line canonical string.
  const contentToSign = [
    "ONRAMPER-SIG-V2",
    timestamp,
    nonce,
    "GET",
    "/",
    canonicalQuery,
    "",         // No headers for widget URLs.
    sha256(""), // Empty body hash.
  ].join("\n");

  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(contentToSign), privateKey);

  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(fields)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("sigV2", `v2:${signature.toString("base64")}`);
  url.searchParams.set("sigV2Timestamp", timestamp);
  url.searchParams.set("sigV2Nonce", nonce);
  url.searchParams.set("sigV2Expiry", expiry);
  url.searchParams.set("sigV2Fields", Object.keys(fields).sort().join(","));

  return url.toString();
}

export function isOnramperConfigured() {
  return !!(process.env.ONRAMPER_API_KEY && process.env.ONRAMPER_PRIVATE_KEY_PEM);
}

// .env stores the PEM with literal "\n" (env files can't hold real
// newlines); turn those back into real newlines before parsing it as
// a key, same convention as most "paste a PEM into one env var" setups.
function loadPrivateKeyPem() {
  return String(process.env.ONRAMPER_PRIVATE_KEY_PEM || "").replace(/\\n/g, "\n");
}

export function buildOnramperBuyUrl({ amountUSD, address }) {
  if (!isOnramperConfigured() || !address) return null;

  const fields = {
    apiKey: process.env.ONRAMPER_API_KEY,
    mode: "buy",
    wallets: `eth:${address}`,
    defaultCrypto: "ETH",
    defaultFiat: "USD",
  };
  if (amountUSD) fields.defaultAmount = String(amountUSD);

  return signWidgetUrlV2({
    baseUrl: "https://buy.onramper.com",
    privateKeyPem: loadPrivateKeyPem(),
    fields,
  });
}

export function buildOnramperSellUrl({ amountUSD, address }) {
  if (!isOnramperConfigured() || !address) return null;

  const fields = {
    apiKey: process.env.ONRAMPER_API_KEY,
    mode: "sell",
    wallets: `eth:${address}`,
    sell_defaultCrypto: "ETH",
    sell_defaultFiat: "USD",
  };
  if (amountUSD) fields.sell_defaultAmount = String(amountUSD);

  return signWidgetUrlV2({
    baseUrl: "https://buy.onramper.com",
    privateKeyPem: loadPrivateKeyPem(),
    fields,
  });
}
