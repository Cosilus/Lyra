import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ethers } from "ethers";
import { gsap } from "gsap";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Play, MousePointer2, WalletCards, UserRound, Pencil, Plus, X, History, PieChart, LineChart, Coins, Settings, KeyRound, Trash2, Eye, EyeOff, Fingerprint, Lock, ArrowRight, RotateCcw, Info, Link, Search, Download, Upload, List, ShieldCheck, Users } from "lucide-react";
import { API_BASE_URL, NETWORKS, DEFAULT_NETWORK, getNetworkByKey, TOKENS_BY_NETWORK, getActiveTokens, ERC20_ABI, WNATIVE_BY_NETWORK, WETH9_ABI, getDefiContracts, LIFI_QUOTE_API_URL, UNISWAP_V3_FEE_TIERS, UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_ROUTER_ABI, UNISWAP_V3_QUOTER_ABI, AAVE_POOL_ABI, AAVE_DATA_PROVIDER_ABI, DEFAULT_SLIPPAGE, explorerTx, KYBERSWAP_API_BASE, NATIVE_PSEUDO_ADDRESS, KYBERSWAP_CLIENT_ID, POLYMARKET_ORDER_DOMAIN_NAME, POLYMARKET_ORDER_DOMAIN_VERSION, POLYMARKET_ORDER_TYPES, POLYMARKET_ORDER_SIDE_BUY, POLYMARKET_ORDER_SIDE_SELL, POLYMARKET_BYTES32_ZERO, POLYMARKET_SIGNATURE_TYPE_EOA, POLYMARKET_SIGNATURE_TYPE_GNOSIS_SAFE, POLYMARKET_SIGNATURE_TYPE_POLY_1271, POLYMARKET_DEPOSIT_WALLET_DOMAIN_NAME, POLYMARKET_DEPOSIT_WALLET_DOMAIN_VERSION, POLYMARKET_PUSD_COLLATERAL, AAVE_V4_SPOKE_ABI } from "./config";
import QRCode from "qrcode";
import { isWebAuthnAvailable, registerBiometric, getBiometricAesKey, confirmBiometricPresence, encryptWithKey, decryptWithKey } from "./Biometric";
import { splitPrivateKey, combineFragments, registerMpcWallet, getMpcStatus, setMpcDailyLimit, releaseFragment2, recoverFragment2 } from "./mpc";
import { selectPaymentRequirement, signX402Payment, encodePaymentHeader, decodePaymentResponseHeader, decodePaymentRequiredHeader, findEip3009SettlementTx, selectGatewayOptions, signGatewayPayment, fetchGatewayBalances, GATEWAY_NETWORKS, GATEWAY_WALLET_MAINNET, GATEWAY_WALLET_ABI } from "./x402";
import { logAuditEvent, loadAuditLog, loadAuditLogByCategory, clearAuditLog } from "./auditLog";
import { DEMO_A2A_AGENT_URL, sendA2ATask, fetchAgentCard } from "./a2a";
import { createCheckoutSession, completeCheckoutSession } from "./acp";
import { SAFE_SUPPORTED_NETWORK_KEYS, isSafeSupportedNetwork, deploySafe, getSafeBalance, getSafeInfo, getNextNonce, proposeTransfer, proposeAddOwner, fetchPendingTransactions, confirmTransfer } from "./multisig";
// Arc has no Uniswap/LI.FI deployment yet (it's brand new), so its
// swap and bridge are Circle's own App Kit SDKs instead: SwapKit
// (single-chain USDC<->EURC conversion) and BridgeKit (CCTP, the same
// burn-and-mint mechanism USDC bridges already use everywhere else,
// just orchestrated by Circle's own SDK rather than LI.FI). Both take
// a raw private key the same way `new ethers.Wallet(unlockedPrivateKey)`
// already does elsewhere in this file, never sent anywhere, used only
// to sign locally in the browser.
import { SwapKit } from "@circle-fin/swap-kit";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createEthersAdapterFromPrivateKey } from "@circle-fin/adapter-ethers-v6";

const ARC_SWAP_TOKENS = ["USDC", "EURC"];
// Circle's own chain-key strings for its App Kit SDKs, distinct from
// Lyra's own network.key and from LI.FI's NETWORK_KEY_TO_LIFI_KEY,
// confirmed straight from @circle-fin/swap-kit's bundled chain
// definitions (Arc: chainId 5042, usdcAddress 0x3600...0000, matching
// everything else already verified for Arc elsewhere in this file).
const NETWORK_KEY_TO_CIRCLE_CHAIN = { arc: "Arc", ethereum: "Ethereum", base: "Base", polygon: "Polygon", plasma: "Plasma" };

// Circle's kits submit and broadcast the transaction themselves and
// only hand back its hash, but every caller of executeSwapTicket/
// executeBridgeTicket expects a real ethers TransactionResponse (they
// call tx.wait() again themselves). Re-fetch it from the same
// provider so it comes back as one. A pooled RPC node can briefly not
// know about a transaction its own sibling node just accepted, same
// class of lag ensureAllowance already retries around, so retry here
// too instead of failing on the very first read.
async function fetchBroadcastTx(provider, hash) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const tx = await provider.getTransaction(hash);
    if (tx) return tx;
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  throw new Error("Transaction was sent but hasn't propagated yet, check the explorer in a moment.");
}

import { CircleMenu } from "./CircleMenu";

// Turns the reason a seller (or Circle Gateway) gives when it refuses a
// payment into a sentence a beginner can act on. Best effort: null when
// there is nothing useful in the body.
function describeSellerRejection(body) {
  const reason = String(body?.details || body?.reason || body?.error || "").trim();
  if (!reason) return null;
  if (/insufficient/i.test(reason)) {
    return "Circle Gateway says your Nanopayments balance is too low for this payment. Deposit USDC into it first (Arc credits in about a second, Base and Ethereum can take about 15 minutes).";
  }
  return `The service refused the payment: ${reason.replace(/_/g, " ")}.`;
}

// Plain-language explanation of what an x402 payment bought, from the
// backend (/api/x402/explain). Best effort with a hard timeout: returns
// null on any problem and the caller shows the raw data instead.
async function explainPurchasedContent({ url, description, amountText, body }) {
  if (body == null || body === "") return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${API_BASE_URL}/api/x402/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, description, amountText, body }),
      signal: controller.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.summary === "string" && data.summary.trim() ? data.summary.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// What an x402 payment actually bought: the resource's own response,
// shown in the chat (plain text, no Markdown) so the user sees what they
// paid for. Capped so a huge payload can't flood the conversation.
function formatPurchasedContent(body) {
  if (body == null || body === "") return "";
  const MAX = 900;
  let text;
  if (typeof body === "string") {
    text = body.trim();
  } else {
    try { text = JSON.stringify(body, null, 2); } catch { return ""; }
  }
  if (!text) return "";
  if (text.length > MAX) text = text.slice(0, MAX).trimEnd() + "\n… (truncated)";
  return "\n\nRaw response from the service (couldn't summarize it):\n" + text;
}

function shortAddress(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

// Display only (the ticket still sends the exact amount): at most 3
// decimals, and never a misleading "0" for a tiny non-zero amount.
function formatTicketAmount(amount) {
  const n = Number(amount);
  if (!amount || !Number.isFinite(n) || n === 0) return "0";
  if (n > 0 && n < 0.001) return "<0.001";
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

const AUTO_LOCK_OPTIONS = [
  { value: 1, label: "1 minute" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 0, label: "Never" }
];

// Traveling border light (replaces the old conic-gradient border-beam-spin):
// measures the element and exposes its exact pixel outline as a CSS custom
// property so a small glow can ride that path via offset-path/offset-distance.
function useBorderPath() {
  const roRef = useRef(null);

  // A callback ref, not a plain ref + useEffect(..., []): the element
  // this attaches to (e.g. the chat's empty-state card) mounts and
  // unmounts every time a ticket opens and closes over it, but a plain
  // ref's effect only ever runs once, tied to this HOOK's own caller
  // (the whole App component), not to each remount of that element. On
  // any later remount the effect never reruns and the ResizeObserver
  // from the first mount is watching a node that no longer exists, so
  // the border light silently stops animating from then on.
  return useCallback((el) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (!el) return;

    function update() {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      el.style.setProperty("--path", `path('M 0 0 H ${w} V ${h} H 0 V 0')`);
    }

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    roRef.current = ro;
  }, []);
}

// Split version of the border path above: instead of one loop starting at
// the top-left corner, this exposes two mirrored halves that both start at
// the top-middle point and race down to the bottom-middle point, one via
// the left edge, one via the right, so two lights can travel outward from
// the middle and meet again at the bottom, like the original hold-to-confirm
// -> ticket reveal.
function useSplitBorderPath() {
  const roRef = useRef(null);

  // Same callback-ref fix as useBorderPath above, and for the same
  // reason: this attaches to elements that mount/unmount repeatedly
  // (ticket reveals), which a one-time effect can't track.
  return useCallback((el) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (!el) return;

    function update() {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const midX = w / 2;
      el.style.setProperty("--path-left", `path('M ${midX} 0 H 0 V ${h} H ${midX}')`);
      el.style.setProperty("--path-right", `path('M ${midX} 0 H ${w} V ${h} H ${midX}')`);
    }

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    roRef.current = ro;
  }, []);
}

// KyberSwap deploys its MetaAggregationRouterV2 at this same address on
// every chain it supports (CREATE2, identical bytecode/salt everywhere).
// This is the contract executeSwapTicket actually sends to, via
// buildData.data.routerAddress, not the Uniswap router kept in config.js
// as a fallback. Without matching this, swap transactions never get
// recognized and the Swap tab stays empty even after a real swap.
const KYBERSWAP_ROUTER_V2 = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5".toLowerCase();

// Buckets a raw explorer transaction into one of the tx-history tabs by
// matching its `to` address against known DeFi contracts (KyberSwap's
// aggregator router = swap, this network's Aave pool = stake/unstake,
// LI.FI diamond = bridge). Anything that isn't a call into one of those
// is a plain transfer, so it falls into "send" (which covers receives too).
function classifyTx(tx, defi) {
  const to = (tx.to || "").toLowerCase();
  if (!to) return "send";
  if (to === KYBERSWAP_ROUTER_V2) return "swap";
  if (defi.aave?.pool && to === defi.aave.pool.toLowerCase()) return "stake";
  if (defi.lifi?.diamond && to === defi.lifi.diamond.toLowerCase()) return "bridge";
  return "send";
}

// The explorer backend returns up to three separate records per on-chain
// action sharing the same hash: the "native" record is the actual call
// (e.g. to KyberSwap's router or Aave's pool) and almost always carries
// valueXPL: 0, since the real amount moves as an ERC-20 transfer ("token")
// or a value returned by the contract ("internal"), rendering the native
// leg alone for a swap/stake/bridge produces a meaningless "0 XPL sent to
// 0x6131…" row. This groups the legs by hash, classifies each group from
// its native leg (the one that actually reflects which contract was
// called), and picks whichever leg carries the real, human-relevant
// amount to display.
function buildTxRows(list, walletAddress, defi) {
  const addr = (walletAddress || "").toLowerCase();

  const byHash = new Map();
  for (const tx of list) {
    if (!byHash.has(tx.hash)) byHash.set(tx.hash, []);
    byHash.get(tx.hash).push(tx);
  }

  return Array.from(byHash.values()).map(legs => {
    const native = legs.find(t => t.type === "native");
    const category = classifyTx(native || legs[0], defi);

    const outgoingToken = legs.find(t => t.type === "token" && t.from.toLowerCase() === addr);
    const incomingToken = legs.find(t => t.type === "token" && t.to.toLowerCase() === addr);
    const internalLeg = legs.find(t => t.type === "internal");

    const display = outgoingToken || incomingToken || internalLeg || native || legs[0];
    const isSent = display.from.toLowerCase() === addr;

    return {
      hash: legs[0].hash,
      timestamp: legs[0].timestamp,
      category,
      display,
      isSent,
      counterparty: isSent ? display.to : display.from
    };
  }).sort((a, b) => b.timestamp - a.timestamp);
}

function fmtXpl(value, maxDecimals = 6) {
  const number = Number(ethers.formatEther(value || 0n));

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals
  });
}

async function generateAddressQRCode(address, size = 120) {
  const output = await QRCode.toDataURL(address, {
    width: size,
    margin: 0,
    color: { dark: "#150E20", light: "#F3E7D0" } // --void on --beige, consistent with the palette
  });
  return { data: address, size, output };
}

// LI.FI's own short chain keys (e.g. "bas" for Base, "eth" for
// Ethereum) are what the API needs, but they're not something a user
// should ever see. This is display-only, never used for the actual
// LI.FI request.
const LIFI_CHAIN_DISPLAY_NAMES = {
  pla: "Plasma",
  eth: "Ethereum",
  bas: "Base",
  arb: "Arbitrum",
  opt: "Optimism",
  pol: "Polygon",
  bsc: "BNB Chain",
  avax: "Avalanche",
  ftm: "Fantom",
  gno: "Gnosis",
  era: "zkSync Era",
  lna: "Linea",
  sca: "Scroll",
};
function lifiChainDisplayName(key) {
  if (!key) return null;
  return LIFI_CHAIN_DISPLAY_NAMES[key.toLowerCase()] || key;
}

// Lyra's own network.key (used throughout the rest of the app, e.g.
// SWITCH_NETWORK's "network" field) to LI.FI's own short chain key
// (used by the bridge quote API's fromChain/toChain params). Only
// needs entries for the four networks Lyra itself supports.
const NETWORK_KEY_TO_LIFI_KEY = { plasma: "pla", ethereum: "eth", base: "bas", polygon: "pol" };

function stepSummaryLine(step) {
  const amt = `${step.amountIsEstimate ? "≈ " : ""}${step.amount ?? "…"} ${step.asset || ""}`.trim();

  switch (step.kind) {
    case "send":
      return `Send ${amt}${step.recipient ? ` to ${step.contactName || shortAddress(step.recipient)}` : ""}`;
    case "swap":
      return `Swap ${amt} → ${step.ticket?.estimatedReceive || `… ${step.tokenOutSymbol || ""}`}`;
    case "stake":
      return `Stake ${amt} on ${step.ticket?.platform || "…"}`;
    case "unstake":
      return `Withdraw ${amt} from ${step.ticket?.platform || "…"}`;
    case "bridge":
      return `Bridge ${amt} to ${lifiChainDisplayName(step.destinationChainKey) || "…"}`;
    default:
      return amt;
  }
}

// Past-tense counterpart to stepSummaryLine, used for the final multi-step
// recap once every step has actually run, "Swap 1 XPL → …" (a plan, not
// yet true) becomes "Swapped 1 XPL for 0.083 USDT0" (what happened).
function completedSummaryLine(step) {
  if (!step) return "";
  const amt = `${step.amount ?? ""} ${step.asset || ""}`.trim();

  switch (step.kind) {
    case "send":
      return `Sent ${amt}${step.recipient ? ` to ${step.contactName || shortAddress(step.recipient)}` : ""}`;
    case "swap":
      return `Swapped ${amt}${step.ticket?.estimatedReceive ? ` for ${step.ticket.estimatedReceive}` : ""}`;
    case "stake":
      return `Staked ${amt}${step.ticket?.platform ? ` on ${step.ticket.platform}` : ""}`;
    case "unstake":
      return `Withdrew ${amt}${step.ticket?.platform ? ` from ${step.ticket.platform}` : ""}`;
    case "bridge":
      return `Bridged ${amt}${step.destinationChainKey ? ` to ${lifiChainDisplayName(step.destinationChainKey)}` : ""}`;
    case "prediction": {
      const cents = step.price != null ? `${Math.round(Number(step.price) * 100)}¢` : null;
      return `Bet placed: ${step.outcome || "?"}${cents ? ` at ${cents}` : ""}${step.marketQuestion ? `. ${step.marketQuestion}` : ""}`;
    }
    case "cashout-prediction": {
      const proceeds = step.price != null && step.size != null
        ? `$${(Number(step.price) * Number(step.size)).toFixed(2)}`
        : null;
      return `${proceeds || "Position"} cashed out${step.marketQuestion ? `. ${step.marketQuestion}` : ""}`;
    }
    case "cancel-prediction":
      return `Order cancelled${step.marketQuestion ? `. ${step.marketQuestion}` : ""}`;
    case "receive-fiat":
      return `$${step.amountUSD ?? "?"} received → ${step.amountUSD ?? "?"} USDC.e`;
    case "consolidate":
      return `${step.amountDisplay ?? "?"} ${step.symbol ?? "?"} consolidated from ${step.networkName ?? "?"} into ${step.toSymbol ?? "your active network"}`;
    case "gateway-deposit":
      return `Deposited ${step.amount ?? "?"} USDC into Nanopayments`;
    case "x402":
      return `Paid ${step.amount ?? "?"} ${step.symbol ?? ""} to unlock ${step.url ?? "a resource"}`.trim();
    case "acp":
      return `Checked out ${(step.lineItems || []).map(li => `${li.quantity}× ${li.name}`).join(", ") || "your cart"} for $${step.amountUSD ?? "?"}`;
    default:
      return amt;
  }
}

function loadSavedWallet() {
  try {
    return JSON.parse(
      localStorage.getItem("plasma_wallet_v2") || "null"
    );
  } catch {
    return null;
  }
}

function loadBiometricRecord() {
  try { return JSON.parse(localStorage.getItem("plasma_biometric_v1") || "null"); }
  catch { return null; }
}
function saveBiometricRecord(record) {
  localStorage.setItem("plasma_biometric_v1", JSON.stringify(record));
}
function clearBiometricRecord() {
  localStorage.removeItem("plasma_biometric_v1");
}

// Owner cap for a multisig, including the wallet's own address. Kept
// small on purpose: this is a setup flow for a small trusted group
// (a few co-founders, a couple, a small team treasury), not an
// org-wide access list, five keeps the "N of M" picker itself simple
// too (a single row of number buttons).
const MULTISIG_MAX_OWNERS = 5;

// Every Safe this browser knows about (deployed from here, or added
// later by address). Only local bookkeeping, same as contacts: the
// Safe itself and who its owners/threshold are live on-chain, this is
// just what lets Lyra list them without asking the user to paste the
// address back in every time.
function loadMultisigSafes() {
  try {
    return JSON.parse(
      localStorage.getItem("plasma_multisig_safes_v1") || "[]"
    );
  } catch {
    return [];
  }
}

function saveMultisigSafes(safes) {
  localStorage.setItem(
    "plasma_multisig_safes_v1",
    JSON.stringify(safes)
  );
}

function loadContacts() {
  try {
    return JSON.parse(
      localStorage.getItem("plasma_contacts_v1") || "[]"
    );
  } catch {
    return [];
  }
}

function saveContacts(contacts) {
  localStorage.setItem(
    "plasma_contacts_v1",
    JSON.stringify(contacts)
  );
}

// Contacts live only in this browser's localStorage, no server sync,
// no backup. Export/import is the only way to move them across a
// cleared cache, a different browser, or a different device.
function importContactsData(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of contacts.");
  }

  const existing = loadContacts();
  const existingAddresses = new Set(existing.map(c => c.address.toLowerCase()));
  const seenInFile = new Set();
  let added = 0;
  let skipped = 0;

  for (const entry of parsed) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    const address = typeof entry?.address === "string" ? entry.address.trim() : "";

    if (!name || !ethers.isAddress(address)) { skipped++; continue; }

    const key = address.toLowerCase();
    if (existingAddresses.has(key) || seenInFile.has(key)) { skipped++; continue; }

    seenInFile.add(key);
    existing.push({ name, address });
    added++;
  }

  saveContacts(existing);
  return { contacts: existing, added, skipped };
}

const PORTFOLIO_HISTORY_KEY = "plasma_portfolio_history_v1";
const MAX_HISTORY_POINTS = 2000;

function loadPortfolioHistory() {
  try {
    return JSON.parse(
      localStorage.getItem(PORTFOLIO_HISTORY_KEY) || "[]"
    );
  } catch {
    return [];
  }
}

function recordPortfolioSnapshot(xplBalanceWei, defiValueXpl = 0, networkKey) {
  try {
    const history = loadPortfolioHistory();
    const now = Date.now();
    const last = history[history.length - 1];
    const balanceStr = xplBalanceWei.toString();

    if (
      last &&
      last.balance === balanceStr &&
      last.defi === defiValueXpl &&
      last.network === networkKey &&
      now - last.t < 5 * 60 * 1000
    ) {
      return history;
    }

    const next = [
      ...history,
      { t: now, balance: balanceStr, defi: defiValueXpl, network: networkKey, priced: true }
    ].slice(-MAX_HISTORY_POINTS);

    localStorage.setItem(PORTFOLIO_HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadPortfolioHistory();
  }
}

const PORTFOLIO_RANGES = [
  { key: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "1S", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "1m", label: "1M", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "6m", label: "6M", ms: 182 * 24 * 60 * 60 * 1000 },
  { key: "1y", label: "1A", ms: 365 * 24 * 60 * 60 * 1000 },
  { key: "ytd", label: "YTD", ms: null }
];

function filterHistoryByRange(history, rangeKey) {
  if (!history.length) return [];

  const now = Date.now();
  const range = PORTFOLIO_RANGES.find(r => r.key === rangeKey);

  let since;
  if (rangeKey === "ytd") {
    since = new Date(new Date().getFullYear(), 0, 1).getTime();
  } else {
    since = now - (range?.ms || 0);
  }

  const filtered = history.filter(p => p.t >= since);

  if (filtered.length < 2) {
    const before = history.filter(p => p.t < since);
    const anchor = before[before.length - 1];
    return anchor ? [anchor, ...filtered] : filtered;
  }

  return filtered;
}

// Old points saved before multi-network support was added don't have
// a "network" field. We attach them to DEFAULT_NETWORK so they don't
// silently disappear from the Plasma history.
function filterHistoryByNetwork(history, networkKey) {
  const onNetwork = history.filter(p => (p.network || DEFAULT_NETWORK.key) === networkKey);
  // Older snapshots were recorded before the XPL price had loaded, so
  // their stablecoins counted as 0 (defi: 0). The first priced point
  // after them then looked like a huge gain (+1236% on 8 USDT0, seen
  // live). New snapshots carry `priced`; an unpriced 0 that a later
  // point contradicts is that artifact, not real history.
  const lastNonZeroDefi = onNetwork.reduce((at, p, i) => (p.defi > 0 ? i : at), -1);
  return onNetwork.filter((p, i) => p.priced || p.defi > 0 || i > lastNonZeroDefi);
}

async function deriveKey(password, salt) {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 310000,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function uint8ToBase64(bytes) {
  let binary = "";
  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });

  return btoa(binary);
}

function base64ToUint8(base64) {
  const binary = atob(base64);

  return Uint8Array.from(
    binary,
    char => char.charCodeAt(0)
  );
}

async function encryptPrivateKey(privateKey, password) {
  const encoder = new TextEncoder();

  const salt = crypto.getRandomValues(
    new Uint8Array(16)
  );

  const iv = crypto.getRandomValues(
    new Uint8Array(12)
  );

  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    encoder.encode(privateKey)
  );

  return {
    salt: uint8ToBase64(salt),
    iv: uint8ToBase64(iv),
    ciphertext: uint8ToBase64(
      new Uint8Array(encrypted)
    )
  };
}

async function decryptPrivateKey(encryptedWallet, password) {
  const decoder = new TextDecoder();

  const salt = base64ToUint8(
    encryptedWallet.salt
  );

  const iv = base64ToUint8(
    encryptedWallet.iv
  );

  const ciphertext = base64ToUint8(
    encryptedWallet.ciphertext
  );

  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    ciphertext
  );

  return decoder.decode(decrypted);
}

// Turns whatever decryptPrivateKey() just handed back into the actual
// signing key. For a non-MPC wallet, `localSecret` already *is* the
// full private key (unchanged behavior). For an MPC wallet,
// `localSecret` is only fragment1 -- fragment2 has to come from the
// backend (spending-limit + biometric gated there) before the two can
// be XORed back into a usable key, entirely in memory, here.
async function reconstructPrivateKey(localSecret, address, mpcRecord, opts = {}) {
  if (!mpcRecord) return localSecret;
  const fragment2 = await releaseFragment2(address, opts);
  return combineFragments(localSecret, fragment2);
}

function findContact(name) {
  const contacts = loadContacts();

  return contacts.find(
    contact =>
      contact.name.toLowerCase() === name.trim().toLowerCase()
  );
}

function addContact(name, address) {
  const contacts = loadContacts();

  const existingIndex = contacts.findIndex(
    contact =>
      contact.name.toLowerCase() === name.trim().toLowerCase()
  );

  const contact = {
    name: name.trim(),
    address
  };

  if (existingIndex >= 0) {
    contacts[existingIndex] = contact;
  } else {
    contacts.push(contact);
  }

  saveContacts(contacts);
}

// Renders the staircase fill used by the Hold-to-Confirm button: a grid
// of solid squares, each with its Manhattan distance from the centre
// cell, so a diamond wave grows out of the middle with perfect steps
// (same look as the website's intro transition and its hold button).
// Driven imperatively via drawRef (a plain ref the parent's
// requestAnimationFrame loop calls directly with a 0-100 progress
// value) instead of a `progress` prop, so a hold gesture never runs
// through React state/re-render at all, see handleHoldStart. Passing
// progress as normal render-driven state was forcing the entire
// (huge) App component to re-render on every tick of the hold,
// which is what made the animation look janky instead of fluid.
// Calling draw(0) after a hold shrinks the squares back instead of
// wiping them instantly.
function HoldSquares({ drawRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const btn = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    const ROWS = 5;        // odd, so a row of squares sits on the centre line
    const SPAN = 3.2;      // width of the soft edge, in squares
    const RETRACT_MS = 420;
    let shown = 0;
    let retractRaf = 0;

    function paint(progress) {
      const rect = btn.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = rect.width || 260;
      const h = rect.height || 50;

      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (progress <= 0) {
        btn.classList.remove("dots-cover");
        return;
      }

      const cell = h / ROWS;
      const halfRows = (ROWS - 1) / 2;
      const halfCols = Math.ceil(w / 2 / cell);
      const R = (progress / 100) * (halfRows + halfCols + SPAN);

      // Flip the label to white once the wave has grown past its ends.
      const label = btn.querySelector(".hold-content");
      let textW = 0;
      if (label) {
        const range = document.createRange();
        range.selectNodeContents(label);
        textW = range.getBoundingClientRect().width;
      }
      btn.classList.toggle("dots-cover", R - textW / 2 / cell - halfRows > SPAN * 0.7);

      ctx.fillStyle = "#6D4FD1"; // --accent-deep, same as on the website
      for (let j = -halfRows; j <= halfRows; j++) {
        for (let i = -halfCols; i <= halfCols; i++) {
          let t = (R - (Math.abs(i) + Math.abs(j))) / SPAN;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          if (t <= 0.01) continue;
          t = t * t * (3 - 2 * t);
          const side = t >= 1 ? cell + 0.75 : cell * (0.3 + 0.7 * t);
          ctx.globalAlpha = t >= 1 ? 1 : 0.25 + 0.75 * t;
          ctx.fillRect(w / 2 + i * cell - side / 2, h / 2 + j * cell - side / 2, side, side);
        }
      }
      ctx.globalAlpha = 1;
    }

    function draw(progress) {
      if (progress > 0) {
        cancelAnimationFrame(retractRaf);
        retractRaf = 0;
        shown = progress;
        paint(progress);
        return;
      }
      if (retractRaf) return; // already shrinking back
      if (shown <= 0) {
        paint(0);
        return;
      }
      const from = shown;
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min((now - t0) / (RETRACT_MS * Math.max(0.35, from / 100)), 1);
        shown = from * (1 - k * k);
        paint(shown);
        if (k >= 1) {
          shown = 0;
          paint(0);
          retractRaf = 0;
          return;
        }
        retractRaf = requestAnimationFrame(step);
      };
      retractRaf = requestAnimationFrame(step);
    }

    draw(0);
    drawRef.current = draw;
    return () => {
      cancelAnimationFrame(retractRaf);
      if (drawRef.current === draw) drawRef.current = null;
    };
  }, [drawRef]);

  return <canvas ref={canvasRef} className="hold-squares" />;
}

export default function App() {
  const [activeNetworkKey, setActiveNetworkKey] = useState(() => localStorage.getItem("plasma_active_network_v1") || DEFAULT_NETWORK.key);
  const activeNetwork = useMemo(() => getNetworkByKey(activeNetworkKey), [activeNetworkKey]);
  const tokens = useMemo(() => TOKENS_BY_NETWORK[activeNetworkKey] || {}, [activeNetworkKey]);
  const defi = useMemo(() => getDefiContracts(activeNetworkKey), [activeNetworkKey]);
  const nativeWrapped = useMemo(() => WNATIVE_BY_NETWORK[activeNetworkKey], [activeNetworkKey]);

  // Advanced, chat-only settings: not exposed in the Settings UI on purpose
  // (nonces/custom RPCs are power-user footguns), only reachable by asking
  // Lyra directly. See ADVANCED SETTINGS in the system prompt.
  const [customRpcUrls, setCustomRpcUrls] = useState(() => {
    try { return JSON.parse(localStorage.getItem("plasma_custom_rpc_v1") || "{}"); }
    catch { return {}; }
  });
  const [pendingNonceOverride, setPendingNonceOverride] = useState(null);

  function setCustomRpc(networkKey, rpcUrl) {
    const next = { ...customRpcUrls, [networkKey]: rpcUrl };
    setCustomRpcUrls(next);
    localStorage.setItem("plasma_custom_rpc_v1", JSON.stringify(next));
  }

  function resetCustomRpc(networkKey) {
    const next = { ...customRpcUrls };
    delete next[networkKey];
    setCustomRpcUrls(next);
    localStorage.setItem("plasma_custom_rpc_v1", JSON.stringify(next));
  }

  function withNonceOverride(txRequest) {
    if (pendingNonceOverride === null || pendingNonceOverride === undefined) return txRequest;
    const nonce = pendingNonceOverride;
    setPendingNonceOverride(null);
    return { ...txRequest, nonce };
  }

  const effectiveRpcUrl = customRpcUrls[activeNetworkKey] || activeNetwork.rpcUrl;
  const RPC = useMemo(() => new ethers.JsonRpcProvider(effectiveRpcUrl, activeNetwork.chainId), [effectiveRpcUrl, activeNetwork.chainId]);
  const [wallet, setWallet] = useState(null);
  const [unlockedPrivateKey, setUnlockedPrivateKey] = useState(null);
  const [locked, setLocked] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [showUnlockPasswordText, setShowUnlockPasswordText] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [balance, setBalance] = useState(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);

  // One-time onboarding message: the very first time this wallet is
  // unlocked on this device, Lyra introduces herself in the chat
  // itself instead of any extra UI (buttons, tooltips, modals). Never
  // shown again afterward, tracked by a plain localStorage flag.
  useEffect(() => {
    if (!wallet?.address || locked) return;
    if (localStorage.getItem("plasma_onboarding_seen_v1")) return;

    localStorage.setItem("plasma_onboarding_seen_v1", "1");
    setMessages(m => [...m, {
      role: "ai",
      variant: "onboarding",
      text: "Hi, I'm Lyra. Just tell me what you want to do, and I'll take care of it."
    }]);
  }, [wallet?.address, locked]);

  const [showWallet, setShowWallet] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  // Empty/unset means the active network's native coin (SEND_XPL's
  // legacy default). A real value here (e.g. "USDT0", "USDCE") means
  // an ERC-20 token instead, this whole flow used to assume native
  // only regardless of what the AI actually resolved the asset to.
  const [sendAsset, setSendAsset] = useState("");
  // Resolved token config when sendAsset names a real ERC-20 on this
  // network, null for the native coin (empty sendAsset, or sendAsset
  // literally equal to the native symbol).
  const sendToken = sendAsset && sendAsset !== activeNetwork.nativeSymbol ? tokens[sendAsset] : null;
  const sendAssetSymbol = sendAsset || activeNetwork.nativeSymbol;
  const isTokenSend = !!sendToken?.address;
  // True for a "send max/all/everything" request (SEND_XPL with
  // action.amount === "MAX"). sendAmount still holds a real, displayable
  // number for the ticket UI, but it's only an estimate taken when the
  // ticket was built. signAndSend recomputes the actual amount live,
  // right before signing, whenever this is set, instead of trusting
  // that possibly-stale number, so a balance/gas-price move between
  // reviewing the ticket and confirming it can never turn into an
  // "insufficient funds for gas" failure.
  const [sendIsMax, setSendIsMax] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [sendAmountUSD, setSendAmountUSD] = useState("");
  const [sendPriceUSD, setSendPriceUSD] = useState(null);
  // Real estimated network fee for the pending send ticket, fetched from
  // the RPC (gas estimate x current fee-per-gas) instead of the static
  // "Calculated when preparing" placeholder the ticket used to show.
  const [sendFeeEstimate, setSendFeeEstimate] = useState(null); // bigint (wei) | null
  const [sendFeeEstimateError, setSendFeeEstimateError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!showSend || !sendTo || !ethers.isAddress(sendTo) || !sendAmount || Number(sendAmount) <= 0) {
      setSendFeeEstimate(null);
      setSendFeeEstimateError(false);
      return;
    }

    (async () => {
      try {
        // A token send's gas comes from calling transfer() on the
        // token contract, not a plain value transfer to sendTo, the
        // estimate has to match whichever one signAndSend will
        // actually do.
        const gasEstimatePromise = sendToken?.address
          ? (new ethers.Contract(sendToken.address, ERC20_ABI, RPC)).transfer.estimateGas(
              sendTo, ethers.parseUnits(sendAmount, sendToken.decimals), { from: wallet?.address }
            )
          : RPC.estimateGas({ from: wallet?.address, to: sendTo, value: ethers.parseEther(sendAmount) });

        const [gasEstimate, feeData] = await Promise.all([gasEstimatePromise, RPC.getFeeData()]);
        if (cancelled) return;
        const feePerGas = feeData.maxFeePerGas || feeData.gasPrice || 0n;
        setSendFeeEstimate(gasEstimate * feePerGas);
        setSendFeeEstimateError(false);
      } catch (e) {
        console.error("Send fee estimate failed:", e);
        if (cancelled) return;
        setSendFeeEstimate(null);
        setSendFeeEstimateError(true);
      }
    })();

    return () => { cancelled = true; };
  }, [showSend, sendTo, sendAmount, sendAsset, activeNetworkKey, wallet?.address]);

  const [showDetails, setShowDetails] = useState(false);
  // Holds the HoldSquares canvas's imperative draw(progress) function
  // (whichever of the 3 hold buttons is currently mounted). Not
  // useState on purpose, see the comment on HoldSquares above.
  const holdCanvasDrawRef = useRef(null);
  const [pendingTransaction, setPendingTransaction] = useState({
  amount: null,
  recipient: null
  });
  const [suggestedContact, setSuggestedContact] = useState(null);
  const [addressCheck, setAddressCheck] = useState(null); // { address, reasons, proceed }
  const [pendingContactName, setPendingContactName] = useState(null);
  const [contacts, setContacts] = useState(() => loadContacts());
  const [contactSavedMessage, setContactSavedMessage] = useState("");
  const [contactSaved, setContactSaved] = useState(false);
  // "Save as contact" on a ticket opens an inline name field instead of
  // saving immediately with the placeholder name. This is that field's
  // open/closed state and its current text, reset whenever a new
  // suggestedContact comes in (see the useEffect near suggestedContact).
  const [editingContactName, setEditingContactName] = useState(false);
  const [contactNameInput, setContactNameInput] = useState("");
  useEffect(() => {
    setEditingContactName(false);
    setContactNameInput("");
  }, [suggestedContact]);
  const [showNetworkMenu, setShowNetworkMenu] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [editingContact, setEditingContact] = useState(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactAddress, setNewContactAddress] = useState("");
  const [pendingMnemonic, setPendingMnemonic] = useState(null);
  const [showBackup, setShowBackup] = useState(false);
  const [showSeedVerification, setShowSeedVerification] = useState(false);
  const [seedVerificationPositions, setSeedVerificationPositions] = useState([]);
  const [seedVerificationWords, setSeedVerificationWords] = useState({});
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSetupError, setPasswordSetupError] = useState("");
  const [pendingPrivateKey, setPendingPrivateKey] = useState(null);   
  const [seedVerificationError, setSeedVerificationError] = useState("");
  const [passwordSetupMode, setPasswordSetupMode] = useState("create"); // "create" | "import" | "reset"
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotWordCount, setForgotWordCount] = useState(12);
  const [forgotWords, setForgotWords] = useState({});
  const [forgotError, setForgotError] = useState("");
  const [addressCopied, setAddressCopied] = useState(false);
  const [waveActive, setWaveActive] = useState(false);
  const holdIntervalRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const headerMenuRef = useRef(null);
  const chatEmptyPathRef = useBorderPath();
  const chatScrollRef = useRef(null);
  const importContactsInputRef = useRef(null);
  // Snapshot of the last consolidate poll's findings ("networkKey:symbol"
  // -> raw balance string), null until the first poll ever runs. Lets
  // the poll below tell "still the same stray balance as last time"
  // apart from "this one's new/grown since then", so it doesn't keep
  // re-announcing a balance the user has already been told about.
  const prevStrayBalancesRef = useRef(null);
  // Kept fresh via its own effect below so the poll's setInterval
  // closure (set up once, not re-created every render) can still read
  // whether a ticket is currently open right now, not whatever it was
  // when the poll first started.
  const consolidateBusyRef = useRef(false);

  // Transaction history (hamburger menu)
  const [showTxHistory, setShowTxHistory] = useState(false);
  const [txHistoryList, setTxHistoryList] = useState([]);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txHistoryError, setTxHistoryError] = useState("");
  const [txHistoryTab, setTxHistoryTab] = useState(null);
  const [predictionsList, setPredictionsList] = useState([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [predictionsError, setPredictionsError] = useState("");
  const txHistoryRows = useMemo(
    () => buildTxRows(txHistoryList, wallet?.address, defi).filter(r => r.category === txHistoryTab),
    [txHistoryList, wallet?.address, defi, txHistoryTab]
  );

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  // Multisig (Safe-backed): purely additive to the wallet, a Safe is
  // its own separate on-chain account with its own address, never the
  // wallet's own EOA, so none of this touches the normal send/balance
  // state above. See src/multisig.js for the actual Safe SDK/ethers
  // logic, this is just the UI state around it.
  const [multisigSafes, setMultisigSafes] = useState(loadMultisigSafes);
  const [showMultisigSetup, setShowMultisigSetup] = useState(false);
  // Co-owners only, the wallet's own address is always owner #1 and
  // isn't stored here, see MULTISIG_MAX_OWNERS for the 5-owner cap
  // (including that own address).
  const [multisigOwners, setMultisigOwners] = useState([]);
  const [multisigAddMode, setMultisigAddMode] = useState(null); // null | "contact" | "address"
  const [multisigAddressDraft, setMultisigAddressDraft] = useState("");
  const [multisigThreshold, setMultisigThreshold] = useState(2);
  // Shows a final plain-language recap (network, every owner, the N-
  // of-M rule spelled out) before the deploy transaction actually
  // fires, so nothing about who can spend the money is a surprise.
  const [multisigReviewing, setMultisigReviewing] = useState(false);
  const [multisigDeploying, setMultisigDeploying] = useState(false);
  const [multisigSetupError, setMultisigSetupError] = useState("");
  const [activeMultisigSafe, setActiveMultisigSafe] = useState(null);
  const [multisigBalance, setMultisigBalance] = useState(null);
  const [multisigPending, setMultisigPending] = useState([]);
  const [multisigLoading, setMultisigLoading] = useState(false);
  const [multisigProposeTo, setMultisigProposeTo] = useState("");
  const [multisigProposeAmount, setMultisigProposeAmount] = useState("");
  const [multisigActionBusy, setMultisigActionBusy] = useState(false);
  const [multisigActionError, setMultisigActionError] = useState("");

  const [biometricSupported] = useState(() => isWebAuthnAvailable());
  const [biometricEnabled, setBiometricEnabled] = useState(() => !!loadBiometricRecord());
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState("");
  const sessionKeyCacheRef = useRef(null);

  // MPC (2-of-2 key split): fragment1 lives on this device, fragment2
  // on the backend. localSecretRef holds "whatever should be
  // password/biometric-encrypted locally" -- fragment1 for an
  // MPC-enabled wallet, the full private key otherwise -- so
  // enableBiometric() never accidentally caches the full key locally
  // for an MPC wallet and defeats the backend gate.
  const localSecretRef = useRef(null);
  const [mpcEnabled, setMpcEnabled] = useState(() => !!loadSavedWallet()?.mpcEnabled);
  const [mpcBusy, setMpcBusy] = useState(false);
  const [mpcError, setMpcError] = useState("");
  const [mpcStatus, setMpcStatus] = useState(null); // { dailyLimitUsd, spentTodayUsd }
  const [mpcLimitInput, setMpcLimitInput] = useState("");
  const [enableMpcOnSetup, setEnableMpcOnSetup] = useState(false);
  const [mpcSetupLimit, setMpcSetupLimit] = useState("500");
  const [resetMpcEnabled, setResetMpcEnabled] = useState(false);

  useEffect(() => {
    if (!mpcEnabled || !wallet?.address) { setMpcStatus(null); return; }
    let cancelled = false;
    getMpcStatus(wallet.address)
      .then(status => { if (!cancelled) setMpcStatus(status); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mpcEnabled, wallet?.address, showSettings]);
  const [autoLockMinutes, setAutoLockMinutes] = useState(() => {
    const saved = localStorage.getItem("plasma_autolock_v1");
    return saved ? Number(saved) : 10;
  });
  const [autoLockMenuOpen, setAutoLockMenuOpen] = useState(false);
  const autoLockMenuRef = useRef(null);
  useEffect(() => {
    if (!autoLockMenuOpen) return;
    function onOutside(e) {
      if (autoLockMenuRef.current && !autoLockMenuRef.current.contains(e.target)) {
        setAutoLockMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [autoLockMenuOpen]);

  // Requires a biometric re-confirmation (on top of Hold-to-Confirm)
  // for any operation at or above biometricThresholdUSD, exactly the
  // same "gate" reconfirmation unlockWithBiometric already does, not
  // a new mechanism. Silently a no-op below the threshold, or when the
  // amount is unknown (null/NaN, e.g. a ticket with no real USD value
  // to compare) so it never blocks something it can't evaluate.
  async function requireBiometricForLargeAmount(amountUSD) {
    const amt = Number(amountUSD);
    if (!Number.isFinite(amt) || amt < biometricThresholdUSD) return;
    if (!biometricEnabled) return; // can't require hardware the wallet never registered
    const record = loadBiometricRecord();
    if (!record) return;
    setStatus("Confirm with biometrics for this amount…");
    try {
      await confirmBiometricPresence(record.credentialId);
    } catch (e) {
      throw new Error("Biometric confirmation was cancelled or failed, this amount requires it.");
    }
  }

  // Export private key
  const [showExportKey, setShowExportKey] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportedKey, setExportedKey] = useState(null);
  const [exportError, setExportError] = useState("");
  const [revealExportedKey, setRevealExportedKey] = useState(false);

  // Export seed phrase
  const [showExportSeed, setShowExportSeed] = useState(false);
  const [exportSeedPassword, setExportSeedPassword] = useState("");
  const [exportedSeed, setExportedSeed] = useState(null);
  const [exportSeedError, setExportSeedError] = useState("");
  const [revealExportedSeed, setRevealExportedSeed] = useState(false);

  // Reset wallet
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Portfolio chart (balance + DeFi performance)
  const [chartMode, setChartMode] = useState("line"); 
  const [chartRange, setChartRange] = useState("7d");
  const [portfolioHistory, setPortfolioHistory] = useState(() => loadPortfolioHistory());
  const [xplPriceUSD, setXplPriceUSD] = useState(null);
  const [tokenBalances, setTokenBalances] = useState({}); 
  const [stakedBalances, setStakedBalances] = useState({});
  const [stakedApy, setStakedApy] = useState({});
  const [defiTicket, setDefiTicket] = useState(null);

  // Spending cap specifically for x402 payments and ACP checkouts
  // (separate from a real send/swap, which the user already confirms
  // individually every time). $50 is a starting default, editable in
  // Settings.
  const [x402SpendLimitUSD, setX402SpendLimitUSD] = useState(() => {
    const saved = localStorage.getItem("plasma_x402_spend_limit_v1");
    return saved ? Number(saved) : 50;
  });
  useEffect(() => {
    localStorage.setItem("plasma_x402_spend_limit_v1", String(x402SpendLimitUSD));
  }, [x402SpendLimitUSD]);
  const [biometricThresholdUSD, setBiometricThresholdUSD] = useState(() => {
    const saved = localStorage.getItem("plasma_biometric_threshold_v1");
    return saved ? Number(saved) : 100;
  });
  useEffect(() => {
    localStorage.setItem("plasma_x402_spend_limit_v1", String(x402SpendLimitUSD));
  }, [x402SpendLimitUSD]);
  useEffect(() => {
    localStorage.setItem("plasma_biometric_threshold_v1", String(biometricThresholdUSD));
  }, [biometricThresholdUSD]);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLogEntries, setAuditLogEntries] = useState([]);
  const [multiTicket, setMultiTicket] = useState(null);
  // True only between "the user asked for their receive QR" and
  // either an auto-consolidated deposit landing or the next QR
  // request replacing it, see the consolidate poll effect below.
  const [awaitingDeposit, setAwaitingDeposit] = useState(false);
  const [collapsedTickets, setCollapsedTickets] = useState([]);
  const [expandedSteps, setExpandedSteps] = useState({});

  // Auto-scrolls the chat panel to reveal whatever just got added, a
  // new message, the "thinking" bubble, a QR code, a collapsed-ticket
  // chip, since nothing here did that on its own before, and new
  // content could land below the fold with no visual cue that scrolling
  // would reveal it.
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy, defiTicket, collapsedTickets.length]);

  // Execution progress checklist, real progress of the on-chain
  // sub-actions the AI is running under a single "Hold to Confirm".
  const [executionSteps, setExecutionSteps] = useState([]); // string[]
  const [executionStepIndex, setExecutionStepIndex] = useState(-1); // -1 = none done yet
  const [executionLabel, setExecutionLabel] = useState("");
  const [planStepIndex, setPlanStepIndex] = useState(-1); // index of the plan step currently executing
  

  // Once true, the ticket's "top" (title/summary/details/warning)
  // collapses away, like the deposit demo video's Before card sliding
  // up, leaving only the checklist, grown to fill the panel.
  const [ticketTopCollapsed, setTicketTopCollapsed] = useState(false);

  // Between two plan steps (Step 1 -> Step 2 -> ...): the checklist swaps
  // straight to the next step's content (same beat as Hold-to-Confirm ->
  // Step 1) while the same border wave plays around the whole ticket frame
  // on its own timer (stepSweepActive), purely decorative, never blocking
  // the real execution underneath.
  const [stepSweepActive, setStepSweepActive] = useState(false);
  // Per-step tx hash (index-aligned with multiTicket.steps) so the final
  // recap can link each accomplished step to its own transaction, and a
  // flag that swaps the last step's checklist for that recap once
  // everything's done.
  const [stepTxHashes, setStepTxHashes] = useState([]);
  const [multiTicketDone, setMultiTicketDone] = useState(false);

  function resetExecutionProgress() {
  setExecutionSteps([]);
  setExecutionStepIndex(-1);
  setExecutionLabel("");
  setTicketTopCollapsed(false);
  setWaveActive(false);
  setPlanStepIndex(-1);
  setStepSweepActive(false);
  setStepTxHashes([]);
  setMultiTicketDone(false);
}

  // Guarantees the checklist stays on screen at least
  // MIN_EXECUTION_DISPLAY_MS, even if every underlying tx confirms
  // almost instantly (fast testnets, single-step sends). Without
  // this, busy can flip back to false before the user's eyes catch
  // the change at all.
  const executionStartRef = useRef(0);
  const MIN_EXECUTION_DISPLAY_MS = 900;

  function beginExecutionTimer() {
    executionStartRef.current = Date.now();
  }

  async function finishExecution() {
    const elapsed = Date.now() - executionStartRef.current;
    const remaining = MIN_EXECUTION_DISPLAY_MS - elapsed;
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
    setBusy(false);
    // Steps are NOT reset here on purpose: the checklist stays on
    // screen, fully checked, until the user dismisses the ticket
    // (Done button) or starts a different action.
  }

  useEffect(() => {
  localStorage.setItem("plasma_active_network_v1", activeNetworkKey);
}, [activeNetworkKey]);

// Re-fetches everything for the newly active network. Runs whenever
// activeNetworkKey changes. RPC/tokens/defi above have already been
// re-derived by the time this fires, since useMemo runs during render.
useEffect(() => {
  if (wallet?.address && !locked) {
    setTokenBalances({});
    setStakedBalances({});
    refreshBalance(wallet.address);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeNetworkKey]);

  // Fires the "top collapses" half of the transition shortly after
  // the checklist first appears, mirrors the video's timing where
  // the Before card slides away right after the After list starts.
  //
  // ticketTopCollapsed is read as a guard but deliberately left out of the
  // dependency array: this effect's own 950ms timer is what sets it, and
  // depending on it here would make that same timer re-trigger this effect
  // the moment it fires, cancelling the still-pending 2400ms waveTimer in
  // the cleanup, then finding the guard now false on re-entry and never
  // scheduling a replacement, leaving waveActive stuck true forever.
  useEffect(() => {
  if (busy && executionSteps.length > 0 && !ticketTopCollapsed) {
    setWaveActive(true);
    const collapseTimer = setTimeout(() => setTicketTopCollapsed(true), 950);
    const waveTimer = setTimeout(() => setWaveActive(false), 2400);
    return () => {
      clearTimeout(collapseTimer);
      clearTimeout(waveTimer);
    };
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [busy, executionSteps.length]);

  useEffect(() => {
    setExpandedSteps({});
  }, [multiTicket]);

  function captureActiveTicket() {
    if (showSend && sendTo && sendAmount) {
      return {
        id: `send-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "send",
        label: `Send ${sendAmount} ${sendAssetSymbol}${sendTo ? ` to ${shortAddress(sendTo)}` : ""}`,
        data: { sendTo, sendAmount, sendAsset, sendAmountUSD, sendPriceUSD, suggestedContact, sendIsMax }
      };
    }
    if (defiTicket) {
      const featureLabel = { swap: "Swap", bridge: "Bridge", staking: "Staking" }[defiTicket.feature] || "DeFi";
      return {
        id: `defi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "defi",
        label: `${featureLabel}${defiTicket.amount ? ` · ${defiTicket.amount} ${defiTicket.asset || ""}` : ""}`,
        data: defiTicket
      };
    }
    if (multiTicket) {
      return {
        id: `multi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "multi",
        label: `${multiTicket.steps.length}-step plan`,
        data: multiTicket
      };
    }
    return null;
  }

  function clearActiveTicket() {
    setShowSend(false);
    setDefiTicket(null);
    setMultiTicket(null);
    resetExecutionProgress();
  }

  function pushActiveToCollapsedIfAny() {
    const captured = captureActiveTicket();
    if (captured) {
      setCollapsedTickets(c => [...c, captured]);
    }
    clearActiveTicket();
  }

  function restoreCollapsedTicket(id) {
    setCollapsedTickets(c => {
      const target = c.find(t => t.id === id);
      if (!target) return c;

      const captured = captureActiveTicket();
      clearActiveTicket();

      if (target.type === "send") {
        setSendTo(target.data.sendTo);
        setSendAmount(target.data.sendAmount);
        setSendAsset(target.data.sendAsset || "");
        setSendAmountUSD(target.data.sendAmountUSD || "");
        setSendPriceUSD(target.data.sendPriceUSD || null);
        setSuggestedContact(target.data.suggestedContact || null);
        setSendIsMax(!!target.data.sendIsMax);
        setShowSend(true);
      } else if (target.type === "defi") {
        setDefiTicket(target.data);
      } else if (target.type === "multi") {
        setMultiTicket(target.data);
      }

      const rest = c.filter(t => t.id !== id);
      return captured ? [...rest, captured] : rest;
    });
  }

  function dismissCollapsedTicket(id) {
    setCollapsedTickets(c => c.filter(t => t.id !== id));
  }

  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function refreshTokenBalances(address = wallet?.address) {
  if (!address) return {};
  const entries = await Promise.all(
    Object.entries(tokens).map(async ([symbol, token]) => {
      try {
        const contract = new ethers.Contract(token.address, ERC20_ABI, RPC);
        const raw = await contract.balanceOf(address);
        return [symbol, raw];
      } catch (e) {
        console.error(`${symbol} balance unavailable:`, e);
        return [symbol, 0n];
      }
    })
  );
  const result = Object.fromEntries(entries);
  setTokenBalances(result);
  return result;
}

  async function refreshStakedBalances(address = wallet?.address) {
  if (!address) return {};
  if (!defi.aave?.protocolDataProvider) {
    setStakedBalances({});
    return {};
  }
  const dataProvider = new ethers.Contract(
    defi.aave.protocolDataProvider,
    AAVE_DATA_PROVIDER_ABI,
    RPC
  );
  const entries = await Promise.all(
    Object.entries(tokens).map(async ([symbol, token]) => {
      try {
        const data = await dataProvider.getUserReserveData(token.address, address);
        return [symbol, data[0]];
      } catch (e) {
        console.error(`${symbol} staked balance unavailable:`, e);
        return [symbol, 0n];
      }
    })
  );
  const result = Object.fromEntries(entries);
  setStakedBalances(result);

  // Real pool APY per staked asset, read straight from Aave, same
  // liquidityRate the AI's get_aave_apy tool reads server-side.
  const apyEntries = await Promise.all(
    Object.entries(tokens)
      .filter(([symbol]) => (result[symbol] || 0n) > 0n)
      .map(async ([symbol, token]) => {
        try {
          const reserve = await dataProvider.getReserveData(token.address);
          const liquidityRateRay = reserve[5];
          const apr = Number(liquidityRateRay) / 1e27 * 100;
          return [symbol, apr];
        } catch (e) {
          console.error(`${symbol} Aave APY unavailable:`, e);
          return [symbol, null];
        }
      })
  );
  setStakedApy(Object.fromEntries(apyEntries));

  return result;
}

    const networkPortfolioHistory = useMemo(
    () => filterHistoryByNetwork(portfolioHistory, activeNetworkKey),
    [portfolioHistory, activeNetworkKey]
  );

  const portfolioChangePercent = useMemo(() => {
    const points = filterHistoryByRange(networkPortfolioHistory, chartRange);
    if (points.length < 2) return null;

    const first = Number(ethers.formatEther(points[0].balance)) + (points[0].defi || 0);
    const last = Number(ethers.formatEther(points[points.length - 1].balance)) + (points[points.length - 1].defi || 0);

    if (first <= 0) return null;

    return ((last - first) / first) * 100;
  }, [networkPortfolioHistory, chartRange]);

  async function openTxHistory() {
    if (!wallet?.address) return;

    setShowTxHistory(true);
    setTxHistoryLoading(true);
    setTxHistoryError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/transactions/${wallet.address}?network=${activeNetworkKey}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Couldn't fetch the transaction history.");
      }

      setTxHistoryList(data.transactions || []);
    } catch (e) {
      console.error(e);
      setTxHistoryError(e.message || "Error while loading.");
    } finally {
      setTxHistoryLoading(false);
    }
  }

  // Combines two independent Polymarket sources into one list: open
  // (unfilled) orders, which only this wallet's own CLOB auth can see,
  // and held positions (from Polymarket's public Data API), split into
  // "live" (unresolved market) or "closed" (redeemable) by the
  // position's own `redeemable` flag rather than a separate market
  // lookup. Always Polygon, regardless of activeNetwork, same reasoning
  // as everywhere else Polymarket appears in this file.
  // Combines open (unfilled) orders and held positions into one list,
  // shared by the Predictions tab and the chat-based "cancel/cash out
  // my bet" intent below, so both ways of finding "the thing to act on"
  // stay in sync instead of drifting apart (the tab used to be the only
  // one that knew about held positions at all: a market order fills
  // instantly, so by the time anyone says "cash out" there's usually no
  // open order left to find, only a position).
  async function fetchCombinedPredictions() {
    // Positions belong to whichever address actually holds the funds
    // on-chain (Polymarket's Data API indexes them that way too), which
    // for a POLY_1271 account is the deposit wallet, NOT the EOA this
    // wallet signs with -- live-confirmed as the reason a just-placed
    // bet never showed up here at all: this used to query positions
    // for wallet.address (the EOA) unconditionally, while the position
    // was sitting under its deposit wallet's own address the whole
    // time. Resolving the maker is a read-only, public computation
    // (deterministic factory address / on-chain code check), so it
    // works even before the wallet is unlocked -- no private key
    // needed, unlike the signing paths that reuse this same resolver.
    const polymarket = getDefiContracts("polygon").polymarket;
    const polygonNetwork = getNetworkByKey("polygon");
    const readOnlyProvider = new ethers.JsonRpcProvider(polygonNetwork.rpcUrl, polygonNetwork.chainId);
    const readOnlySigner = { getAddress: async () => wallet.address, provider: readOnlyProvider };
    const { maker } = await resolvePolymarketMaker(readOnlySigner, polymarket.ctfExchange, polymarket.depositWalletFactory);

    const positionsResponse = await fetch(`${API_BASE_URL}/api/polymarket/positions?address=${maker}`);
    const positionsData = await positionsResponse.json().catch(() => null);
    if (!positionsResponse.ok) throw new Error(positionsData?.error || "Couldn't load your Polymarket positions.");

    const positions = (positionsData.positions || []).map(p => ({
      key: `position-${p.asset}`,
      status: p.redeemable ? "closed" : "live",
      title: p.title,
      outcome: p.outcome,
      price: p.curPrice,
      size: p.size,
      tokenId: p.asset,
      conditionId: p.conditionId,
    }));

    let orders = [];
    if (unlockedPrivateKey) {
      try {
        const polygonNetwork = getNetworkByKey("polygon");
        const polygonProvider = new ethers.JsonRpcProvider(polygonNetwork.rpcUrl, polygonNetwork.chainId);
        const polygonSigner = new ethers.Wallet(unlockedPrivateKey, polygonProvider);
        const openOrders = await getOpenPolymarketOrders(polygonSigner);
        orders = await Promise.all(openOrders.map(async (o) => {
          const marketResponse = await fetch(`${API_BASE_URL}/api/polymarket/market?conditionId=${o.market}`);
          const marketData = await marketResponse.json().catch(() => null);
          return {
            key: `order-${o.id}`,
            status: "opened",
            title: marketData?.market?.question,
            outcome: o.outcome,
            price: o.price,
            size: o.original_size,
            tokenId: o.asset_id,
            conditionId: o.market,
            orderId: o.id,
          };
        }));
      } catch (e) {
        // Open orders need a signature (this wallet's own CLOB auth);
        // if that fails for any reason, still show positions rather
        // than losing the whole tab over it.
        console.error("Couldn't load open Polymarket orders:", e);
      }
    }

    // /positions only reports currently non-zero holdings, so a fully
    // cashed-out bet (sold down to zero shares) or one that's already
    // been redeemed elsewhere after resolving simply disappears from
    // it, taking Lyra's own "cashed-out"/"completed" status with it
    // (that status only ever lived in local React state, gone on the
    // next refetch/reload). /activity is Polymarket's own permanent
    // trade ledger for this address, confirmed live to still return
    // trades from before this session, grouping it by market recovers
    // any bet that's no longer live without needing Lyra to persist
    // anything itself.
    let history = [];
    try {
      const activityResponse = await fetch(`${API_BASE_URL}/api/polymarket/activity?address=${maker}`);
      const activityData = await activityResponse.json().catch(() => null);
      if (activityResponse.ok) {
        const trades = (activityData.activity || []).filter(a => a.type === "TRADE");
        const stillOpenTokenIds = new Set([...orders.map(o => o.tokenId), ...positions.map(p => p.tokenId)]);

        const byToken = new Map();
        for (const t of trades) {
          if (stillOpenTokenIds.has(t.asset)) continue;
          if (!byToken.has(t.asset)) byToken.set(t.asset, []);
          byToken.get(t.asset).push(t);
        }

        for (const [tokenId, tokenTrades] of byToken) {
          let netSize = 0, soldUsdc = 0, soldSize = 0;
          for (const t of tokenTrades) {
            if (t.side === "BUY") netSize += t.size;
            else { netSize -= t.size; soldUsdc += t.usdcSize; soldSize += t.size; }
          }
          const latest = tokenTrades.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
          const wasSold = soldSize > 0.000001;
          // Sold back down to ~zero shares is a real cashout; still
          // net long per the trade math but no longer in /positions
          // means the market resolved and this got redeemed some
          // other way (polymarket.com, most likely), not through Lyra.
          const isCashedOut = wasSold && Math.abs(netSize) < 0.01;

          history.push({
            key: `history-${tokenId}`,
            status: isCashedOut ? "cashed-out" : "closed",
            title: latest.title,
            outcome: latest.outcome,
            price: isCashedOut ? soldUsdc / soldSize : latest.price,
            size: isCashedOut ? soldSize : Math.abs(netSize) || latest.size,
            tokenId,
            conditionId: latest.conditionId,
          });
        }
      }
    } catch (e) {
      console.error("Couldn't load Polymarket trade history:", e);
    }

    return [...orders, ...positions, ...history];
  }

  async function loadPredictions() {
    if (!wallet?.address) return;
    setPredictionsLoading(true);
    setPredictionsError("");
    try {
      let list = await fetchCombinedPredictions();
      // Same indexing-lag retry as the chat "cancel/cash out" intent:
      // a bet placed moments ago can still be missing from Polymarket's
      // positions API for a few seconds, which used to make the tab
      // look empty right after "Bet placed" until the next manual
      // reopen.
      if (!list.length) {
        await new Promise(resolve => setTimeout(resolve, 2500));
        list = await fetchCombinedPredictions();
      }
      setPredictionsList(list);
    } catch (e) {
      console.error(e);
      setPredictionsError(e.message || "Error while loading.");
    } finally {
      setPredictionsLoading(false);
    }
  }

  // Opens the hold-to-confirm ticket for one Predictions-tab row. Only
  // "opened" (cancel) and "live" (cash out) carry a manual action;
  // "closed" positions are resolved already, nothing to sign there yet
  // (redeeming winnings isn't built into Lyra, only informational for
  // now).
  async function openPredictionDetail(item) {
    setShowTxHistory(false);

    if (item.status === "opened") {
      pushActiveToCollapsedIfAny();
      setDefiTicket({
        feature: "cancel-prediction",
        status: item.status,
        executable: true,
        platform: "Polymarket",
        marketQuestion: item.title,
        orderId: item.orderId,
        outcome: item.outcome,
        price: item.price,
        size: item.size,
      });
      return;
    }

    if (item.status === "live") {
      try {
        const marketResponse = await fetch(`${API_BASE_URL}/api/polymarket/market?conditionId=${item.conditionId}`);
        const marketData = await marketResponse.json().catch(() => null);
        if (!marketResponse.ok) throw new Error(marketData?.error || "Couldn't load this market's details.");

        pushActiveToCollapsedIfAny();
        setDefiTicket({
          feature: "cashout-prediction",
          status: item.status,
          executable: true,
          platform: "Polymarket",
          marketQuestion: item.title,
          tokenId: item.tokenId,
          outcome: item.outcome,
          price: item.price,
          size: item.size,
          negRisk: !!marketData?.market?.negRisk,
        });
      } catch (e) {
        console.error(e);
        setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
      }
      return;
    }

    pushActiveToCollapsedIfAny();
    setDefiTicket({
      feature: "closed-prediction",
      executable: false,
      platform: "Polymarket",
      marketQuestion: item.title,
      outcome: item.outcome,
      price: item.price,
      size: item.size,
      cashedOut: item.status === "cashed-out",
    });
  }

  const saved = useMemo(loadSavedWallet, []);

  useEffect(() => {
  const saved = loadSavedWallet();

  if (saved?.address && saved?.ciphertext) {
    setWallet({
      address: saved.address
    });

    setLocked(true);
    setShowUnlock(true);
  } else {
    setShowWallet(true);
  }
}, []);

useEffect(() => {
  if (showContacts) {
    setContacts(loadContacts());
  }
}, [showContacts]);

useEffect(() => {
  let cancelled = false;

  async function fetchPrice() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/price/xpl?network=${activeNetworkKey}`);
      const data = await response.json();

      if (cancelled) return;

      if (!response.ok) {
        // Now logging the real failure reason (429 from CoinGecko,
        // backend down, etc.) instead of silently disappearing.
        console.error("Native price endpoint error:", response.status, data?.error);
        return;
      }

      setXplPriceUSD(data.priceUSD);
      // data.stale === true if the backend is serving its last known
      // price because it couldn't reach CoinGecko in time.
    } catch (e) {
      console.error("Native price unavailable:", e);
    }
  }

  fetchPrice();
  const interval = setInterval(fetchPrice, 2 * 60 * 1000);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, [activeNetworkKey]);

useEffect(() => {
  // The receive-QR ticket itself doesn't count as "busy": it's purely
  // informational (executable: false, no hold-to-confirm, nothing to
  // collide with), and it's exactly the ticket that's open the whole
  // time a deposit is expected. Treating it as busy silently blocked
  // every single poll for as long as the QR stayed open, effectively
  // disabling auto-consolidate for its entire intended use case.
  const isJustTheReceiveQr = defiTicket?.feature === "receive-any-chain";
  consolidateBusyRef.current = !!((defiTicket && !isJustTheReceiveQr) || multiTicket || showSend);
}, [defiTicket, multiTicket, showSend]);

// Background half of the consolidate feature (see scanForStrayBalances
// above): only watches at all while awaitingDeposit is true, which
// the RECEIVE_XPL handler sets the moment the user asks for their
// receive QR, on the reasoning that asking for it is itself "I
// expect to receive something". Never runs just because the wallet
// is open/unlocked, and never on login. Every 30s it checks every
// other chain for a balance that's grown past the baseline taken the
// instant the QR was requested (so pre-existing balances, e.g. the
// Polygon funds Predictions already keeps there, never count as "just
// arrived"), and once one is found, bridges it into USDT0 on Plasma
// and stops watching, one deposit per QR request. This DOES sign and
// send on its own, no hold-to-confirm gate: asking for the QR is
// treated as standing authorization for exactly this one conversion,
// an explicit, deliberate exception to Lyra's usual "always confirm"
// rule, confirmed with the user before building it this way rather
// than assumed.
useEffect(() => {
  if (!awaitingDeposit || !wallet?.address || locked) return;

  let cancelled = false;

  async function poll() {
    const stray = await scanForStrayBalances();
    if (cancelled) return;

    const prev = prevStrayBalancesRef.current || {};
    const newItems = [];

    for (const item of stray) {
      // Never auto-swept, see scanForStrayBalances/the poll below:
      // Polygon is Predictions' own working capital, not a stray
      // deposit, regardless of what the baseline says.
      if (item.networkKey === "polygon") continue;
      const key = `${item.networkKey}:${item.symbol}`;
      const prevBalance = prev[key];
      if (prevBalance === undefined || item.balance > BigInt(prevBalance)) {
        newItems.push(item);
      }
    }

    if (newItems.length === 0 || cancelled) return;

    // Another ticket is mid-flight right now, e.g. a Send the user is
    // actively confirming, signing behind its back and driving the
    // same shared execution-checklist state would collide with it.
    // Leave the baseline untouched so these items are simply retried
    // on a later tick once things are free again.
    if (consolidateBusyRef.current) return;

    for (const item of newItems) {
      if (cancelled) return;
      try {
        const { tx, estimatedToAmount } = await executeConsolidateTicket(buildConsolidateTicket(item));
        if (cancelled) return;
        const sourceNet = resolveAnyNetwork(item.networkKey);
        const amountLabel = estimatedToAmount
          ?? Number(ethers.formatUnits(item.balance, item.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 });

        // The receive QR is what's normally still open at this point
        // (it's the one ticket exempted from the busy-check above),
        // close it completely now that what it was waiting for has
        // actually arrived, so the chat announcement below is what the
        // user sees next rather than a QR that's now stale. Harmless
        // no-op if the user had already closed it themselves.
        clearActiveTicket();

        setMessages(m => [
          ...m,
          {
            role: "ai",
            text: `$${amountLabel} was just credited on Plasma as USDT0.\n\n[View on Explorer Here](${explorerTx(tx.hash, sourceNet)})`
          }
        ]);
      } catch (e) {
        console.error(`Auto-consolidate failed for ${item.symbol} on ${item.networkName}:`, e.message);
        // The watch stops after this batch either way (see below), so
        // silently swallowing the error here left the QR sitting open
        // looking like it was still watching when it had actually
        // already given up. Surface it and close the ticket instead
        // of leaving the user staring at a QR that's secretly dead.
        clearActiveTicket();
        setMessages(m => [
          ...m,
          {
            role: "ai",
            text: `⚠️ Noticed ${Number(ethers.formatUnits(item.balance, item.decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${item.symbol} on ${item.networkName}, but consolidating it failed: ${e.message}. Try "consolidate my ${item.symbol} on ${item.networkName}" once that's resolved.`
          }
        ]);
      }
    }

    if (cancelled) return;

    // One deposit handled per QR request (successfully or not): stop
    // watching rather than keep silently retrying every 30s. The user
    // re-arms this by asking for the QR again, or retries by hand via
    // the manual consolidate command above.
    setAwaitingDeposit(false);
  }

  poll();
  const interval = setInterval(poll, 30000);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, [awaitingDeposit, wallet?.address, locked]);

useEffect(() => {
  if (!wallet || locked || autoLockMinutes === 0) return;

  function resetTimer() {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    inactivityTimerRef.current = setTimeout(() => {
      lockWallet();
    }, autoLockMinutes * 60 * 1000);
  }

  const events = ["mousedown", "keydown", "touchstart", "scroll"];
  events.forEach(evt => window.addEventListener(evt, resetTimer));
  resetTimer();

  return () => {
    events.forEach(evt => window.removeEventListener(evt, resetTimer));
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
  };
}, [wallet, locked, autoLockMinutes]);

useEffect(() => {
  localStorage.setItem("plasma_autolock_v1", String(autoLockMinutes));
}, [autoLockMinutes]);

useEffect(() => {
  if (!menuOpen) return;

  function handlePointerDown(e) {
    if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
      setMenuOpen(false);
      setShowNetworkMenu(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      setMenuOpen(false);
      setShowNetworkMenu(false);
    }
  }

  document.addEventListener("mousedown", handlePointerDown);
  document.addEventListener("keydown", handleKeyDown);

  return () => {
    document.removeEventListener("mousedown", handlePointerDown);
    document.removeEventListener("keydown", handleKeyDown);
  };
}, [menuOpen]);


// "Never leave the user stuck": whenever a chat action fails and its
// "❌ ..." line lands as the latest message, follow up with a short,
// situation-specific explanation and one concrete next step (backend:
// /api/ai/troubleshoot). Runs off the messages list itself so every
// existing error path in the app is covered without touching each one.
// If the AI (or the whole backend) is unreachable it falls back to a
// static hint, so there's always a next step on screen.
const troubleshotKeyRef = useRef(null);
useEffect(() => {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "ai" || typeof last.text !== "string" || !last.text.startsWith("❌") || last.helped) return;

  const key = `${messages.length}:${last.text}`;
  if (troubleshotKeyRef.current === key) return;
  troubleshotKeyRef.current = key;

  const errorIndex = messages.length - 1;
  const lastUserText = [...messages].reverse().find(m => m.role === "user")?.text || "";
  const backendUnreachable = /Failed to fetch|Lost connection|trouble understanding|didn't manage to turn/i.test(last.text);
  const fallbackHint = backendUnreachable
    ? "Nothing was sent or changed. Give it a moment and try again. If it keeps failing, check your connection or reload the app, your wallet stays safe."
    : "Nothing was sent or changed. You can try again, or tell me in one short sentence what you were trying to do and I'll find another way.";

  let cancelled = false;
  let finished = false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  (async () => {
    let helpText = null;
    if (!backendUnreachable) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/ai/troubleshoot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            errorText: last.text.replace(/^❌\s*/, ""),
            lastUserMessage: lastUserText,
            walletAddress: wallet?.address || null,
            balance: fmtXpl(balance),
            network: activeNetworkKey
          }),
          signal: controller.signal
        });
        if (res.ok) helpText = (await res.json())?.message || null;
      } catch {
        // falls through to the static hint below
      }
    }
    finished = true;
    if (cancelled) return;
    // One message, not two: the help is appended to the error bubble
    // itself. "helped" stops this effect from running on it again.
    setMessages(m => m.map((msg, i) =>
      i === errorIndex && msg.role === "ai" && msg.text === last.text && !msg.helped
        ? { ...msg, text: `${msg.text}\n\n${helpText || fallbackHint}`, helped: true }
        : msg
    ));
  })();

  return () => {
    cancelled = true;
    clearTimeout(timeoutId);
    controller.abort();
    // Re-arm if this run was cut off before it could answer (React
    // StrictMode's dev double-mount, or an early re-render), otherwise
    // the follow-up would never be sent for this error.
    if (!finished) troubleshotKeyRef.current = null;
  };
}, [messages]);


function lockWallet() {
  setUnlockedPrivateKey(null);
  setLocked(true);
  setShowUnlock(true);
  setMenuOpen(false);
  setUnlockPassword("");
}

function switchNetwork(key) {
  setShowNetworkMenu(false);
  if (key === activeNetworkKey) return;
  setActiveNetworkKey(key);
}


async function unlockWallet() {
  if (!unlockPassword) {
    setUnlockError("Enter your password.");
    return;
  }

  try {
    setUnlockError("");

    const saved = loadSavedWallet();

    if (!saved?.ciphertext) {
      throw new Error("Secured wallet not found.");
    }

    const localSecret = await decryptPrivateKey(
      saved,
      unlockPassword
    );

    let privateKey;
    try {
      privateKey = await reconstructPrivateKey(
        localSecret,
        saved.address,
        saved.mpcEnabled
      );
    } catch (mpcErr) {
      console.error(mpcErr);
      setUnlockError(mpcErr.message || "Couldn't reach the backend to finish unlocking.");
      return;
    }

    const w = new ethers.Wallet(privateKey);

    if (
      w.address.toLowerCase() !==
      saved.address.toLowerCase()
    ) {
      throw new Error("Invalid wallet.");
    }

    localSecretRef.current = localSecret;
    setUnlockedPrivateKey(privateKey);

    sessionKeyCacheRef.current = privateKey;

    setMpcEnabled(!!saved.mpcEnabled);

    setWallet({
      address: saved.address
    });

    setLocked(false);
    setShowUnlock(false);
    setUnlockPassword("");

    await refreshBalance(saved.address);

    } catch (e) {
    console.error(e);

    setUnlockError(
      "Incorrect password."
    );
  }
}

async function handleRevealPrivateKey() {
  if (!exportPassword) {
    setExportError("Enter your password.");
    return;
  }
  try {
    setExportError("");
    const saved = loadSavedWallet();
    if (!saved?.ciphertext) throw new Error("Secured wallet not found.");

    const localSecret = await decryptPrivateKey(saved, exportPassword);
    const privateKey = await reconstructPrivateKey(localSecret, saved.address, saved.mpcEnabled);
    const w = new ethers.Wallet(privateKey);

    if (w.address.toLowerCase() !== saved.address.toLowerCase()) {
      throw new Error("Incorrect password.");
    }

    setExportedKey(privateKey);
    setExportPassword("");
  } catch (e) {
    console.error(e);
    setExportError("Incorrect password.");
  }
}

async function handleRevealSeedPhrase() {
  if (!exportSeedPassword) {
    setExportSeedError("Enter your password.");
    return;
  }
  try {
    setExportSeedError("");
    const saved = loadSavedWallet();
    if (!saved?.ciphertext) throw new Error("Secured wallet not found.");
    if (!saved?.mnemonicEnc) {
      setExportSeedError("No recovery phrase is stored for this wallet (it was likely imported from a private key).");
      return;
    }

    const localSecret = await decryptPrivateKey(saved, exportSeedPassword);
    const privateKey = await reconstructPrivateKey(localSecret, saved.address, saved.mpcEnabled);
    const w = new ethers.Wallet(privateKey);
    if (w.address.toLowerCase() !== saved.address.toLowerCase()) {
      throw new Error("Incorrect password.");
    }

    const mnemonic = await decryptPrivateKey(saved.mnemonicEnc, exportSeedPassword);
    setExportedSeed(mnemonic);
    setExportSeedPassword("");
  } catch (e) {
    console.error(e);
    setExportSeedError("Incorrect password.");
  }
}

function closeExportSeed() {
  setShowExportSeed(false);
  setExportSeedPassword("");
  setExportedSeed(null);
  setExportSeedError("");
  setRevealExportedSeed(false);
}

function closeExportKey() {
  setShowExportKey(false);
  setExportPassword("");
  setExportedKey(null);
  setExportError("");
  setRevealExportedKey(false);
}

function resetWallet() {
  localStorage.removeItem("plasma_wallet_v2");
  setWallet(null);
  setUnlockedPrivateKey(null);
  setLocked(false);
  setShowSettings(false);
  setShowResetConfirm(false);
  setShowWallet(true);
  setBalance(0n);
  setMessages([]);
  sessionKeyCacheRef.current = null;
  clearBiometricRecord();
  setBiometricEnabled(false);
}

async function enableBiometric() {
  setBiometricError("");
  setBiometricBusy(true);
  try {
    if (!unlockedPrivateKey) throw new Error("Unlock your wallet with your password first.");
    // For an MPC wallet, localSecretRef holds fragment1, never the
    // full key -- biometric unlock must still round-trip the backend
    // for fragment2, same as a password unlock does.
    const secretToEncrypt = localSecretRef.current || unlockedPrivateKey;

    const { credentialId, supportsPrf, prfSalt } = await registerBiometric(wallet.address);

    if (supportsPrf) {
      const aesKey = await getBiometricAesKey(credentialId, prfSalt);
      if (!aesKey) throw new Error("Couldn't derive a biometric key, try again.");
      const { iv, ciphertext } = await encryptWithKey(aesKey, secretToEncrypt);
      saveBiometricRecord({ tier: "prf", credentialId, prfSalt, iv, ciphertext, address: wallet.address });
      setToast("Biometric unlock enabled. No password needed on this device.");
    } else {
      saveBiometricRecord({ tier: "gate", credentialId, address: wallet.address });
      setToast("Biometric shortcut enabled. Still needs your password after the extension fully closes.");
    }

    setBiometricEnabled(true);
  } catch (e) {
    console.error(e);
    setBiometricError(e.message || "Couldn't enable biometric unlock.");
  } finally {
    setBiometricBusy(false);
  }
}

function disableBiometric() {
  clearBiometricRecord();
  setBiometricEnabled(false);
  sessionKeyCacheRef.current = null;
  setToast("Biometric unlock disabled.");
}

async function unlockWithBiometric() {
  setBiometricError("");
  setBiometricBusy(true);
  try {
    const record = loadBiometricRecord();
    if (!record) throw new Error("Biometric unlock isn't set up.");

    let privateKey;
    const saved = loadSavedWallet();

    if (record.tier === "prf") {
      const aesKey = await getBiometricAesKey(record.credentialId, record.prfSalt);
      if (!aesKey) throw new Error("Biometric key unavailable. Use your password instead.");
      const localSecret = await decryptWithKey(aesKey, record.iv, record.ciphertext);
      privateKey = await reconstructPrivateKey(localSecret, record.address, saved?.mpcEnabled);
      localSecretRef.current = localSecret;
    } else {
      if (!sessionKeyCacheRef.current) {
        throw new Error("Your session expired. Enter your password once to continue.");
      }
      await confirmBiometricPresence(record.credentialId);
      privateKey = sessionKeyCacheRef.current;
    }

    const w = new ethers.Wallet(privateKey);
    sessionKeyCacheRef.current = privateKey;
    setUnlockedPrivateKey(privateKey);
    setMpcEnabled(!!saved?.mpcEnabled);
    setWallet({ address: w.address });
    setLocked(false);
    setShowUnlock(false);
    await refreshBalance(w.address);
  } catch (e) {
    console.error(e);
    setBiometricError(e.message || "Biometric unlock failed.");
  } finally {
    setBiometricBusy(false);
  }
}

  // Builds a signer for a Safe's own network, which may not be
  // whichever network the rest of the app currently has active (a
  // Safe deployed on Base should still be manageable while Lyra is
  // switched to Polygon, say), independent of the module-level RPC.
  function multisigSigner(networkKey) {
    if (!unlockedPrivateKey) {
      throw new Error("Unlock your wallet first.");
    }
    const network = getNetworkByKey(networkKey);
    const provider = new ethers.JsonRpcProvider(network.rpcUrl, network.chainId);
    return new ethers.Wallet(unlockedPrivateKey, provider);
  }

  // +1 for the wallet's own address, always owner #1 and never stored
  // in multisigOwners itself.
  const multisigTotalOwners = 1 + multisigOwners.length;

  // Keeps N valid no matter how M got there (a fresh open with only
  // "You" as owner #1, a removed owner, a reset): N > M is never a
  // real selection, live-confirmed the threshold's default of 2 used
  // to sit selected-but-disabled with only 1 owner present, an
  // incoherent state ("any 2 of your 1 owner will approve").
  useEffect(() => {
    setMultisigThreshold(t => Math.min(Math.max(t, 1), multisigTotalOwners));
  }, [multisigTotalOwners]);

  function closeMultisigSetup() {
    setShowMultisigSetup(false);
    setMultisigOwners([]);
    setMultisigAddMode(null);
    setMultisigAddressDraft("");
    setMultisigThreshold(2);
    setMultisigSetupError("");
    setMultisigReviewing(false);
  }

  function addMultisigOwner(address, name) {
    setMultisigSetupError("");
    const addr = (address || "").trim();

    if (!ethers.isAddress(addr)) {
      setMultisigSetupError(`"${addr}" isn't a valid address.`);
      return false;
    }
    if (wallet?.address && addr.toLowerCase() === wallet.address.toLowerCase()) {
      setMultisigSetupError("That's your own address, it's already owner #1.");
      return false;
    }
    if (multisigOwners.some(o => o.address.toLowerCase() === addr.toLowerCase())) {
      setMultisigSetupError("That address is already in the list.");
      return false;
    }
    if (multisigTotalOwners >= MULTISIG_MAX_OWNERS) {
      setMultisigSetupError(`A multisig can have at most ${MULTISIG_MAX_OWNERS} owners.`);
      return false;
    }

    setMultisigOwners(o => [...o, { address: addr, name: name || null }]);
    return true;
  }

  function removeMultisigOwner(address) {
    const next = multisigOwners.filter(o => o.address.toLowerCase() !== address.toLowerCase());
    setMultisigOwners(next);
    // Keep N valid as M shrinks, never leave N > the new owner count.
    setMultisigThreshold(t => Math.min(t, 1 + next.length));
  }

  function validateMultisigSetup() {
    if (multisigOwners.length === 0) {
      setMultisigSetupError("Add at least one co-owner.");
      return false;
    }
    if (multisigThreshold < 1 || multisigThreshold > multisigTotalOwners) {
      setMultisigSetupError(`Signatures required can't be more than the total number of owners (${multisigTotalOwners}).`);
      return false;
    }
    setMultisigSetupError("");
    return true;
  }

  function goToMultisigReview() {
    if (validateMultisigSetup()) setMultisigReviewing(true);
  }

  async function deployMultisigSafe() {
    if (!validateMultisigSetup()) {
      setMultisigReviewing(false);
      return;
    }

    setMultisigDeploying(true);
    try {
      const signer = multisigSigner(activeNetworkKey);
      const ownerAddress = await signer.getAddress();
      const owners = [ownerAddress, ...multisigOwners.map(o => o.address)];

      const safe = await deploySafe({
        networkKey: activeNetworkKey,
        signer,
        owners,
        threshold: multisigThreshold,
      });

      const updated = [...multisigSafes, safe];
      setMultisigSafes(updated);
      saveMultisigSafes(updated);

      closeMultisigSetup();
      setToast(`Multisig deployed on ${activeNetwork.name}`);
    } catch (e) {
      console.error("Multisig deployment failed:", e);
      setMultisigSetupError(friendlyErrorText(e).replace(/^❌\s*/, ""));
    } finally {
      setMultisigDeploying(false);
    }
  }

  async function refreshMultisigData(safe) {
    setMultisigLoading(true);
    try {
      const [bal, pending] = await Promise.all([
        getSafeBalance({ networkKey: safe.network, safeAddress: safe.address }),
        fetchPendingTransactions({ networkKey: safe.network, safeAddress: safe.address }),
      ]);
      setMultisigBalance(bal);
      setMultisigPending(pending);
    } catch (e) {
      console.error("Couldn't load multisig data:", e);
      setMultisigActionError(friendlyErrorText(e).replace(/^❌\s*/, ""));
    } finally {
      setMultisigLoading(false);
    }
  }

  function openMultisigManage(safe) {
    setActiveMultisigSafe(safe);
    setMultisigBalance(null);
    setMultisigPending([]);
    setMultisigActionError("");
    setMultisigProposeTo("");
    setMultisigProposeAmount("");
    refreshMultisigData(safe);
  }

  async function handleMultisigPropose() {
    if (!activeMultisigSafe) return;
    setMultisigActionError("");

    if (!ethers.isAddress(multisigProposeTo)) {
      setMultisigActionError("Invalid recipient address.");
      return;
    }
    if (!multisigProposeAmount || Number(multisigProposeAmount) <= 0) {
      setMultisigActionError("Invalid amount.");
      return;
    }

    setMultisigActionBusy(true);
    try {
      const signer = multisigSigner(activeMultisigSafe.network);
      await proposeTransfer({
        networkKey: activeMultisigSafe.network,
        safeAddress: activeMultisigSafe.address,
        signer,
        to: multisigProposeTo,
        value: ethers.parseEther(multisigProposeAmount),
      });

      setMultisigProposeTo("");
      setMultisigProposeAmount("");
      await refreshMultisigData(activeMultisigSafe);
    } catch (e) {
      console.error("Multisig proposal failed:", e);
      setMultisigActionError(friendlyErrorText(e).replace(/^❌\s*/, ""));
    } finally {
      setMultisigActionBusy(false);
    }
  }

  async function handleMultisigConfirm(safeTxHash) {
    if (!activeMultisigSafe) return;
    setMultisigActionError("");
    setMultisigActionBusy(true);
    try {
      const signer = multisigSigner(activeMultisigSafe.network);
      const result = await confirmTransfer({
        networkKey: activeMultisigSafe.network,
        safeAddress: activeMultisigSafe.address,
        signer,
        safeTxHash,
      });

      setToast(result.executed ? "Transaction executed" : "Approval added");
      await refreshMultisigData(activeMultisigSafe);
    } catch (e) {
      console.error("Multisig confirmation failed:", e);
      setMultisigActionError(friendlyErrorText(e).replace(/^❌\s*/, ""));
    } finally {
      setMultisigActionBusy(false);
    }
  }

  async function refreshBalance(address = wallet?.address) {
  if (!address) return;
  setBalanceLoading(true);
  try {
    setStatus("Reading the network…");
    const b = await RPC.getBalance(address);
    setBalance(b);
    setStatus(`Connected to ${activeNetwork.name}`);

    const [walletTokens, staked] = await Promise.all([
      refreshTokenBalances(address),
      refreshStakedBalances(address)
    ]);

    let stableUsdValue = 0;
    Object.entries(tokens).forEach(([symbol, token]) => {
      const walletAmt = Number(ethers.formatUnits(walletTokens[symbol] || 0n, token.decimals));
      const stakedAmt = Number(ethers.formatUnits(staked[symbol] || 0n, token.decimals));
      stableUsdValue += walletAmt + stakedAmt;
    });
    // Without the XPL price the stablecoins can't be counted, and a
    // snapshot missing them would show up later as a fake jump.
    if (stableUsdValue === 0 || xplPriceUSD) {
      const defiValueXpl = xplPriceUSD ? stableUsdValue / xplPriceUSD : 0;
      setPortfolioHistory(recordPortfolioSnapshot(b, defiValueXpl, activeNetworkKey));
    }
  } catch (e) {
    console.error(e);
    setStatus("RPC unavailable");
    setToast("Network unavailable, couldn't refresh the balance.");
  } finally {
    setBalanceLoading(false);
  }
}

  async function createWallet() {
  const w = ethers.Wallet.createRandom();

  const mnemonic = w.mnemonic?.phrase;

  if (!mnemonic) {
    throw new Error(
      "Couldn't generate the recovery phrase."
    );
  }

  setPendingMnemonic(mnemonic);

  setWallet({
    address: w.address
  });

  setShowWallet(false);
  setShowBackup(true);
}

  async function importWallet(phrase) {
  const words = phrase
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length !== 12 && words.length !== 24) {
    throw new Error("The seed must contain 12 or 24 words.");
  }

  const w = ethers.Wallet.fromPhrase(words.join(" "));

  setPendingPrivateKey(w.privateKey);
  setPendingMnemonic(words.join(" "));
  setPasswordSetupMode("import");
  setShowWallet(false);
  setShowPasswordSetup(true);
}

  function openForgotPassword() {
  setForgotWordCount(12);
  setForgotWords({});
  setForgotError("");
  setShowUnlock(false);
  setShowForgotPassword(true);
}

  function verifyForgotPasswordPhrase() {
  const saved = loadSavedWallet();

  if (!saved?.address) {
    setForgotError("No wallet saved on this device.");
    return;
  }

  const missing = Array.from(
    { length: forgotWordCount },
    (_, i) => i
  ).filter(i => !forgotWords[i]?.trim());

  if (missing.length > 0) {
    setForgotError("Please fill in all 12 or 24 words of your phrase.");
    return;
  }

  try {
    const phrase = Array.from(
      { length: forgotWordCount },
      (_, i) => forgotWords[i].trim().toLowerCase()
    ).join(" ");

    const w = ethers.Wallet.fromPhrase(phrase);

    if (w.address.toLowerCase() !== saved.address.toLowerCase()) {
      setForgotError(
        "This phrase doesn't match the wallet saved on this device."
      );
      return;
    }

    setForgotError("");
    setPendingPrivateKey(w.privateKey);
    setResetMpcEnabled(!!saved.mpcEnabled);
    setPasswordSetupMode("reset");
    setShowForgotPassword(false);
    setShowPasswordSetup(true);

  } catch (e) {
    console.error(e);
    setForgotError("Invalid recovery phrase.");
  }
}

  async function findUniswapV3Pool(tokenA, tokenB) {
  const factory = new ethers.Contract(defi.uniswapV3.factory, UNISWAP_V3_FACTORY_ABI, RPC);

  for (const fee of UNISWAP_V3_FEE_TIERS) {
    try {
      const pool = await factory.getPool(tokenA, tokenB, fee);
      if (pool && pool !== ethers.ZeroAddress) {
        return { pool, fee };
      }
    } catch (e) {
      console.error("Uniswap getPool error:", e);
    }
  }
  return null;
}

  async function ensureAllowance(signer, tokenAddress, spender, amount) {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const owner = await signer.getAddress();
    const current = await token.allowance(owner, spender);

    if (current >= amount) return;

    setStatus("Approving the token…");
    const tx = await token.approve(spender, amount);
    await tx.wait();

    // Pooled RPC providers load-balance across multiple backend nodes.
    // The node that confirmed the approve tx above isn't guaranteed to be
    // the same one the very next call (the spend transaction's own gas
    // estimation) lands on, and that node can still be a block behind.
    // Re-read the allowance from this same signer/provider and give it a
    // few short retries instead of trusting the receipt alone. This is
    // exactly the gap that produced "transfer amount exceeds allowance"
    // reverts on an approve that had, in fact, already gone through.
    for (let attempt = 0; attempt < 5; attempt++) {
      const confirmed = await token.allowance(owner, spender);
      if (confirmed >= amount) return;
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    throw new Error("The token approval hasn't propagated yet, please try again in a moment.");
  }

  // ethers' sendTransaction() auto-runs eth_estimateGas before broadcasting
  // unless a gasLimit is given, and that simulation is a fresh RPC call
  // that can independently land on a pooled provider's node that's still a
  // block behind, even after ensureAllowance() above already confirmed the
  // approval is visible. That's what turns a real, already-succeeded
  // approve() into a spend transaction that fails pre-flight with something
  // like "TRANSFER_FROM_FAILED" or "transfer amount exceeds allowance".
  // Retry the whole send a couple of times with a short delay before
  // surfacing it as a real error. Anything that isn't this specific class
  // of failure is rethrown immediately, no point retrying a genuine revert.
  // Same pooled-RPC-consistency issue as above, showing up differently:
  // eth_estimateGas can succeed (returning a gasLimit) against a node whose
  // view of state is *slightly* behind what actually gets mined, so the
  // real execution takes a marginally more expensive path than the one that
  // was estimated and runs out of gas right at the end, a supply() call
  // that consumed 97% of its estimated limit before reverting with no
  // decodable reason is exactly that failure mode, not a genuine business
  // logic revert. Padding the estimate gives headroom for that gap without
  // hardcoding a flat gas number that could be wrong for an unusually
  // complex route.
  async function estimateGasPadded(estimateFn) {
    const estimate = await estimateFn();
    return (estimate * 130n) / 100n;
  }

  async function sendTxWithAllowanceRetry(sendFn) {
    const ALLOWANCE_ERROR_PATTERN = /allowance|transfer_from_failed/i;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await sendFn();
      } catch (e) {
        const message = `${e?.reason || ""} ${e?.shortMessage || ""} ${e?.message || ""}`;
        if (attempt === 2 || !ALLOWANCE_ERROR_PATTERN.test(message)) throw e;
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  // ---------------------------------------------------------------
  // Execution-progress helpers
  // ---------------------------------------------------------------
  // Build the human-readable list of on-chain sub-actions a ticket
  // will actually perform, so the "Confirm transaction in wallet"
  // checklist tells the truth about what's happening under the
  // single Hold-to-Confirm gesture, rather than a generic animation.

  
  function buildSwapSteps(ticket) {
  const isNativeIn = ticket.asset === activeNetwork.nativeSymbol;
  const steps = [];
  if (!isNativeIn) steps.push(`Approve ${ticket.asset}`);
  steps.push("Get swap route");
  steps.push(`Swap ${ticket.asset} → ${ticket.tokenOutSymbol || "token"}`);
  return steps;
}

  function buildStakeSteps(ticket) {
    if (ticket.intent === "UNSTAKE_XPL") {
      return [`Withdraw ${ticket.asset} from Aave`];
    }
    return [`Approve ${ticket.asset}`, `Deposit ${ticket.asset} to Aave`];
  }

  function buildBridgeSteps(ticket) {
    const isNative = ticket.asset === activeNetwork.nativeSymbol;
    const steps = ["Get bridge quote"];
    if (!isNative) steps.push(`Approve ${ticket.asset}`);
    steps.push(`Bridge ${ticket.asset} to ${lifiChainDisplayName(ticket.destinationChainKey) || "destination chain"}`);
    return steps;
  }

  function buildPredictionSteps() {
    return ["Approve USDC.e", "Sign and place order on Polymarket"];
  }

  function stepsForDefiTicket(ticket) {
    if (ticket.feature === "swap") return buildSwapSteps(ticket);
    if (ticket.feature === "staking") return buildStakeSteps(ticket);
    if (ticket.feature === "bridge") return buildBridgeSteps(ticket);
    if (ticket.feature === "prediction") return buildPredictionSteps();
    if (ticket.feature === "cancel-prediction") return ["Cancel order on Polymarket"];
    if (ticket.feature === "cashout-prediction") return ["Approve position for trading", "Sign and place sell order on Polymarket"];
    if (ticket.feature === "safe-recovery") return ["Transfer USDC.e out of the old Safe"];
    if (ticket.feature === "receive-fiat") return ["Confirming payment", "Converting USD to USDC.e", "Delivering to your wallet"];
    if (ticket.feature === "consolidate") {
      const steps = [];
      if (ticket.tokenAddress !== NATIVE_PSEUDO_ADDRESS) steps.push(`Approve ${ticket.symbol}`);
      steps.push(`Bridge ${ticket.symbol} from ${ticket.networkName} to Plasma`);
      return steps;
    }
    if (ticket.feature === "x402" && ticket.paymentMethod === "gateway") return ["Check your Nanopayments balance", "Sign and send the payment"];
    if (ticket.feature === "x402") return ["Prepare funds (bridge in automatically if needed)", "Sign and send the payment"];
    if (ticket.feature === "gateway-deposit") return ["Approve USDC for the Gateway", "Deposit into your Nanopayments balance"];
    if (ticket.feature === "acp") return ["Sign the payment", "Complete the checkout"];
    return [];
  }

  function stepsForPlanStep(step) {
    if (step.kind === "send") return [`Send ${step.asset || activeNetwork.nativeSymbol}`];
    if (step.kind === "swap") return buildSwapSteps({ asset: step.asset, tokenOutSymbol: step.tokenOutSymbol });
    if (step.kind === "stake" || step.kind === "unstake") {
      return buildStakeSteps({ asset: step.asset, intent: step.intent });
    }
    if (step.kind === "bridge") {
      return buildBridgeSteps({ asset: step.asset, destinationChainKey: step.destinationChainKey });
    }
    return [];
  }

  // Marks the next N sub-steps as done in one go (used when a stretch
  // of steps, e.g. an allowance that turned out to already be
  // sufficient, completes without its own tx to wait on).
  function advanceExecutionTo(index) {
    setExecutionStepIndex(i => Math.max(i, index));
  }

  // The pause between "the last sub-step's checkmark just popped" and
  // "the checklist flips to the done recap". Without this, both state
  // updates would otherwise happen back to back with nothing async in
  // between, landing in the same render and skipping straight past the
  // checked state the user's meant to actually see (same reasoning as
  // the multi-ticket step-to-step pause in executeMultiTicket, applied
  // here to a single ticket's own final step).
  const DONE_TRANSITION_BEAT_MS = 1000;

  async function advanceToDoneWithBeat(stepsLength) {
    advanceExecutionTo(stepsLength - 1);
    await new Promise(resolve => setTimeout(resolve, DONE_TRANSITION_BEAT_MS));
    advanceExecutionTo(stepsLength);
  }

 async function executeArcSwapTicket(signer, ticket) {
  const assetInSymbol = ticket.asset;
  const assetOutSymbol = ticket.tokenOutSymbol;
  if (!ARC_SWAP_TOKENS.includes(assetInSymbol) || !ARC_SWAP_TOKENS.includes(assetOutSymbol)) {
    throw new Error(`Only USDC and EURC can be swapped on Arc today, via Circle's own Swap Kit.`);
  }
  if (assetInSymbol === assetOutSymbol) {
    throw new Error("Can't swap an asset for itself.");
  }
  const steps = buildSwapSteps(ticket);
  advanceExecutionTo(0);
  setStatus("Swapping via Circle's Swap Kit…");

  const adapter = createEthersAdapterFromPrivateKey({ privateKey: unlockedPrivateKey });
  const kit = new SwapKit();
  const slippageBps = Math.round((ticket.slippage ?? DEFAULT_SLIPPAGE) * 10000);
  const result = await kit.swap({
    from: { adapter, chain: "Arc" },
    tokenIn: assetInSymbol,
    tokenOut: assetOutSymbol,
    amountIn: String(ticket.amount),
    config: { slippageBps },
  });

  const tx = await fetchBroadcastTx(signer.provider, result.txHash);
  await advanceToDoneWithBeat(steps.length);
  return tx;
}

 async function executeSwapTicket(signer, ticket) {
  if (activeNetworkKey === "arc") {
    return executeArcSwapTicket(signer, ticket);
  }
  const assetInSymbol = ticket.asset;
  const assetOutSymbol = ticket.tokenOutSymbol;

  const isNativeIn = assetInSymbol === activeNetwork.nativeSymbol;
  const isNativeOut = assetOutSymbol === activeNetwork.nativeSymbol;

  const tokenInAddress = isNativeIn ? NATIVE_PSEUDO_ADDRESS : tokens[assetInSymbol]?.address;
  const tokenOutAddress = isNativeOut ? NATIVE_PSEUDO_ADDRESS : tokens[assetOutSymbol]?.address;
  const tokenInDecimals = isNativeIn ? 18 : tokens[assetInSymbol]?.decimals;

  if (!tokenInAddress) throw new Error(`${assetInSymbol} isn't supported for swaps on ${activeNetwork.name}.`);
  if (!tokenOutAddress) throw new Error("The output token isn't configured.");

  const steps = buildSwapSteps(ticket);
  let stepCursor = 0;
  const nextStep = () => { advanceExecutionTo(stepCursor); stepCursor += 1; };

  const amountIn = ethers.parseUnits(String(ticket.amount), tokenInDecimals);
  if (amountIn <= 0n) {
    throw new Error(`Nothing to swap, the resolved ${assetInSymbol} amount came out to 0.`);
  }
  const signerAddress = await signer.getAddress();
  const chainSlug = activeNetwork.kyberSlug; // to add in NETWORKS, e.g. "ethereum"

  // 1. Approve (if not native)
  let routerAddress = null;

  setStatus("Fetching the KyberSwap route…");
const routeUrl = new URL(`${KYBERSWAP_API_BASE(chainSlug)}/routes`);
routeUrl.searchParams.set("tokenIn", tokenInAddress);
routeUrl.searchParams.set("tokenOut", tokenOutAddress);
routeUrl.searchParams.set("amountIn", amountIn.toString());

const routeRes = await fetch(routeUrl, {
  headers: { "X-Client-Id": KYBERSWAP_CLIENT_ID }
});
const routeData = await routeRes.json();
if (!routeRes.ok || !routeData.data?.routeSummary) {
  console.error("KyberSwap route error:", routeRes.status, routeData);
  throw new Error(routeData.message || "KyberSwap couldn't compute a route.");
}
nextStep();

setStatus("Preparing the transaction…");
const slippage = ticket.slippage ?? DEFAULT_SLIPPAGE;
const buildRes = await fetch(`${KYBERSWAP_API_BASE(chainSlug)}/route/build`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Client-Id": KYBERSWAP_CLIENT_ID
  },
  body: JSON.stringify({
    routeSummary: routeData.data.routeSummary,
    sender: signerAddress,
    recipient: signerAddress,
    slippageTolerance: Math.round(slippage * 10000) // in bips
  })
});
const buildData = await buildRes.json();
if (!buildRes.ok || !buildData.data?.data) {
  console.error("KyberSwap build error:", buildRes.status, buildData);
  throw new Error(buildData.message || "KyberSwap couldn't build the transaction.");
}

  routerAddress = buildData.data.routerAddress;

  if (!isNativeIn) {
    setStatus(`Approving ${assetInSymbol}…`);
    await ensureAllowance(signer, tokenInAddress, routerAddress, amountIn);
    nextStep();
  }

  setStatus("Sending the swap…");
  const swapTxRequest = {
    to: buildData.data.routerAddress,
    data: buildData.data.data,
    value: isNativeIn ? amountIn : 0n
  };
  // The gas estimate and the send are retried together, if the estimate
  // itself hits the stale-allowance read, retrying only the send would
  // never get a chance to re-estimate against the now-current state.
  const tx = await sendTxWithAllowanceRetry(async () => {
    swapTxRequest.gasLimit = await estimateGasPadded(() => signer.estimateGas(swapTxRequest));
    return signer.sendTransaction(withNonceOverride(swapTxRequest));
  });
  await tx.wait();
  await advanceToDoneWithBeat(steps.length);

  return tx;
}

// Aave V4's Hub-and-Spoke contracts (currently just Arc) address a
// reserve by a small sequential id instead of the asset's own
// address, and there's no separate data-provider contract for
// reading a user's position, see AAVE_V4_SPOKE_ABI in config.js.
// Not added to TOKENS_BY_NETWORK (that would show a second "USDC"
// balance line next to Arc's native one for the exact same money,
// see the ARC_MAINNET comment in config.js), so it's resolved here
// instead, off DEFI_CONTRACTS_BY_NETWORK.arc.aaveV4.reserves directly.
function aaveV4Reserve(ticketAsset) {
  return defi.aaveV4?.reserves?.[ticketAsset] || null;
}

async function executeStakeTicket(signer, ticket) {
  const v4Reserve = aaveV4Reserve(ticket.asset);
  if (v4Reserve) {
    const amount = ethers.parseUnits(String(ticket.amount), v4Reserve.decimals);
    if (amount <= 0n) {
      throw new Error(`Nothing to stake, the resolved ${ticket.asset} amount came out to 0.`);
    }
    setStatus(`Approving ${ticket.asset}…`);
    await ensureAllowance(signer, v4Reserve.address, defi.aaveV4.spoke, amount);
    advanceExecutionTo(0);
    const spoke = new ethers.Contract(defi.aaveV4.spoke, AAVE_V4_SPOKE_ABI, signer);
    setStatus("Depositing to Aave…");
    const signerAddress = await signer.getAddress();
    const tx = await sendTxWithAllowanceRetry(async () => {
      const gasLimit = await estimateGasPadded(() => spoke.supply.estimateGas(v4Reserve.id, amount, signerAddress));
      return spoke.supply(v4Reserve.id, amount, signerAddress, { gasLimit });
    });
    await tx.wait();
    await advanceToDoneWithBeat(buildStakeSteps(ticket).length);
    return tx;
  }

  const token = tokens[ticket.asset];
  if (!token?.address || token.address === ethers.ZeroAddress) {
    throw new Error(`${ticket.asset} isn't supported for staking yet on ${activeNetwork.name}.`);
  }
  if (!defi.aave?.pool) {
    throw new Error(`Staking isn't configured for ${activeNetwork.name} yet.`);
  }
  const amount = ethers.parseUnits(String(ticket.amount), token.decimals);
  if (amount <= 0n) {
    throw new Error(`Nothing to stake, the resolved ${ticket.asset} amount came out to 0.`);
  }
  setStatus(`Approving ${ticket.asset}…`);
  await ensureAllowance(signer, token.address, defi.aave.pool, amount);
  advanceExecutionTo(0);
  const pool = new ethers.Contract(defi.aave.pool, AAVE_POOL_ABI, signer);
  setStatus("Depositing to Aave…");
  const signerAddress = await signer.getAddress();
  const tx = await sendTxWithAllowanceRetry(async () => {
    const gasLimit = await estimateGasPadded(() => pool.supply.estimateGas(token.address, amount, signerAddress, 0));
    return pool.supply(token.address, amount, signerAddress, 0, { gasLimit });
  });
  await tx.wait();
  await advanceToDoneWithBeat(buildStakeSteps(ticket).length);
  return tx;
}

async function executeUnstakeTicket(signer, ticket) {
  const v4Reserve = aaveV4Reserve(ticket.asset);
  if (v4Reserve) {
    const spoke = new ethers.Contract(defi.aaveV4.spoke, AAVE_V4_SPOKE_ABI, signer);
    const withdrawSignerAddress = await signer.getAddress();
    // Aave V4 is a from-scratch rewrite (Hub-and-Spoke, not the old
    // single Pool contract), so unlike AAVE_POOL_ABI there's no
    // confirmed max-uint256 "withdraw everything" sentinel for it.
    // Read the real supplied balance directly instead of assuming
    // one carried over, and use that as the amount for an unqualified
    // "withdraw my USDC".
    const requestedAmount = ticket.amount ? ethers.parseUnits(String(ticket.amount), v4Reserve.decimals) : 0n;
    let amount = requestedAmount;
    if (amount <= 0n) {
      amount = await spoke.getUserSuppliedAssets(v4Reserve.id, withdrawSignerAddress);
      if (amount <= 0n) {
        throw new Error(`You don't have any ${ticket.asset} staked on ${activeNetwork.name}.`);
      }
    }
    setStatus("Withdrawing from Aave…");
    const gasLimit = await estimateGasPadded(() => spoke.withdraw.estimateGas(v4Reserve.id, amount, withdrawSignerAddress));
    const tx = await spoke.withdraw(v4Reserve.id, amount, withdrawSignerAddress, { gasLimit });
    await tx.wait();
    await advanceToDoneWithBeat(buildStakeSteps(ticket).length);
    return tx;
  }

  const token = tokens[ticket.asset];
  if (!token?.address || token.address === ethers.ZeroAddress) {
    throw new Error(`${ticket.asset} isn't supported for withdrawal on ${activeNetwork.name}.`);
  }
  if (!defi.aave?.pool) {
    throw new Error(`Staking isn't configured for ${activeNetwork.name} yet.`);
  }
  // Nothing that computes "how much do I actually have staked" ever
  // fed into this ticket. Swap/bridge quotes and Aave's supply rate
  // are the only real data the AI has tools to fetch, so an unqualified
  // "withdraw my USDC" naturally resolves to an unusable 0 rather than
  // a real number. Aave's own withdraw() already has a built-in "cap to
  // whatever I actually have" mode via the max-uint256 sentinel, use
  // it instead of failing outright, matching what Aave's own UI does
  // for a "Withdraw Max" action.
  const requestedAmount = ticket.amount ? ethers.parseUnits(String(ticket.amount), token.decimals) : 0n;
  const amount = requestedAmount > 0n ? requestedAmount : ethers.MaxUint256;
  const pool = new ethers.Contract(defi.aave.pool, AAVE_POOL_ABI, signer);
  setStatus("Withdrawing from Aave…");
  const withdrawSignerAddress = await signer.getAddress();
  const gasLimit = await estimateGasPadded(() => pool.withdraw.estimateGas(token.address, amount, withdrawSignerAddress));
  const tx = await pool.withdraw(token.address, amount, withdrawSignerAddress, { gasLimit });
  await tx.wait();
  await advanceToDoneWithBeat(buildStakeSteps(ticket).length);
  return tx;
}

  // Arc has no LI.FI deployment yet (see NETWORK_KEY_TO_LIFI_KEY), so
  // any bridge touching it (either direction) goes through Circle's
  // own Bridge Kit (real CCTP burn-and-mint) instead. destinationChainKey
  // is Lyra's own lowercase network key here ("ethereum"/"arc"/etc.),
  // never a LI.FI short code, see the ## BRIDGE_XPL prompt in server.js.
  async function executeArcBridgeTicket(signer, ticket) {
    const fromKey = activeNetworkKey;
    const toKey = ticket.destinationChainKey;
    const fromChain = NETWORK_KEY_TO_CIRCLE_CHAIN[fromKey];
    const toChain = NETWORK_KEY_TO_CIRCLE_CHAIN[toKey];
    if (!fromChain || !toChain) {
      throw new Error(`Bridging between ${getNetworkByKey(fromKey).name} and ${getNetworkByKey(toKey).name} isn't supported yet.`);
    }
    const assetSymbol = ticket.asset === activeNetwork.nativeSymbol ? "USDC" : ticket.asset;
    if (assetSymbol !== "USDC" && assetSymbol !== "EURC") {
      throw new Error("Only USDC and EURC can be bridged to/from Arc today, via Circle's own Bridge Kit.");
    }
    const amount = Number(ticket.amount);
    if (!(amount > 0)) {
      throw new Error(`Nothing to bridge, the resolved ${assetSymbol} amount came out to 0.`);
    }

    let stepCursor = 0;
    advanceExecutionTo(stepCursor++);
    setStatus("Bridging via Circle's Bridge Kit…");

    const adapter = createEthersAdapterFromPrivateKey({ privateKey: unlockedPrivateKey });
    const kit = new BridgeKit();
    const result = await kit.bridge({
      from: { adapter, chain: fromChain },
      to: { adapter, chain: toChain },
      amount: String(ticket.amount),
      token: assetSymbol,
    });

    if (result.state === "error") {
      const failedStep = result.steps.find(s => s.state === "error");
      throw new Error(failedStep?.errorMessage || "The bridge failed partway through.");
    }
    advanceExecutionTo(stepCursor++);

    // Only the burn (source-chain) step shares this call's own signer/
    // provider, matching what the existing LI.FI path already returns
    // here too: the source-side send, not a cross-chain confirmation.
    // The mint itself still genuinely happens (the same adapter/address
    // is given as the destination too), just off-screen from this
    // specific return value, exactly like every other bridge in this app.
    const burnStep = result.steps.find(s => s.name?.toLowerCase() === "burn" && s.txHash)
      || result.steps.find(s => s.txHash);
    if (!burnStep) {
      throw new Error("The bridge completed but no transaction hash came back.");
    }
    const tx = await fetchBroadcastTx(signer.provider, burnStep.txHash);
    await advanceToDoneWithBeat(buildBridgeSteps(ticket).length);
    return tx;
  }

  async function executeBridgeTicket(signer, ticket) {
  if (activeNetworkKey === "arc" || ticket.destinationChainKey === "arc") {
    return executeArcBridgeTicket(signer, ticket);
  }
  const isNative = ticket.asset === activeNetwork.nativeSymbol;
  const token = isNative
    ? { address: NATIVE_PSEUDO_ADDRESS, decimals: 18 }
    : tokens[ticket.asset];
  if (!token?.address || token.address === ethers.ZeroAddress) {
    throw new Error(`${ticket.asset} isn't supported for bridging on ${activeNetwork.name}.`);
  }
  if (!ticket.destinationChainKey) {
    throw new Error("Unknown destination chain for this bridge.");
  }
  if (!defi.lifi?.diamond) {
    throw new Error(`Bridging isn't configured for ${activeNetwork.name} yet.`);
  }

  const amount = ethers.parseUnits(String(ticket.amount), token.decimals);
  if (amount <= 0n) {
    throw new Error(`Nothing to bridge, the resolved ${ticket.asset} amount came out to 0.`);
  }
  const fromAddress = await signer.getAddress();

  setStatus("Fetching the LI.FI quote…");
  const url = new URL(LIFI_QUOTE_API_URL);
  url.searchParams.set("fromChain", String(activeNetwork.chainId));
  url.searchParams.set("toChain", ticket.destinationChainKey);
  url.searchParams.set("fromToken", token.address);
  // The destination token lives on a different chain, so it has a
  // different contract address there, reusing the source chain's
  // address (as before) made LI.FI look for that exact address on the
  // destination chain and fail. LI.FI resolves a plain symbol per
  // chain on its own, so pass the asset symbol here instead.
  url.searchParams.set("toToken", ticket.asset);
  url.searchParams.set("fromAmount", amount.toString());
  url.searchParams.set("fromAddress", fromAddress);
  url.searchParams.set("slippage", String(ticket.slippage ?? DEFAULT_SLIPPAGE));

  const response = await fetch(url);
  const quote = await response.json();

  if (!response.ok || !quote.transactionRequest) {
    throw new Error(quote.error || "LI.FI couldn't provide a transaction for this bridge.");
  }
  let stepCursor = 0;
  advanceExecutionTo(stepCursor++);

  if (!isNative) {
    setStatus(`Approving ${ticket.asset}…`);
    await ensureAllowance(
      signer,
      token.address,
      quote.estimate?.approvalAddress || defi.lifi.diamond,
      amount
    );
    advanceExecutionTo(stepCursor++);
  }

  setStatus("Sending the bridge transaction…");
  const bridgeTxRequest = {
    to: quote.transactionRequest.to,
    data: quote.transactionRequest.data,
    value: quote.transactionRequest.value ? BigInt(quote.transactionRequest.value) : 0n
  };
  const tx = await sendTxWithAllowanceRetry(async () => {
    bridgeTxRequest.gasLimit = await estimateGasPadded(() => signer.estimateGas(bridgeTxRequest));
    return signer.sendTransaction(withNonceOverride(bridgeTxRequest));
  });
  await tx.wait();
  await advanceToDoneWithBeat(buildBridgeSteps(ticket).length);
  return tx;
}

  // LI.FI deploys its diamond router contract at this exact same
  // address on nearly every chain it supports (deterministic CREATE2
  // deployment). Confirmed live by checking the bytecode at this
  // address on all four EXTRA_LIFI_CHAINS below (identical 10354-byte
  // contract on each). This is also the exact address already used
  // for ethereum/base in DEFI_CONTRACTS_BY_NETWORK (config.js).
  // Plasma is the one exception with its own different diamond
  // address, unrelated to this constant.
  const LIFI_STANDARD_DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";

  // A handful of major EVM chains Lyra itself doesn't otherwise
  // support (no swap/stake/bridge UI for these), added here purely so
  // the consolidate scan below can also notice a deposit that landed
  // on one of them. Only native-coin detection is possible for these:
  // spotting an arbitrary ERC-20 on a chain Lyra has no token list for
  // would need a balance-indexing API (Covalent/Moralis/etc.), not
  // just a plain RPC call, that's a real limit, not an oversight.
  const EXTRA_LIFI_CHAINS = [
    { key: "arbitrum", name: "Arbitrum", chainId: 42161, rpcUrl: "https://arb1.arbitrum.io/rpc", nativeSymbol: "ETH", explorer: "https://arbiscan.io", lifiKey: "arb", lifiDiamond: LIFI_STANDARD_DIAMOND },
    { key: "optimism", name: "Optimism", chainId: 10, rpcUrl: "https://mainnet.optimism.io", nativeSymbol: "ETH", explorer: "https://optimistic.etherscan.io", lifiKey: "opt", lifiDiamond: LIFI_STANDARD_DIAMOND },
    { key: "bsc", name: "BNB Chain", chainId: 56, rpcUrl: "https://bsc-dataseed.binance.org", nativeSymbol: "BNB", explorer: "https://bscscan.com", lifiKey: "bsc", lifiDiamond: LIFI_STANDARD_DIAMOND },
    { key: "avalanche", name: "Avalanche", chainId: 43114, rpcUrl: "https://api.avax.network/ext/bc/C/rpc", nativeSymbol: "AVAX", explorer: "https://snowtrace.io", lifiKey: "avax", lifiDiamond: LIFI_STANDARD_DIAMOND },
  ];

  // Resolves a network object regardless of whether it's one of
  // Lyra's own four (NETWORKS) or one of the EXTRA_LIFI_CHAINS above,
  // shaped the same way either time (name/chainId/rpcUrl/nativeSymbol/
  // explorer/lifiKey/lifiDiamond) so callers don't need to care which
  // list it came from.
  function resolveAnyNetwork(networkKey) {
    const own = NETWORKS.find(n => n.key === networkKey);
    if (own) {
      return {
        ...own,
        lifiKey: NETWORK_KEY_TO_LIFI_KEY[own.key],
        lifiDiamond: getDefiContracts(own.key)?.lifi?.diamond || null
      };
    }
    return EXTRA_LIFI_CHAINS.find(n => n.key === networkKey) || null;
  }

  // Looks for any non-zero balance (native coin, or a configured
  // ERC-20 on a chain Lyra fully supports) sitting anywhere OTHER
  // than Plasma itself, the wallet's home network. Consolidating
  // always targets Plasma/USDT0 specifically, not whatever network
  // tab happens to be open in the UI right now, an automatic
  // background sweep silently depending on transient UI state would
  // be unpredictable. Anything that already lands on Plasma is just
  // a normal balance, no conversion offered for it.
  async function scanForStrayBalances() {
    if (!wallet?.address) return [];
    const otherNetworks = NETWORKS.filter(n => n.key !== "plasma");

    const perNetwork = await Promise.all(otherNetworks.map(async (network) => {
      const provider = new ethers.JsonRpcProvider(network.rpcUrl, network.chainId);
      const found = [];

      try {
        const nativeBal = await provider.getBalance(wallet.address);
        if (nativeBal > 0n) {
          found.push({
            networkKey: network.key,
            networkName: network.name,
            symbol: network.nativeSymbol,
            address: NATIVE_PSEUDO_ADDRESS,
            decimals: 18,
            balance: nativeBal
          });
        }
      } catch (e) {
        console.error(`Balance check failed on ${network.name}:`, e.message);
      }

      const tokenList = TOKENS_BY_NETWORK[network.key] || {};
      for (const [symbol, token] of Object.entries(tokenList)) {
        if (!token.address) continue;
        try {
          const erc20 = new ethers.Contract(token.address, ERC20_ABI, provider);
          const bal = await erc20.balanceOf(wallet.address);
          if (bal > 0n) {
            found.push({
              networkKey: network.key,
              networkName: network.name,
              symbol,
              address: token.address,
              decimals: token.decimals,
              balance: bal
            });
          }
        } catch (e) {
          console.error(`${symbol} balance check failed on ${network.name}:`, e.message);
        }
      }

      return found;
    }));

    // Extra chains: native coin only, see EXTRA_LIFI_CHAINS above.
    const perExtraChain = await Promise.all(EXTRA_LIFI_CHAINS.map(async (chain) => {
      try {
        const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.chainId);
        const nativeBal = await provider.getBalance(wallet.address);
        if (nativeBal > 0n) {
          return [{
            networkKey: chain.key,
            networkName: chain.name,
            symbol: chain.nativeSymbol,
            address: NATIVE_PSEUDO_ADDRESS,
            decimals: 18,
            balance: nativeBal
          }];
        }
      } catch (e) {
        console.error(`Balance check failed on ${chain.name}:`, e.message);
      }
      return [];
    }));

    return [...perNetwork.flat(), ...perExtraChain.flat()];
  }

  // Converts one stray balance (found above) into USDT0 on Plasma,
  // Lyra's home network, via the same LI.FI route used for Bridge,
  // just generalized to a source chain/token that isn't fixed to
  // "same token, different chain" like executeBridgeTicket above, and
  // a source network that may not even be one of Lyra's own four
  // (see EXTRA_LIFI_CHAINS/resolveAnyNetwork).
  async function executeConsolidateTicket(ticket) {
    const sourceNetwork = resolveAnyNetwork(ticket.sourceNetworkKey);
    if (!sourceNetwork) {
      throw new Error(`Unknown source network for this consolidation.`);
    }
    const destLifiKey = NETWORK_KEY_TO_LIFI_KEY.plasma;
    if (!sourceNetwork.lifiDiamond) {
      throw new Error(`Bridging isn't configured for ${sourceNetwork.name} yet.`);
    }

    const provider = new ethers.JsonRpcProvider(sourceNetwork.rpcUrl, sourceNetwork.chainId);
    const signer = new ethers.Wallet(unlockedPrivateKey, provider);
    const fromAddress = await signer.getAddress();
    const isNative = ticket.tokenAddress === NATIVE_PSEUDO_ADDRESS;

    let sendAmountRaw = ticket.balanceRaw;
    if (isNative) {
      // scanForStrayBalances reports the ENTIRE native balance, but
      // sweeping 100% of it leaves nothing to pay for the transaction
      // that sends it, a guaranteed "insufficient funds" (hit live on
      // BSC: the route's own gas cost ate the whole would-be amount).
      // The real gas cost isn't knowable without first having a quote
      // (circular), so reserve against the CURRENT gas price with a
      // generous unit-count margin instead. LI.FI's routes here call
      // into multi-step swap+bridge calldata (confirmed live, a much
      // heavier tx than a plain transfer), 2M gas units covers that
      // with real room to spare, and getFeeData() (not a hardcoded
      // price) keeps this correct regardless of which chain or how
      // busy it is when this actually runs.
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
      const gasReserve = gasPrice * 2_000_000n;
      const rawBalance = BigInt(ticket.balanceRaw);
      if (rawBalance <= gasReserve) {
        throw new Error(`Not enough ${ticket.symbol} left over to cover gas after reserving some for this transaction.`);
      }
      sendAmountRaw = (rawBalance - gasReserve).toString();
    }

    setStatus("Fetching the LI.FI quote…");
    const url = new URL(LIFI_QUOTE_API_URL);
    url.searchParams.set("fromChain", String(sourceNetwork.chainId));
    url.searchParams.set("toChain", destLifiKey);
    url.searchParams.set("fromToken", ticket.tokenAddress);
    // Same reasoning as executeBridgeTicket: the destination asset's
    // address is different on the destination chain, LI.FI resolves a
    // plain symbol per chain on its own. USDT0 is Plasma's own
    // stablecoin (see TOKENS_BY_NETWORK.plasma), the same symbol
    // BRIDGE_XPL already resolves correctly when bridging USDT into
    // Plasma from elsewhere.
    url.searchParams.set("toToken", "USDT0");
    url.searchParams.set("fromAmount", sendAmountRaw);
    url.searchParams.set("fromAddress", fromAddress);
    url.searchParams.set("slippage", String(DEFAULT_SLIPPAGE));

    const response = await fetch(url);
    const quote = await response.json();
    if (!response.ok || !quote.transactionRequest) {
      throw new Error(quote.error || "LI.FI couldn't find a route to consolidate this balance.");
    }

    let stepCursor = 0;
    advanceExecutionTo(stepCursor++);

    if (!isNative) {
      setStatus(`Approving ${ticket.symbol}…`);
      await ensureAllowance(
        signer,
        ticket.tokenAddress,
        quote.estimate?.approvalAddress || sourceNetwork.lifiDiamond,
        BigInt(ticket.balanceRaw)
      );
      advanceExecutionTo(stepCursor++);
    }

    setStatus("Sending the consolidation transaction…");
    const txRequest = {
      to: quote.transactionRequest.to,
      data: quote.transactionRequest.data,
      value: quote.transactionRequest.value ? BigInt(quote.transactionRequest.value) : 0n
    };
    const tx = await sendTxWithAllowanceRetry(async () => {
      txRequest.gasLimit = await estimateGasPadded(() => signer.estimateGas(txRequest));
      return signer.sendTransaction(withNonceOverride(txRequest));
    });
    await tx.wait();
    await advanceToDoneWithBeat(stepsForDefiTicket(ticket).length);

    // USDT0 uses 6 decimals (TOKENS_BY_NETWORK.plasma.USDT0), same as
    // every other stablecoin in this app. LI.FI's own quote estimate,
    // not a guess, that's the actual amount its route is expected to
    // deliver.
    const estimatedToAmount = quote.estimate?.toAmount
      ? Number(ethers.formatUnits(quote.estimate.toAmount, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })
      : null;

    return { tx, estimatedToAmount };
  }

  function buildConsolidateTicket(item) {
    return {
      feature: "consolidate",
      intent: "CONSOLIDATE_FUNDS",
      executable: true,
      sourceNetworkKey: item.networkKey,
      networkName: item.networkName,
      symbol: item.symbol,
      tokenAddress: item.address,
      balanceRaw: item.balance.toString(),
      amountDisplay: Number(ethers.formatUnits(item.balance, item.decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 }),
      platform: "LI.FI",
      fees: "Network + bridge fees apply",
      riskLevel: "low"
    };
  }

  // Builds the ticket shown for a PAY_X402 request, once the URL has
  // already been probed and returned a real HTTP 402 with real
  // PaymentRequirements (see the PAY_X402 case). Everything here is
  // real data straight from that response, nothing guessed.
  function buildX402Ticket(url, requirement, network, resourceInfo, options = {}) {
    const knownToken = Object.values(TOKENS_BY_NETWORK[network.key] || {}).find(
      t => t.address?.toLowerCase() === requirement.asset.toLowerCase()
    );
    const isGateway = options.paymentMethod === "gateway";
    // Arc's USDC has no TOKENS_BY_NETWORK entry (see config.js), it is the
    // native coin there, so fall back to the plain name.
    const symbol = knownToken?.symbol || (isGateway ? "USDC" : requirement.extra?.name || "USDC");
    const decimals = knownToken?.decimals ?? 6; // USDC/EURC's own convention, x402's "exact" scheme is EIP-3009 (USDC/EURC), not arbitrary ERC-20s
    const amount = ethers.formatUnits(requirement.amount, decimals);

    return {
      feature: "x402",
      intent: "PAY_X402",
      executable: true,
      paymentMethod: isGateway ? "gateway" : "exact",
      gatewayBalance: options.gatewayBalance ?? null,
      url,
      requirement,
      resourceInfo: resourceInfo || null,
      network,
      networkKey: network.key,
      symbol,
      amount,
      amountUSD: Number(amount), // USDC/EURC, ~$1 each, same assumption the rest of the app makes for stablecoins
      payTo: requirement.payTo,
      resourceDescription: resourceInfo?.description || null,
      platform: isGateway ? "x402 · Circle Nanopayments" : "x402 Protocol",
      fees: isGateway
        ? "None (free signature, paid from your Nanopayments balance)"
        : "Gasless (EIP-3009 signature), unless funds must be bridged in first",
      riskLevel: "low",
      riskReason: isGateway
        ? "Off-chain signed authorization only, Circle settles it in a batch from your prepaid balance"
        : "Off-chain signed authorization only, no funds move until the resource server settles it",
      summary: resourceInfo?.description ? `Pay for: ${resourceInfo.description}` : `Pay ${amount} ${symbol} to access this resource.`,
    };
  }

  // ACP (Agentic Commerce Protocol) checkout ticket -- a cart summary
  // instead of a single resource, but the same "hold to confirm signs
  // an x402 payment" execution underneath (see executeAcpTicket).
  function buildAcpTicket(session) {
    const requirement = session.payment_required.accepts[0];
    return {
      feature: "acp",
      intent: "ACP_CHECKOUT",
      executable: true,
      sessionId: session.id,
      lineItems: session.line_items,
      requirement,
      network: getNetworkByKey("base"),
      networkKey: "base",
      symbol: "USDC",
      amount: String(session.totalUSD),
      amountUSD: session.totalUSD,
      payTo: requirement.payTo,
      platform: "Agentic Commerce Protocol",
      fees: "Gasless (EIP-3009 signature), settled over x402",
      riskLevel: "low",
      riskReason: "Off-chain signed authorization only, no funds move until the demo merchant confirms",
      summary: `Checkout: ${session.line_items.map(li => `${li.quantity}× ${li.name}`).join(", ")}`,
    };
  }

  // x402's "Smart Liquidity Routing": scans every OTHER Lyra network
  // for a configured stablecoin balance that could cover a shortfall
  // on the network an x402 payment actually needs. Native coins are
  // deliberately excluded, converting their balance to a USD value to
  // compare against a shortfall would need a live price lookup this
  // function doesn't have, restricting to stablecoins (already ~$1
  // each, same assumption the rest of the app already makes about
  // them) keeps this both correct and simple.
  async function scanStablecoinBalances(excludeNetworkKey) {
    if (!wallet?.address) return [];
    const candidates = NETWORKS.filter(n => n.key !== excludeNetworkKey);

    const perNetwork = await Promise.all(candidates.map(async (network) => {
      const provider = new ethers.JsonRpcProvider(network.rpcUrl, network.chainId);
      const found = [];
      const tokenList = TOKENS_BY_NETWORK[network.key] || {};
      for (const [symbol, token] of Object.entries(tokenList)) {
        if (!token.address) continue;
        try {
          const erc20 = new ethers.Contract(token.address, ERC20_ABI, provider);
          const bal = await erc20.balanceOf(wallet.address);
          if (bal > 0n) {
            found.push({ networkKey: network.key, network, symbol, address: token.address, decimals: token.decimals, balance: bal });
          }
        } catch (e) {
          console.error(`${symbol} balance check failed on ${network.name}:`, e.message);
        }
      }
      return found;
    }));

    return perNetwork.flat();
  }

  // Generalizes executeConsolidateTicket's LI.FI quote+send below to
  // an arbitrary destination network/token instead of the hardcoded
  // Plasma/USDT0 that feature always targets, same single LI.FI quote
  // doing both the swap and the bridge in one route/one signature.
  async function bridgeAssetToTarget({ sourceNetworkKey, tokenAddress, tokenDecimals, amountRaw, destNetworkKey, destTokenAddress }, onStatus) {
    const sourceNetwork = getNetworkByKey(sourceNetworkKey);
    const destNetwork = getNetworkByKey(destNetworkKey);
    if (!sourceNetwork.lifiDiamond && !getDefiContracts(sourceNetworkKey).lifi?.diamond) {
      throw new Error(`Bridging isn't configured for ${sourceNetwork.name} yet.`);
    }

    const provider = new ethers.JsonRpcProvider(sourceNetwork.rpcUrl, sourceNetwork.chainId);
    const signer = new ethers.Wallet(unlockedPrivateKey, provider);
    const fromAddress = await signer.getAddress();

    onStatus?.(`Fetching a LI.FI route from ${sourceNetwork.name}…`);
    const url = new URL(LIFI_QUOTE_API_URL);
    url.searchParams.set("fromChain", String(sourceNetwork.chainId));
    url.searchParams.set("toChain", String(destNetwork.chainId));
    url.searchParams.set("fromToken", tokenAddress);
    url.searchParams.set("toToken", destTokenAddress);
    url.searchParams.set("fromAmount", amountRaw);
    url.searchParams.set("fromAddress", fromAddress);
    url.searchParams.set("slippage", String(DEFAULT_SLIPPAGE));

    const response = await fetch(url);
    const quote = await response.json();
    if (!response.ok || !quote.transactionRequest) {
      throw new Error(quote.error || `LI.FI couldn't find a route from ${sourceNetwork.name} to ${destNetwork.name} for this asset.`);
    }

    const lifiDiamond = getDefiContracts(sourceNetworkKey).lifi?.diamond || sourceNetwork.lifiDiamond;
    onStatus?.(`Approving on ${sourceNetwork.name}…`);
    await ensureAllowance(signer, tokenAddress, quote.estimate?.approvalAddress || lifiDiamond, BigInt(amountRaw));

    onStatus?.(`Bridging from ${sourceNetwork.name} to ${destNetwork.name}…`);
    const txRequest = {
      to: quote.transactionRequest.to,
      data: quote.transactionRequest.data,
      value: quote.transactionRequest.value ? BigInt(quote.transactionRequest.value) : 0n
    };
    txRequest.gasLimit = await estimateGasPadded(() => signer.estimateGas(txRequest));
    const tx = await signer.sendTransaction(txRequest);
    await tx.wait();

    return { tx, sourceNetwork, destNetwork, estimatedToAmountRaw: quote.estimate?.toAmount || null };
  }

  // Called right before signing an x402 payment. If the target
  // network already has enough of the exact required asset, this is
  // a no-op (the common case). Otherwise it finds a stablecoin
  // balance elsewhere, bridges/swaps just enough of it into place via
  // bridgeAssetToTarget above, and polls the target balance until the
  // funds actually land, all inside this one call, one Hold-to-Confirm
  // covers both the routing and the payment that follows it.
  async function ensureFundsForX402(targetNetworkKey, assetAddress, requiredAmountRaw, onStatus) {
    const targetNetwork = getNetworkByKey(targetNetworkKey);
    const provider = new ethers.JsonRpcProvider(targetNetwork.rpcUrl, targetNetwork.chainId);
    const erc20 = new ethers.Contract(assetAddress, ERC20_ABI, provider);
    const address = await new ethers.Wallet(unlockedPrivateKey).getAddress();

    const currentBalance = await erc20.balanceOf(address);
    const required = BigInt(requiredAmountRaw);
    if (currentBalance >= required) return null; // already enough, nothing to route

    const shortfall = required - currentBalance;
    onStatus?.("Balance too low here, looking for funds on another network…");
    const candidates = await scanStablecoinBalances(targetNetworkKey);
    // A small margin over the raw shortfall, the bridge's own slippage
    // and fees eat a little of whatever gets sent, same reasoning as
    // scanForStrayBalances' gas reserve elsewhere in this file.
    const margin = shortfall / 20n; // 5%
    const candidate = candidates.find(c => c.balance >= shortfall + margin);
    if (!candidate) {
      throw new Error(`Not enough ${targetNetwork.nativeSymbol === "USDC" ? "USDC" : "funds"} on ${targetNetwork.name} to cover this payment, and no other network has enough of a stablecoin to cover the ${ethers.formatUnits(shortfall, 6)} shortfall automatically.`);
    }

    const { tx: bridgeTx, sourceNetwork } = await bridgeAssetToTarget({
      sourceNetworkKey: candidate.networkKey,
      tokenAddress: candidate.address,
      tokenDecimals: candidate.decimals,
      amountRaw: (shortfall + margin).toString(),
      destNetworkKey: targetNetworkKey,
      destTokenAddress: assetAddress,
    }, onStatus);

    onStatus?.(`Waiting for the bridged funds to arrive on ${targetNetwork.name}…`);
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      const balanceNow = await erc20.balanceOf(address);
      if (balanceNow >= required) {
        return { fromNetwork: sourceNetwork, fromSymbol: candidate.symbol, bridgeTxHash: bridgeTx.hash, amountRaw: (shortfall + margin).toString() };
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error(`The bridge from ${sourceNetwork.name} was sent (${explorerTx(bridgeTx.hash, sourceNetwork)}) but the funds hadn't arrived on ${targetNetwork.name} within 5 minutes. Try the payment again once it lands.`);
  }

  // Circle Nanopayments payment: no routing, no gas. The Gateway balance
  // (a prepaid USDC deposit) is re-checked right before signing, then the
  // EIP-3009 authorization is signed against the Gateway Wallet (see
  // signGatewayPayment) and sent through the same backend proxy.
  async function executeGatewayX402Ticket(ticket) {
    const { requirement, network } = ticket;

    setStatus("Checking your Nanopayments balance…");
    const balances = await fetchGatewayBalances(wallet.address);
    const available = balances[network.key] || 0;
    const needed = Number(ethers.formatUnits(requirement.amount, 6));
    if (available < needed) {
      logAuditEvent({ category: "x402", action: "pay", status: "failed", reason: "gateway_balance", url: ticket.url, networkKey: network.key, amountUSD: ticket.amountUSD });
      throw new Error(`Your Nanopayments balance on ${network.name} is too low for this ($${available} available, $${needed} needed). Deposit some USDC into it first.`);
    }
    advanceExecutionTo(0);

    setStatus("Signing the payment…");
    const signer = new ethers.Wallet(unlockedPrivateKey, new ethers.JsonRpcProvider(network.rpcUrl, network.chainId));
    const paymentPayload = await signGatewayPayment(signer, requirement, ticket.resourceInfo || { url: ticket.url });
    advanceExecutionTo(1);

    setStatus("Sending the payment…");
    const payRes = await fetch(`${API_BASE_URL}/api/x402/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: ticket.url, method: "GET", paymentHeader: encodePaymentHeader(paymentPayload) }),
    });
    const payResult = await payRes.json();

    if (!payRes.ok || payResult.status >= 400) {
      logAuditEvent({ category: "x402", action: "pay", status: "failed", reason: "resource_rejected", url: ticket.url, networkKey: network.key, amountUSD: ticket.amountUSD, meta: { method: "nanopayments", responseStatus: payResult.status } });
      throw new Error(payResult.error || describeSellerRejection(payResult.body) || `The service rejected the payment (status ${payResult.status}).`);
    }

    const settlement = decodePaymentResponseHeader(payResult.paymentResponseHeader);
    await advanceToDoneWithBeat(2);

    logAuditEvent({
      category: "x402",
      action: "pay",
      status: "success",
      url: ticket.url,
      networkKey: network.key,
      asset: "USDC",
      amount: ticket.amount,
      amountUSD: ticket.amountUSD,
      counterparty: requirement.payTo,
      txHash: /^0x[0-9a-fA-F]{64}$/.test(settlement?.transaction || "") ? settlement.transaction : null,
      meta: { method: "nanopayments", resourceBody: payResult.body },
    });

    return { settlement, routing: null, resourceBody: payResult.body };
  }

  // Deposits USDC into Circle's Gateway Wallet (approve, then deposit):
  // the one-time on-chain step that funds Nanopayments. Every payment after
  // it is a free signature.
  async function executeGatewayDepositTicket(ticket) {
    const network = ticket.network;
    const provider = new ethers.JsonRpcProvider(network.rpcUrl, network.chainId);
    const signer = new ethers.Wallet(unlockedPrivateKey, provider);
    const usdcAddress = GATEWAY_NETWORKS[ticket.networkKey].usdc;
    const amountRaw = BigInt(ticket.amountRaw);

    setStatus("Approving USDC for the Gateway…");
    advanceExecutionTo(0);
    await ensureAllowance(signer, usdcAddress, GATEWAY_WALLET_MAINNET, amountRaw);

    setStatus("Depositing into your Nanopayments balance…");
    advanceExecutionTo(1);
    const gateway = new ethers.Contract(GATEWAY_WALLET_MAINNET, GATEWAY_WALLET_ABI, signer);
    let gasLimit;
    try {
      gasLimit = await estimateGasPadded(() => gateway.deposit.estimateGas(usdcAddress, amountRaw));
    } catch {
      gasLimit = 150000n; // Circle's own client hardcodes ~120k for this call
    }
    const tx = await gateway.deposit(usdcAddress, amountRaw, { gasLimit });
    await tx.wait();
    await advanceToDoneWithBeat(2);

    logAuditEvent({
      category: "gateway",
      action: "deposit",
      status: "success",
      networkKey: ticket.networkKey,
      asset: "USDC",
      amount: ticket.amount,
      amountUSD: ticket.amountUSD,
      txHash: tx.hash,
    });
    return tx;
  }

  // The full x402 payment flow, one call, one Hold-to-Confirm: spend
  // limit -> biometric gate for large amounts -> smart liquidity
  // routing if the target network is short -> sign the EIP-3009
  // authorization locally -> retry the resource through the backend
  // proxy (see /api/x402/request, avoids CORS on whatever third-party
  // API this is) -> log it to the audit trail either way.
  async function executeX402Ticket(ticket) {
    const { requirement, network } = ticket;

    if (ticket.amountUSD > x402SpendLimitUSD) {
      const err = `This payment ($${ticket.amountUSD}) is above your x402 spending limit ($${x402SpendLimitUSD}). Raise it in Settings if you want to allow this.`;
      logAuditEvent({ category: "x402", action: "pay", status: "blocked", reason: "spend_limit", url: ticket.url, networkKey: network.key, amountUSD: ticket.amountUSD });
      throw new Error(err);
    }

    if (ticket.paymentMethod === "gateway") return executeGatewayX402Ticket(ticket);

    let routing = null;
    try {
      routing = await ensureFundsForX402(network.key, requirement.asset, requirement.amount, setStatus);
    } catch (e) {
      logAuditEvent({ category: "x402", action: "pay", status: "failed", reason: "routing", url: ticket.url, networkKey: network.key, amountUSD: ticket.amountUSD, meta: { error: e.message } });
      throw e;
    }
    advanceExecutionTo(0);

    setStatus("Signing the payment…");
    const signer = new ethers.Wallet(unlockedPrivateKey, new ethers.JsonRpcProvider(network.rpcUrl, network.chainId));
    const paymentPayload = await signX402Payment(signer, requirement, { url: ticket.url });
    advanceExecutionTo(1);

    setStatus("Sending the payment…");
    const payRes = await fetch(`${API_BASE_URL}/api/x402/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: ticket.url, method: "GET", paymentHeader: encodePaymentHeader(paymentPayload) }),
    });
    const payResult = await payRes.json();

    if (!payRes.ok || payResult.status >= 400) {
      logAuditEvent({ category: "x402", action: "pay", status: "failed", reason: "resource_rejected", url: ticket.url, networkKey: network.key, amountUSD: ticket.amountUSD, meta: { responseStatus: payResult.status } });
      throw new Error(payResult.error || describeSellerRejection(payResult.body) || `The resource server rejected the payment (status ${payResult.status}).`);
    }

    let settlement = decodePaymentResponseHeader(payResult.paymentResponseHeader);
    if (!settlement?.transaction) {
      // The server didn't tell us the settlement tx, find it on-chain
      // from the authorization we signed (see findEip3009SettlementTx).
      setStatus("Looking up the settlement transaction…");
      const foundTx = await findEip3009SettlementTx(signer.provider, requirement.asset, paymentPayload.payload.authorization);
      if (foundTx) settlement = { ...(settlement || {}), transaction: foundTx };
    }
    await advanceToDoneWithBeat(2);

    logAuditEvent({
      category: "x402",
      action: "pay",
      status: "success",
      url: ticket.url,
      networkKey: network.key,
      asset: ticket.symbol,
      amount: ticket.amount,
      amountUSD: ticket.amountUSD,
      counterparty: requirement.payTo,
      txHash: settlement?.transaction || null,
      meta: { bridgedFrom: routing?.fromNetwork?.key || null, resourceBody: payResult.body },
    });

    return { settlement, routing, resourceBody: payResult.body };
  }

  // ACP checkout completion: one Hold-to-Confirm, same spend limit as
  // any other x402 payment, sign the same EIP-3009 authorization, then
  // complete the checkout session instead of retrying a resource
  // fetch. No liquidity routing here (unlike x402 above) -- the demo
  // merchant never actually checks a balance before "settling" (same
  // no-real-settlement honesty as the x402 demo resource), so there's
  // nothing for it to route around.
  async function executeAcpTicket(ticket) {
    if (ticket.amountUSD > x402SpendLimitUSD) {
      const err = `This checkout ($${ticket.amountUSD}) is above your x402 spending limit ($${x402SpendLimitUSD}). Raise it in Settings if you want to allow this.`;
      logAuditEvent({ category: "acp", action: "checkout", status: "blocked", reason: "spend_limit", sessionId: ticket.sessionId, amountUSD: ticket.amountUSD });
      throw new Error(err);
    }

    setStatus("Signing the payment…");
    const signer = new ethers.Wallet(unlockedPrivateKey, new ethers.JsonRpcProvider(ticket.network.rpcUrl, ticket.network.chainId));
    const paymentPayload = await signX402Payment(signer, ticket.requirement, { url: `acp:${ticket.sessionId}` });
    advanceExecutionTo(0);

    setStatus("Completing the checkout…");
    let result;
    try {
      result = await completeCheckoutSession(ticket.sessionId, encodePaymentHeader(paymentPayload));
    } catch (e) {
      logAuditEvent({ category: "acp", action: "checkout", status: "failed", reason: "merchant_rejected", sessionId: ticket.sessionId, amountUSD: ticket.amountUSD, meta: { error: e.message } });
      throw e;
    }
    await advanceToDoneWithBeat(2);

    logAuditEvent({
      category: "acp",
      action: "checkout",
      status: "success",
      sessionId: ticket.sessionId,
      amountUSD: ticket.amountUSD,
      counterparty: ticket.payTo,
      meta: { lineItems: ticket.lineItems },
    });

    return result;
  }

  function describeBalances(list) {
    return list
      .map(s => `${Number(ethers.formatUnits(s.balance, s.decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${s.symbol} on ${s.networkName}`)
      .join(", ");
  }

  // Backs the manual "consolidate my X on Y" chat command. The
  // background auto-detect watch (see the poll effect further below)
  // doesn't go through this at all, it signs and sends directly
  // without a ticket, this is only for a deliberate manual request,
  // which still opens a normal hold-to-confirm ticket.
  function presentConsolidationCandidates(candidates, stray) {
    if (candidates.length === 0) {
      setMessages(m => [
        ...m,
        {
          role: "ai",
          text: stray.length === 0
            ? "No balances found on other chains to consolidate."
            : `Couldn't find a matching balance. You currently have: ${describeBalances(stray)}.`
        }
      ]);
      return;
    }

    if (candidates.length === 1) {
      pushActiveToCollapsedIfAny();
      setDefiTicket(buildConsolidateTicket(candidates[0]));
      return;
    }

    setMessages(m => [
      ...m,
      {
        role: "ai",
        text: `You have several balances on other chains: ${describeBalances(candidates)}. Tell me which one, e.g. "consolidate my ${candidates[0].symbol} on ${candidates[0].networkName}".`
      }
    ]);
  }

  // Polymarket only exists on Polygon, so this always signs against a
  // Polygon-specific signer, never activeNetwork's (the wallet could be
  // sitting on any other network when the user places a bet). The order
  // itself is an EIP-712 signature, not a plain transaction, verified
  // directly against Polymarket's own clob-client source (exchange
  // .order.const.ts / exchange.order.builder.ts) rather than guessed:
  // domain { name: "Polymarket CTF Exchange", version: "1", chainId,
  // verifyingContract } and the 12-field Order struct below.
  //
  // Submitting the signed order needs Polymarket's separate CLOB auth:
  // an L1 wallet signature derives an L2 API key/secret/passphrase,
  // then every request is HMAC-signed with that secret. These calls go
  // through this app's own backend now (/api/polymarket/clob-proxy),
  // not straight to clob.polymarket.com. They used to go direct,
  // relying on the browser's own DNS to sidestep the ISP-level DNS
  // hijack this dev machine hits on Polymarket's domains (see
  // DEV_DNS_OVERRIDE in server.js). Confirmed live that assumption
  // doesn't always hold, a browser can hit the exact same hijack. The
  // backend proxy forwards the request body as the exact raw bytes
  // received (never re-parsed/re-serialized), so the HMAC. Computed
  // here over the exact JSON string being sent. Still matches what
  // Polymarket receives.
  //
  // CLOB creds are re-derived each session (not persisted), a wallet
  // unlock is already the trust boundary for the private key itself.
  let cachedClobCreds = null;

  async function getOrDeriveClobCreds(signer) {
    if (cachedClobCreds) return cachedClobCreds;

    // Always the signer's own EOA address, even for a POLY_1271 (deposit
    // wallet) maker: confirmed straight from Polymarket's own official
    // Rust client (auth.rs's l1::create_headers, the one reference
    // implementation actually confirmed working for deposit-wallet
    // trading). It has no "funder"/maker override at all, always signs
    // and authenticates as signer.address(), a plain (never ERC-1271
    // wrapped) signature. The funder/signature type only matters later,
    // for the order itself (see resolvePolymarketMaker and
    // signPolymarketOrderERC1271 below); L1 auth is Polymarket's own
    // off-chain session bookkeeping, unrelated to which address the bet
    // is actually funded from. Setting address to the deposit wallet
    // here, or ERC-1271-wrapping this signature, both live-confirmed as
    // "Invalid L1 Request headers": Polymarket's server plainly
    // ecrecover()s this signature and expects it to match POLY_ADDRESS.
    const address = await signer.getAddress();
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = 0;
    const domain = { name: "ClobAuthDomain", version: "1", chainId: 137 };
    const types = {
      ClobAuth: [
        { name: "address", type: "address" },
        { name: "timestamp", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "message", type: "string" },
      ],
    };
    const value = {
      address,
      timestamp: String(timestamp),
      nonce,
      message: "This message attests that I control the given wallet",
    };
    const signature = await signer.signTypedData(domain, types, value);

    const l1Headers = {
      POLY_ADDRESS: address,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: String(timestamp),
      POLY_NONCE: String(nonce),
    };

    // Mirrors Polymarket's own createOrDeriveApiKey: try creating a
    // fresh key first, fall back to deriving the existing one (an
    // account that already has a key, e.g. from using Polymarket's own
    // site before, exactly this wallet's situation) if creation
    // reports no key.
    const createResponse = await fetch(`${API_BASE_URL}/api/polymarket/clob-proxy?path=/auth/api-key`, {
      method: "POST",
      headers: l1Headers,
      signal: AbortSignal.timeout(15000)
    });
    let creds = await createResponse.json().catch(() => null);

    if (!createResponse.ok || !creds?.apiKey) {
      const deriveResponse = await fetch(`${API_BASE_URL}/api/polymarket/clob-proxy?path=/auth/derive-api-key`, {
        method: "GET",
        headers: l1Headers,
        signal: AbortSignal.timeout(15000)
      });
      creds = await deriveResponse.json().catch(() => null);
      if (!deriveResponse.ok || !creds?.apiKey) {
        throw new Error(creds?.error || "Polymarket rejected the authentication request for this wallet.");
      }
    }

    cachedClobCreds = { key: creds.apiKey, secret: creds.secret, passphrase: creds.passphrase, address };
    return cachedClobCreds;
  }

  // Same HMAC scheme as Polymarket's own clob-client (src/signing/hmac.ts):
  // base64-decode the secret, HMAC-SHA256 over timestamp+method+path(+body),
  // base64-encode the result, then make it URL-safe (+/ -> -_, keep = padding).
  async function buildPolyHmacSignature(secret, timestamp, method, requestPath, body) {
    let message = String(timestamp) + method + requestPath;
    if (body !== undefined) message += body;

    const keyBytes = Uint8Array.from(atob(secret.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
    const sigBytes = new Uint8Array(signatureBuffer);
    let binary = "";
    for (const b of sigBytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
  }

  // The request body is NOT the raw signed order, confirmed from
  // clob-client-v2's own orderToJsonV2 (src/types/ordersV2.ts): wrapped
  // as {deferExec, postOnly, order: {...}, owner, orderType}, salt goes
  // in as a plain number (not the string used for the EIP-712 signature
  // itself), and side goes in as the string "BUY"/"SELL" rather than
  // the 0/1 used in the signed struct. expiration isn't part of the
  // signed struct (see POLYMARKET_ORDER_TYPES in config.js) but still
  // rides along in the API payload as unsigned metadata; "0" means no
  // expiration. There's no "taker" field in V2 at all.
  // orderType has no default on purpose: Lyra only ever places market
  // (FOK) orders, never a resting GTC/limit order, so every call site
  // states that explicitly instead of silently falling back to one.
  async function submitClobOrder(creds, signedOrder, orderType) {
    // Must be the same address the API key is bound to (see
    // getOrDeriveClobCreds above), not necessarily the signer's own EOA:
    // for a POLY_1271 maker that's the deposit wallet.
    const address = creds.address;
    const timestamp = Math.floor(Date.now() / 1000);
    const requestPath = "/order";
    const orderPayload = {
      deferExec: false,
      postOnly: false,
      order: {
        salt: Number(signedOrder.salt),
        maker: signedOrder.maker,
        signer: signedOrder.signer,
        tokenId: signedOrder.tokenId,
        makerAmount: signedOrder.makerAmount,
        takerAmount: signedOrder.takerAmount,
        side: signedOrder.side === POLYMARKET_ORDER_SIDE_BUY ? "BUY" : "SELL",
        signatureType: signedOrder.signatureType,
        timestamp: signedOrder.timestamp,
        expiration: "0",
        metadata: signedOrder.metadata,
        builder: signedOrder.builder,
        signature: signedOrder.signature,
      },
      owner: creds.key,
      orderType,
    };
    const body = JSON.stringify(orderPayload);
    const hmacSignature = await buildPolyHmacSignature(creds.secret, timestamp, "POST", requestPath, body);

    const response = await fetch(`${API_BASE_URL}/api/polymarket/clob-proxy?path=${requestPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        POLY_ADDRESS: address,
        POLY_SIGNATURE: hmacSignature,
        POLY_TIMESTAMP: String(timestamp),
        POLY_API_KEY: creds.key,
        POLY_PASSPHRASE: creds.passphrase,
      },
      body,
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error) {
      throw new Error(data?.error || data?.errorMsg || `Polymarket rejected the order (HTTP ${response.status}).`);
    }
    return data;
  }

  // Lists this account's open (unmatched/partially-matched) Polymarket
  // orders, straight from clob-client-v2's own client.orders() (GET
  // /data/orders, L2 HMAC auth, same scheme as submitClobOrder above).
  // "Cash out" on a bet that hasn't filled yet isn't a sell, it's
  // cancelling this resting order, which is why this looks the order up
  // fresh here instead of relying on any tokenId a chat ticket might
  // still have in memory (it usually won't, by the time someone asks).
  async function getOpenPolymarketOrders(signer) {
    const creds = await getOrDeriveClobCreds(signer);
    const requestPath = "/data/orders";
    const timestamp = Math.floor(Date.now() / 1000);
    const hmacSignature = await buildPolyHmacSignature(creds.secret, timestamp, "GET", requestPath, undefined);

    const response = await fetch(`${API_BASE_URL}/api/polymarket/clob-proxy?path=${requestPath}`, {
      method: "GET",
      headers: {
        POLY_ADDRESS: creds.address,
        POLY_SIGNATURE: hmacSignature,
        POLY_TIMESTAMP: String(timestamp),
        POLY_API_KEY: creds.key,
        POLY_PASSPHRASE: creds.passphrase,
      },
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error) {
      throw new Error(data?.error || `Couldn't read your open Polymarket orders (HTTP ${response.status}).`);
    }
    // Page<OpenOrderResponse> shape: { data: [...], next_cursor, ... }.
    return Array.isArray(data) ? data : (data?.data || []);
  }

  // Cancels one open order by id (DELETE /order, same endpoint
  // submitClobOrder posts to, straight from clob-client-v2's
  // cancel_order). No on-chain signature needed, an order that hasn't
  // matched yet never touched the exchange contract, this is purely
  // Polymarket's own off-chain orderbook bookkeeping.
  async function cancelPolymarketOrder(signer, creds, orderId) {
    const requestPath = "/order";
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ orderID: orderId });
    const hmacSignature = await buildPolyHmacSignature(creds.secret, timestamp, "DELETE", requestPath, body);

    const response = await fetch(`${API_BASE_URL}/api/polymarket/clob-proxy?path=${requestPath}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        POLY_ADDRESS: creds.address,
        POLY_SIGNATURE: hmacSignature,
        POLY_TIMESTAMP: String(timestamp),
        POLY_API_KEY: creds.key,
        POLY_PASSPHRASE: creds.passphrase,
      },
      body,
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error) {
      throw new Error(data?.error || `Polymarket couldn't cancel that order (HTTP ${response.status}).`);
    }
    return data;
  }

  // Standard Gnosis Safe v1.3.0 execTransaction ABI (the exact interface
  // deployed at legacy Polymarket accounts' Safes, confirmed live: the
  // Safe's own VERSION() call returns "1.3.0"). getTransactionHash is a
  // view function that computes the exact same EIP-712 hash the contract
  // itself checks the signature against, used below to cross-verify the
  // locally-signed hash before ever broadcasting a real transaction.
  const SAFE_ABI = [
    "function nonce() view returns (uint256)",
    "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)",
    "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
  ];
  // domain has no name/version for a Safe (confirmed from safe-global/
  // safe-smart-account v1.3.0's GnosisSafe.sol: DOMAIN_SEPARATOR_TYPEHASH
  // is keccak256("EIP712Domain(uint256 chainId,address verifyingContract)")),
  // unlike Polymarket's order domain above.
  const SAFE_TX_TYPES = {
    SafeTx: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
  };

  // Executes one transaction as the Safe (not as the wallet's own EOA):
  // the Safe holds the funds/allowances, an owner can only move them by
  // getting the Safe itself to call out, which needs this exact signed
  // "meta-transaction" flow, not a plain sendTransaction. threshold 1
  // here (confirmed live, single-owner Safe) means the owner's own
  // signature alone is enough, no other co-signers needed.
  //
  // safeTxGas/baseGas/gasPrice/gasToken/refundReceiver are all left at
  // their zero defaults: this only supports the owner calling
  // execTransaction directly from their own EOA and paying gas
  // themselves, not a gasless relayer flow, so there's nothing to refund.
  async function runSafeTransaction(signer, safeAddress, { to, value = 0n, data = "0x" }) {
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);
    const nonce = await safe.nonce();

    const txParams = {
      to,
      value,
      data,
      operation: 0, // Call (not DelegateCall)
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: ethers.ZeroAddress,
      refundReceiver: ethers.ZeroAddress,
      nonce,
    };

    const domain = { chainId: 137, verifyingContract: safeAddress };
    const signature = await signer.signTypedData(domain, SAFE_TX_TYPES, txParams);

    // Cross-check against the Safe contract's own hash computation before
    // ever broadcasting, same discipline used for the Polymarket order
    // above: if these don't match, something about the struct/domain is
    // wrong and it's far better to fail here than spend real gas on a
    // transaction the Safe will just reject.
    const onChainHash = await safe.getTransactionHash(
      txParams.to, txParams.value, txParams.data, txParams.operation,
      txParams.safeTxGas, txParams.baseGas, txParams.gasPrice,
      txParams.gasToken, txParams.refundReceiver, txParams.nonce
    );
    const localHash = ethers.TypedDataEncoder.hash(domain, SAFE_TX_TYPES, txParams);
    if (localHash.toLowerCase() !== onChainHash.toLowerCase()) {
      throw new Error("Safe transaction hash mismatch, refusing to submit (this would have failed on-chain anyway).");
    }

    const tx = await safe.execTransaction(
      txParams.to, txParams.value, txParams.data, txParams.operation,
      txParams.safeTxGas, txParams.baseGas, txParams.gasPrice,
      txParams.gasToken, txParams.refundReceiver, signature
    );
    const receipt = await tx.wait();
    return receipt;
  }

  // Approves a spender for `amount` of a token, but signed and executed
  // as the Safe rather than as the wallet's own EOA. Used when the
  // Polymarket "maker" is a Gnosis Safe (legacy pre-migration account):
  // the Safe's ERC-20 allowance is separate from its owner's, so a plain
  // ensureAllowance (which approves on behalf of its own signer) can't
  // reach it. Approves the exact amount needed, not an unlimited amount,
  // matching ensureAllowance's own behavior for the plain-EOA case.
  async function approveViaSafeTransaction(signer, safeAddress, tokenAddress, spender, amount) {
    const erc20Interface = new ethers.Interface(ERC20_ABI);
    const data = erc20Interface.encodeFunctionData("approve", [spender, amount]);
    return runSafeTransaction(signer, safeAddress, { to: tokenAddress, data });
  }

  // Moves an ERC-20 token out of the Safe to any recipient, signed and
  // executed as the Safe. Used for one-off recovery when funds land in a
  // legacy Polymarket Safe by mistake (e.g. a manual send to a stale
  // address instead of the current deposit wallet) rather than as a
  // regular betting flow.
  async function transferViaSafeTransaction(signer, safeAddress, tokenAddress, to, amount) {
    const erc20Interface = new ethers.Interface(ERC20_ABI);
    const data = erc20Interface.encodeFunctionData("transfer", [to, amount]);
    return runSafeTransaction(signer, safeAddress, { to: tokenAddress, data });
  }

  // Figures out who the actual order "maker" (fund source) should be
  // for this wallet, checked in the order Polymarket itself now expects:
  //
  // 1. Deposit wallet (mandatory since Polymarket's 2026 account-upgrade
  //    flow, see depositWalletFactory in config.js): its address is
  //    deterministic from the owner alone (predictWalletAddress, verified
  //    against a real deployed wallet's own WalletDeployed event), so
  //    this doesn't depend on the wallet actually having been migrated
  //    through Lyra, just on it existing on-chain already. signatureType
  //    POLY_1271, needs the ERC-1271 nested-signature wrapper below.
  // 2. Legacy Gnosis Safe (pre-migration, never upgraded): deployed at a
  //    deterministic address the exchange contract itself can compute
  //    (getSafeWalletAddress). Still a plain ECDSA signature from the
  //    owner, just verified against a different address (signatureType
  //    GNOSIS_SAFE).
  // 3. Plain EOA acting as its own maker, if neither of the above is
  //    deployed.
  async function resolvePolymarketMaker(signer, exchangeAddress, depositWalletFactoryAddress) {
    const signerAddress = await signer.getAddress();

    if (depositWalletFactoryAddress) {
      const factory = new ethers.Contract(depositWalletFactoryAddress, [
        "function predictWalletAddress(address,bytes32) view returns (address)",
        "function implementation() view returns (address)",
      ], signer.provider);
      const currentImplementation = await factory.implementation();
      const ownerAsId = ethers.zeroPadValue(signerAddress, 32);
      const depositWalletAddress = await factory.predictWalletAddress(currentImplementation, ownerAsId);
      const depositCode = await signer.provider.getCode(depositWalletAddress);
      if (depositCode && depositCode !== "0x") {
        return { maker: depositWalletAddress, signatureType: POLYMARKET_SIGNATURE_TYPE_POLY_1271 };
      }
    }

    const exchange = new ethers.Contract(exchangeAddress, ["function getSafeWalletAddress(address) view returns (address)"], signer.provider);
    const safeAddress = await exchange.getSafeWalletAddress(signerAddress);
    const code = await signer.provider.getCode(safeAddress);
    if (code && code !== "0x") {
      return { maker: safeAddress, signatureType: POLYMARKET_SIGNATURE_TYPE_GNOSIS_SAFE };
    }
    return { maker: signerAddress, signatureType: POLYMARKET_SIGNATURE_TYPE_EOA };
  }

  // Signs a Polymarket order for a POLY_1271 maker (a deposit wallet):
  // the exchange contract can't ecrecover a plain ECDSA signature against
  // a smart-contract-wallet maker, so it instead calls the wallet's own
  // isValidSignature(hash, signature), which expects Solady's ERC-7739
  // "nested typed data" wrapped format:
  //   innerSig(65) ‖ APP_DOMAIN_SEPARATOR(32) ‖ contents(32) ‖
  //   contentsType ‖ uint16(contentsType.length)
  // The subtle, easy-to-get-backwards part (got this wrong originally,
  // live-confirmed as "invalid POLY_1271 signature: non-owner signer
  // must use session-signer envelope". A real cryptographic mismatch,
  // not a Polymarket-side account limitation): the INNER signature is
  // NOT "sign a TypedDataSign struct under the deposit wallet's own
  // domain". It's a signature over one specific raw digest:
  //   keccak256(0x1901 ‖ APP_DOMAIN_SEPARATOR ‖ typedDataSignStructHash)
  // where APP_DOMAIN_SEPARATOR is the EXCHANGE's domain (matching what
  // gets embedded in the wrapped signature bytes above, and what the
  // contract's own reconstruction uses as the outer wrapper), and
  // typedDataSignStructHash is a plain struct hash whose FIELDS happen
  // to describe the deposit wallet's own domain (name/version/chainId/
  // verifyingContract=itself/salt). Those are just data inside the
  // hash, not the domain the digest itself is wrapped under. Signing
  // via signTypedData(depositWalletDomain, ...) as this used to do
  // wraps under the WRONG domain (the deposit wallet's, not the
  // exchange's), producing a signature that can never validate.
  // Verified field-for-field against Polymarket's own rs-clob-client-v2
  // (src/clob/client.rs's sign_poly1271_order, the one confirmed-working
  // reference implementation for deposit-wallet order signing), down to
  // the exact abi-encoded tuple and its field order.
  async function signPolymarketOrderERC1271(signer, exchangeAddress, order, depositWalletAddress) {
    const ORDER_TYPE_STRING = "Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)";
    const SOLADY_TYPE_STRING =
      "TypedDataSign(Order contents,string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)" +
      ORDER_TYPE_STRING;

    const contentsHash = ethers.TypedDataEncoder.hashStruct("Order", { Order: POLYMARKET_ORDER_TYPES.Order }, order);
    const appDomainSep = ethers.TypedDataEncoder.hashDomain({
      name: POLYMARKET_ORDER_DOMAIN_NAME,
      version: POLYMARKET_ORDER_DOMAIN_VERSION,
      chainId: 137,
      verifyingContract: exchangeAddress,
    });

    const typedDataSignStructHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "bytes32", "bytes32", "uint256", "address", "bytes32"],
        [
          ethers.keccak256(ethers.toUtf8Bytes(SOLADY_TYPE_STRING)),
          contentsHash,
          ethers.keccak256(ethers.toUtf8Bytes(POLYMARKET_DEPOSIT_WALLET_DOMAIN_NAME)),
          ethers.keccak256(ethers.toUtf8Bytes(POLYMARKET_DEPOSIT_WALLET_DOMAIN_VERSION)),
          137,
          depositWalletAddress,
          POLYMARKET_BYTES32_ZERO,
        ]
      )
    );
    const digest = ethers.keccak256(ethers.concat(["0x1901", appDomainSep, typedDataSignStructHash]));

    // A raw digest signature, not signTypedData/personal_sign: this
    // exact 32-byte value (not a re-wrapped or re-hashed version of it)
    // is what the contract's own reconstruction ecrecover()s against.
    // Only possible because signer here is always a local ethers.Wallet
    // holding the raw key directly (never a browser-injected provider),
    // matching signer.sign_hash() in the Rust reference.
    const innerSig = signer.signingKey.sign(digest).serialized;

    const contentsTypeHex = ethers.hexlify(ethers.toUtf8Bytes(ORDER_TYPE_STRING));
    const lenHex = ORDER_TYPE_STRING.length.toString(16).padStart(4, "0");

    return innerSig + appDomainSep.slice(2) + contentsHash.slice(2) + contentsTypeHex.slice(2) + lenHex;
  }

  function truncateToDecimals(num, decimals) {
    const factor = 10 ** decimals;
    return Math.floor(num * factor) / factor;
  }

  // Walks one side of a live order book from the best price outward,
  // accumulating accumulate(level) until it covers `target`, returning
  // that level's price. Straight from Polymarket's own rs-clob-client-v2
  // (src/clob/utilities.rs walk_levels), the exact mechanism their
  // official client uses to turn a "market order" into an actual
  // marketable limit price: bids/asks come back worst-price-first, so
  // walking from the end walks best-price-first. FOK semantics (this is
  // the only kind Lyra places): if the whole book can't cover the
  // target, there's no valid price, return null instead of the FAK
  // fallback (Polymarket's own worst-price-in-book compromise), a bet
  // that can't fully execute right now should say so, not partially
  // guess.
  function walkOrderBookLevels(levels, target, accumulate) {
    if (!levels?.length) return null;
    let total = 0;
    for (let i = levels.length - 1; i >= 0; i--) {
      total += accumulate(levels[i]);
      if (total >= target) return Number(levels[i].price);
    }
    return null;
  }

  // Fetches the live order book and returns the exact price a FOK
  // market order needs to guarantee `targetUsdOrShares` fills
  // immediately: for a BUY, walks asks accumulating notional (size ×
  // price) against a USD target; for a SELL, walks bids accumulating
  // shares against a share-count target (mirrors calculate_price in
  // Polymarket's own order_builder.rs).
  async function getPolymarketMarketablePrice(tokenId, side, targetUsdOrShares) {
    const response = await fetch(`${API_BASE_URL}/api/polymarket/clob-proxy?path=/book&token_id=${tokenId}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error("Couldn't read Polymarket's order book for this market.");
    }
    const book = await response.json();
    const levels = side === "BUY" ? book.asks : book.bids;
    const price = side === "BUY"
      ? walkOrderBookLevels(levels, targetUsdOrShares, l => Number(l.size) * Number(l.price))
      : walkOrderBookLevels(levels, targetUsdOrShares, l => Number(l.size));

    if (price == null) {
      throw new Error("Not enough liquidity in this market to fill the full amount right now. Try a smaller amount.");
    }
    return price;
  }

  // Amounts for a market order (the only kind Lyra places. No resting
  // limit/GTC orders at all, on purpose, so there's nothing for the AI
  // or the user to mix up between "bet" and "place a limit order").
  // Polymarket enforces a FIXED precision for a market order's amounts,
  // live-confirmed twice, worded identically for both sides just
  // naming whichever field is which: "maker amount supports a max
  // accuracy of 2 decimals, taker amount a max of 4 decimals". For a
  // BUY (maker=USD, taker=shares) and, symmetrically, a SELL
  // (maker=shares, taker=USD). Not tied to the market's own tick size
  // at all (an earlier version of this guessed a tick-scaled precision
  // straight from Polymarket's own Rust SDK internals and got exactly
  // this same rejection back), so there's no tick-size lookup here,
  // just this flat 2/4 rule applied to whichever quantity is on each
  // side.
  function buildMarketBuyAmounts(stakeAmount, price) {
    const rawMakerAmt = truncateToDecimals(stakeAmount, 2);
    const rawTakerAmt = truncateToDecimals(rawMakerAmt / price, 4);
    return { rawMakerAmt, rawTakerAmt };
  }

  function buildMarketSellAmounts(shareSize, price) {
    const rawMakerAmt = truncateToDecimals(shareSize, 2);
    const rawTakerAmt = truncateToDecimals(rawMakerAmt * price, 4);
    return { rawMakerAmt, rawTakerAmt };
  }

  async function executePredictionTicket(signer, ticket) {
    const usdce = TOKENS_BY_NETWORK.polygon?.USDCE;
    const polymarket = getDefiContracts("polygon").polymarket;
    if (!usdce?.address || !polymarket?.ctfExchange || !polymarket?.negRiskExchange) {
      throw new Error("Polymarket isn't configured yet.");
    }
    if (!ticket.tokenId) {
      throw new Error("Missing market data for this bet.");
    }
    // Same signed Order struct and domain for both, only the
    // verifyingContract differs, see the comment in config.js: a
    // neg-risk market (most team-sport matches, any group of markets
    // meant to sum to 100%) settles through the separate NegRiskExchange
    // instead of the plain CTFExchange.
    const exchangeAddress = ticket.negRisk ? polymarket.negRiskExchange : polymarket.ctfExchange;

    const stakeAmount = Number(ticket.amountUSD);
    if (!stakeAmount || stakeAmount <= 0) {
      throw new Error("Nothing to bet, the resolved stake came out to 0.");
    }

    advanceExecutionTo(0);
    setStatus("Checking Polymarket account…");
    const signerAddress = await signer.getAddress();
    const { maker, signatureType } = await resolvePolymarketMaker(signer, exchangeAddress, polymarket.depositWalletFactory);

    // Lyra places every bet as an immediate market order (FOK: fills
    // fully right now or not at all, never rests in the book), so the
    // ticket's own `price` (whatever the market showed back when it was
    // first prepared, possibly minutes ago) never gets signed here --
    // this walks the live order book for the exact price that
    // guarantees the full stake fills this instant, straight from
    // Polymarket's own market-order mechanism (rs-clob-client-v2's
    // calculate_price/walk_levels).
    setStatus("Checking the live market price…");
    const price = await getPolymarketMarketablePrice(ticket.tokenId, "BUY", stakeAmount);

    // A deposit wallet's real trading collateral is a separate token,
    // "pUSD" (see POLYMARKET_PUSD_COLLATERAL in config.js), not USDC.e,
    // confirmed from a real settled trade's on-chain transfers. A legacy
    // Gnosis Safe or plain EOA maker still trades USDC.e directly, that
    // part of the V1 architecture didn't change.
    const collateral = signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271 ? POLYMARKET_PUSD_COLLATERAL : usdce;

    const { rawMakerAmt, rawTakerAmt } = buildMarketBuyAmounts(stakeAmount, price);
    const makerAmount = ethers.parseUnits(rawMakerAmt.toFixed(6), collateral.decimals);
    const takerAmount = ethers.parseUnits(rawTakerAmt.toFixed(6), collateral.decimals);

    // The maker (fund source) is what needs the allowance, not
    // necessarily the signer, a Gnosis Safe or deposit wallet maker has
    // its own allowance separate from its owner's. ensureAllowance can
    // only approve on behalf of its own signer, so it only applies when
    // the wallet is its own maker (plain EOA case). A legacy Safe that
    // hasn't already approved this exchange gets a real Safe-executed
    // approve transaction instead (see approveViaSafeTransaction above).
    // A deposit wallet can't be approved from Lyra at all: its execute()
    // is restricted to onlyFactory (confirmed from its own verified
    // source), meaning only Polymarket's own relayer can trigger a batch
    // on it, there's no direct on-chain call Lyra can make. That one-time
    // approval has to happen on polymarket.com itself (placing even one
    // trade there sets it, and it's typically unlimited afterward).
    const collateralContract = new ethers.Contract(collateral.address, ERC20_ABI, signer);
    const currentAllowance = await collateralContract.allowance(maker, exchangeAddress);
    if (currentAllowance < makerAmount) {
      if (signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271) {
        throw new Error(
          `This Polymarket account hasn't approved ${collateral.symbol} spending to this exchange yet. Lyra can't set that up for a deposit wallet, place one small trade on polymarket.com first (it sets the approval), then try again here.`
        );
      }
      setStatus(`Approving ${collateral.symbol}…`);
      if (maker.toLowerCase() === signerAddress.toLowerCase()) {
        await ensureAllowance(signer, collateral.address, exchangeAddress, makerAmount);
      } else {
        await approveViaSafeTransaction(signer, maker, collateral.address, exchangeAddress, makerAmount);
      }
    }

    advanceExecutionTo(1);
    setStatus("Signing the Polymarket order…");

    // For POLY_1271 (deposit wallet), signer == maker: the order is
    // "signed by the wallet" (via ERC-1271), not by the owner EOA
    // directly, matching Polymarket's own clob-client-v2 (createOrder.ts:
    // "for POLY_1271, both maker and signer in the order are the wallet
    // address").
    const orderSigner = signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271 ? maker : signerAddress;
    const order = {
      salt: Math.round(Math.random() * Date.now()).toString(),
      maker,
      signer: orderSigner,
      tokenId: ticket.tokenId,
      makerAmount: makerAmount.toString(),
      takerAmount: takerAmount.toString(),
      side: POLYMARKET_ORDER_SIDE_BUY,
      signatureType,
      timestamp: Date.now().toString(),
      metadata: POLYMARKET_BYTES32_ZERO,
      builder: POLYMARKET_BYTES32_ZERO,
    };

    let signature;
    if (signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271) {
      signature = await signPolymarketOrderERC1271(signer, exchangeAddress, order, maker);
    } else {
      const domain = {
        name: POLYMARKET_ORDER_DOMAIN_NAME,
        version: POLYMARKET_ORDER_DOMAIN_VERSION,
        chainId: 137,
        verifyingContract: exchangeAddress,
      };
      signature = await signer.signTypedData(domain, POLYMARKET_ORDER_TYPES, order);
    }
    const signedOrder = { ...order, signature };

    console.log("Polymarket signed order:", signedOrder);

    setStatus("Authenticating with Polymarket…");
    const creds = await getOrDeriveClobCreds(signer);

    setStatus("Placing the bet…");
    const result = await submitClobOrder(creds, signedOrder, "FOK");
    console.log("Polymarket order result:", result);

    // Only declared done once the bet is actually placed, not before
    // (this used to reach the sentinel here-ish but before submission
    // even started, showing "done" while the order was still in
    // flight).
    await advanceToDoneWithBeat(2);

    return result;
  }

  const CONDITIONAL_TOKENS_ABI = [
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function setApprovalForAll(address operator, bool approved)",
  ];

  // Cashing out a live (unresolved) position: a SELL order, mirror image
  // of executePredictionTicket above. The maker now puts up the
  // outcome-token shares themselves rather than USDC.e, so what needs
  // approving is different too: setApprovalForAll on ConditionalTokens
  // (the position is an ERC-1155, not the ERC-20 USDC.e approval a buy
  // needs), same maker-resolution and order-signing machinery otherwise.
  async function executeCashoutTicket(signer, ticket) {
    const polymarket = getDefiContracts("polygon").polymarket;
    if (!polymarket?.ctfExchange || !polymarket?.negRiskExchange || !polymarket?.conditionalTokens) {
      throw new Error("Polymarket isn't configured yet.");
    }
    if (!ticket.tokenId || !ticket.size) {
      throw new Error("Missing position data for this cash-out.");
    }
    const exchangeAddress = ticket.negRisk ? polymarket.negRiskExchange : polymarket.ctfExchange;

    const shareSize = Number(ticket.size);
    if (!shareSize || shareSize <= 0) {
      throw new Error("Nothing to cash out, this position's size came out to 0.");
    }

    advanceExecutionTo(0);
    setStatus("Checking Polymarket account…");
    const signerAddress = await signer.getAddress();
    const { maker, signatureType } = await resolvePolymarketMaker(signer, exchangeAddress, polymarket.depositWalletFactory);

    // Same market-order reasoning as executePredictionTicket: cashing
    // out is a SELL FOK against the live order book, not the position's
    // last-known curPrice (from whenever the Predictions tab last
    // fetched it).
    setStatus("Checking the live market price…");
    const price = await getPolymarketMarketablePrice(ticket.tokenId, "SELL", shareSize);

    // Shares are always 6-decimal amounts in Polymarket's own order math
    // (same as the USDC.e side of a buy), regardless of maker type. A
    // position isn't collateral, so the pUSD-vs-USDC.e split that
    // applies to a buy's maker/collateral doesn't apply here.
    const { rawMakerAmt, rawTakerAmt } = buildMarketSellAmounts(shareSize, price);
    const makerAmount = ethers.parseUnits(rawMakerAmt.toFixed(6), 6);
    const takerAmount = ethers.parseUnits(rawTakerAmt.toFixed(6), 6);

    // Same reasoning as the USDC.e allowance in executePredictionTicket:
    // the maker (share holder) is what needs to have approved the
    // exchange, and a deposit wallet can't be approved from Lyra at all
    // (onlyFactory execute()). If it hasn't already approved this
    // exchange for its CTF positions (via polymarket.com), there's
    // nothing Lyra can do about it here either.
    const conditionalTokens = new ethers.Contract(polymarket.conditionalTokens, CONDITIONAL_TOKENS_ABI, signer);
    const isApproved = await conditionalTokens.isApprovedForAll(maker, exchangeAddress);
    if (!isApproved) {
      if (signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271) {
        throw new Error(
          "This Polymarket account hasn't approved its positions for trading on this exchange yet. Lyra can't set that up for a deposit wallet, place one small sell on polymarket.com first (it sets the approval), then try again here."
        );
      }
      setStatus("Approving your position for trading…");
      if (maker.toLowerCase() === signerAddress.toLowerCase()) {
        const gasLimit = await estimateGasPadded(() => conditionalTokens.setApprovalForAll.estimateGas(exchangeAddress, true));
        const tx = await conditionalTokens.setApprovalForAll(exchangeAddress, true, { gasLimit });
        await tx.wait();
      } else {
        const data = conditionalTokens.interface.encodeFunctionData("setApprovalForAll", [exchangeAddress, true]);
        await runSafeTransaction(signer, maker, { to: polymarket.conditionalTokens, data });
      }
    }

    advanceExecutionTo(1);
    setStatus("Signing the Polymarket order…");

    const orderSigner = signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271 ? maker : signerAddress;
    const order = {
      salt: Math.round(Math.random() * Date.now()).toString(),
      maker,
      signer: orderSigner,
      tokenId: ticket.tokenId,
      makerAmount: makerAmount.toString(),
      takerAmount: takerAmount.toString(),
      side: POLYMARKET_ORDER_SIDE_SELL,
      signatureType,
      timestamp: Date.now().toString(),
      metadata: POLYMARKET_BYTES32_ZERO,
      builder: POLYMARKET_BYTES32_ZERO,
    };

    let signature;
    if (signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271) {
      signature = await signPolymarketOrderERC1271(signer, exchangeAddress, order, maker);
    } else {
      const domain = {
        name: POLYMARKET_ORDER_DOMAIN_NAME,
        version: POLYMARKET_ORDER_DOMAIN_VERSION,
        chainId: 137,
        verifyingContract: exchangeAddress,
      };
      signature = await signer.signTypedData(domain, POLYMARKET_ORDER_TYPES, order);
    }
    const signedOrder = { ...order, signature };

    console.log("Polymarket signed sell order:", signedOrder);

    setStatus("Authenticating with Polymarket…");
    const creds = await getOrDeriveClobCreds(signer);

    setStatus("Cashing out…");
    const result = await submitClobOrder(creds, signedOrder, "FOK");
    console.log("Polymarket sell order result:", result);

    await advanceToDoneWithBeat(2);

    return result;
  }

  async function executeDefiTicket() {
    if (!unlockedPrivateKey) {
      throw new Error("Wallet locked.");
    }
    if (!defiTicket) {
      throw new Error("No ticket DeFi is pending.");
    }

    setBusy(true);
    setStatus("Preparing the transaction…");

    const featureLabel = { swap: "Swap", bridge: "Bridge", staking: "Stake", prediction: "Bet", "cancel-prediction": "Cancel bet", "cashout-prediction": "Cash out", "safe-recovery": "Recovery", "receive-fiat": "Receive", consolidate: "Consolidate", x402: "x402 Payment", acp: "ACP Checkout", "gateway-deposit": "Nanopayments deposit" }[defiTicket.feature] || "Transaction";
    setExecutionLabel(featureLabel);
    setExecutionSteps(stepsForDefiTicket(defiTicket));
    setExecutionStepIndex(-1);
    beginExecutionTimer();

    // Wallet-wide "large amount" biometric gate, on top of Hold-to-
    // Confirm, not just for x402 (executeX402Ticket does its own
    // separate check for the spend-limit specifically). Best-effort
    // USD estimate: a ticket that already computed one (prediction,
    // receive-fiat, x402) uses that; a stablecoin amount elsewhere is
    // its own USD value; anything else (a volatile asset with no
    // price lookup handy here) is skipped rather than guessed.
    const STABLE_SYMBOLS = ["USDC", "USDC.e", "USDT", "USDT0", "EURC", "DAI"];
    const estimatedUSD = defiTicket.amountUSD ?? (STABLE_SYMBOLS.includes(defiTicket.asset) ? Number(defiTicket.amount) : NaN);
    try {
      await requireBiometricForLargeAmount(estimatedUSD);
    } catch (e) {
      setBusy(false);
      setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
      return;
    }

    try {
      const signer = new ethers.Wallet(unlockedPrivateKey, RPC);
      let tx;

      if (defiTicket.feature === "swap") {
        tx = await executeSwapTicket(signer, defiTicket);
      } else if (defiTicket.feature === "staking") {
        tx = defiTicket.intent === "UNSTAKE_XPL"
          ? await executeUnstakeTicket(signer, defiTicket)
          : await executeStakeTicket(signer, defiTicket);
      } else if (defiTicket.feature === "bridge") {
        tx = await executeBridgeTicket(signer, defiTicket);
      } else if (defiTicket.feature === "cancel-prediction") {
        // Same off-chain reasoning as prediction below: cancelling a
        // resting order is pure Polymarket orderbook bookkeeping, no
        // on-chain transaction involved at all.
        advanceExecutionTo(0);
        const polygonNetwork = getNetworkByKey("polygon");
        const polygonProvider = new ethers.JsonRpcProvider(polygonNetwork.rpcUrl, polygonNetwork.chainId);
        const polygonSigner = new ethers.Wallet(unlockedPrivateKey, polygonProvider);
        const creds = await getOrDeriveClobCreds(polygonSigner);
        await cancelPolymarketOrder(polygonSigner, creds, defiTicket.orderId);
        // Only step in this ticket (stepsForDefiTicket's own single-item
        // list for this feature): advance past its length so the
        // checklist shows done instead of sitting on an eternal spinner,
        // nothing else ever marks it so.
        await advanceToDoneWithBeat(1);

        // A cancelled order really is gone from Polymarket's own book,
        // it won't come back on the next refetch either, drop it now
        // instead of leaving it looking "opened" until the tab reloads.
        setPredictionsList(list => list.filter(item => item.orderId !== defiTicket.orderId));

        setStatus("Order cancelled");
        setMessages(m => [...m, { role: "ai", text: "✅ Order cancelled. Your reserved funds are back in your Polymarket balance." }]);
        logAuditEvent({ category: "predictions", action: "cancel", networkKey: "polygon", meta: { orderId: defiTicket.orderId } });
        return;
      } else if (defiTicket.feature === "cashout-prediction") {
        const polygonNetwork = getNetworkByKey("polygon");
        const polygonProvider = new ethers.JsonRpcProvider(polygonNetwork.rpcUrl, polygonNetwork.chainId);
        const polygonSigner = new ethers.Wallet(unlockedPrivateKey, polygonProvider);
        const orderResult = await executeCashoutTicket(polygonSigner, defiTicket);

        // Polymarket's own positions data won't reflect this sell
        // immediately (matching + settlement take a moment), so mark it
        // locally rather than waiting on a refetch that would still show
        // "live" for a while. This is Lyra's own bookkeeping, not
        // something re-derived from Polymarket, it resets on the next
        // tab reload.
        setPredictionsList(list => list.map(item =>
          item.tokenId === defiTicket.tokenId ? { ...item, status: "cashed-out" } : item
        ));

        setStatus("Cashed out");
        setMessages(m => [...m, { role: "ai", text: `✅ Cash-out order placed on Polymarket.${orderResult?.orderId ? ` Order ID: ${shortAddress(orderResult.orderId)}` : ""}` }]);
        logAuditEvent({ category: "predictions", action: "cashout", networkKey: "polygon", meta: { orderId: orderResult?.orderId } });
        return;
      } else if (defiTicket.feature === "prediction") {
        // Always Polygon, regardless of activeNetwork, Polymarket has
        // no presence on any other chain. Not a blockchain transaction
        // in the same sense as the others below, order placement is
        // off-chain (CLOB matching + Polymarket's own settlement), so
        // there's no tx hash/receipt to wait on here, handled as its
        // own branch instead of falling into the shared tx.hash path.
        const polygonNetwork = getNetworkByKey("polygon");
        const polygonProvider = new ethers.JsonRpcProvider(polygonNetwork.rpcUrl, polygonNetwork.chainId);
        const polygonSigner = new ethers.Wallet(unlockedPrivateKey, polygonProvider);
        const orderResult = await executePredictionTicket(polygonSigner, defiTicket);

        setStatus("Bet placed");
        setMessages(m => [...m, { role: "ai", text: `✅ Bet placed on Polymarket.${orderResult?.orderId ? ` Order ID: ${shortAddress(orderResult.orderId)}` : ""}` }]);
        logAuditEvent({ category: "predictions", action: "bet", networkKey: "polygon", amountUSD: defiTicket.amountUSD, meta: { orderId: orderResult?.orderId } });
        return;
      } else if (defiTicket.feature === "safe-recovery") {
        // Same off-Polygon-regardless reasoning as prediction above:
        // this only ever concerns the legacy Polymarket Safe, which only
        // exists on Polygon. A Safe transaction (runSafeTransaction)
        // already awaits its own receipt, so this is its own branch
        // rather than the shared tx.hash/tx.wait() path below.
        const polygonNetwork = getNetworkByKey("polygon");
        const polygonProvider = new ethers.JsonRpcProvider(polygonNetwork.rpcUrl, polygonNetwork.chainId);
        const polygonSigner = new ethers.Wallet(unlockedPrivateKey, polygonProvider);
        const receipt = await transferViaSafeTransaction(
          polygonSigner,
          defiTicket.fromSafe,
          defiTicket.tokenAddress,
          defiTicket.toAddress,
          BigInt(defiTicket.amountRaw)
        );

        setTxHash(receipt.hash);
        await advanceToDoneWithBeat(1);
        setStatus("Funds recovered");
        setMessages(m => [...m, { role: "ai", text: `✅ ${defiTicket.amount} USDC.e sent to ${defiTicket.toLabel}.\n\n[View on Explorer Here](${explorerTx(receipt.hash, polygonNetwork)})` }]);
        return;
      } else if (defiTicket.feature === "receive-fiat") {
        // Demo-only simulation: no real on-ramp provider (Circle,
        // MoonPay, Transak, etc.) is wired in yet, see the RECEIVE_FIAT
        // note in server.js. Nothing on-chain happens here, no real
        // money moves, this just walks the same checklist timeline a
        // real provider's webhook would eventually drive.
        advanceExecutionTo(0);
        await new Promise(resolve => setTimeout(resolve, 900));
        advanceExecutionTo(1);
        await new Promise(resolve => setTimeout(resolve, 900));
        await advanceToDoneWithBeat(3);

        setStatus("Payment received");
        setMessages(m => [...m, { role: "ai", text: `✅ $${defiTicket.amountUSD} received and converted to ${defiTicket.amountUSD} USDC.e (demo. No real on-ramp provider connected yet).` }]);
        return;
      } else if (defiTicket.feature === "consolidate") {
        const { tx: consolidateTx, estimatedToAmount } = await executeConsolidateTicket(defiTicket);
        const consolidateSourceNetwork = resolveAnyNetwork(defiTicket.sourceNetworkKey);

        setTxHash(consolidateTx.hash);
        setStatus("Consolidated");
        setMessages(m => [...m, { role: "ai", text: `✅ ${defiTicket.amountDisplay} ${defiTicket.symbol} from ${defiTicket.networkName} bridged into ${estimatedToAmount ?? "~"} USDT0 on Plasma.\n\n[View on Explorer Here](${explorerTx(consolidateTx.hash, consolidateSourceNetwork)})` }]);
        return;
      } else if (defiTicket.feature === "gateway-deposit") {
        setTxHash("");
        const depositTx = await executeGatewayDepositTicket(defiTicket);
        setTxHash(depositTx.hash);
        setStatus("Deposited");
        const gatewayInfo = GATEWAY_NETWORKS[defiTicket.networkKey];
        // Fast chains credit within seconds: wait briefly and confirm it.
        let credited = false;
        if (/second/.test(gatewayInfo.creditTime)) {
          for (let i = 0; i < 10 && !credited; i++) {
            const balances = await fetchGatewayBalances(wallet.address);
            credited = (balances[defiTicket.networkKey] || 0) >= Number(defiTicket.amount) * 0.999;
            if (!credited) await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
        setMessages(m => [...m, {
          role: "ai",
          text: `✅ Deposited ${defiTicket.amount} USDC into your Nanopayments balance on ${defiTicket.network.name}. ${credited ? "It's credited and ready to use." : `It will be credited in ${gatewayInfo.creditTime}.`} Now ask me to pay for an x402 service, no gas needed.\n\n[View transaction Here](${explorerTx(depositTx.hash, defiTicket.network)})`
        }]);
        return;
      } else if (defiTicket.feature === "x402") {
        setTxHash("");
        const { settlement, routing, resourceBody } = await executeX402Ticket(defiTicket);
        // The recap's explorer link reads txHash: point it at THIS
        // payment's settlement, never at whatever an earlier bridge or
        // send left there.
        // Only a real 32-byte hash can be linked: a Nanopayments payment is
        // settled in a batch and may not have a transaction of its own.
        const settlementHash = /^0x[0-9a-fA-F]{64}$/.test(settlement?.transaction || "") ? settlement.transaction : null;
        setTxHash(settlementHash || "");
        setStatus("Payment sent");
        const explanation = await explainPurchasedContent({
          url: defiTicket.url,
          description: defiTicket.resourceDescription,
          amountText: `${defiTicket.amount} ${defiTicket.symbol}`,
          body: resourceBody
        });
        const routedNote = routing ? ` (after automatically bridging ${defiTicket.symbol} in from ${routing.fromNetwork.name})` : "";
        setMessages(m => [...m, {
          role: "ai",
          text: `✅ Paid ${defiTicket.amount} ${defiTicket.symbol} to unlock ${defiTicket.url}${routedNote}${defiTicket.paymentMethod === "gateway" ? " from your Nanopayments balance (settled in a batch, so there's no separate on-chain transaction for this payment)" : ""}.${explanation ? `\n\nWhat you got: ${explanation}` : formatPurchasedContent(resourceBody)}${settlementHash ? `\n\n[View settlement Here](${explorerTx(settlementHash, defiTicket.network)})` : ""}`
        }]);
        return;
      } else if (defiTicket.feature === "acp") {
        setTxHash("");
        await executeAcpTicket(defiTicket);
        setStatus("Checkout completed");
        setMessages(m => [...m, {
          role: "ai",
          text: `✅ Checkout complete: ${defiTicket.lineItems.map(li => `${li.quantity}× ${li.name}`).join(", ")} for $${defiTicket.amountUSD}.`
        }]);
        return;
      } else {
        throw new Error("Unknown DeFi operation type.");
      }

      setTxHash(tx.hash);
      setStatus("Transaction sent");

      setMessages(m => [
        ...m,
        { role: "ai", text: `Transaction sent. Hash: ${shortAddress(tx.hash)}` }
      ]);

      await tx.wait();

      setStatus("Transaction confirmed");

      setMessages(m => [...m, { role: "ai", text: `✅ Transaction confirmed on ${activeNetwork.name}.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

      logAuditEvent({
        category: defiTicket.feature,
        action: defiTicket.intent || defiTicket.feature,
        networkKey: activeNetworkKey,
        asset: defiTicket.asset,
        amount: defiTicket.amount,
        txHash: tx.hash,
      });

      await refreshBalance(signer.address);

      // Ticket stays open with the checklist fully checked, the
      // user closes it manually (Done button) once they've seen it.

    } finally {
      await finishExecution();
    }
  }

  // Reads the exact amount of `tokenAddress` the receipt's logs show
  // arriving at `ownerAddress`, the reliable way to know "how much did
  // this step actually produce" (a swap's output, an Aave withdrawal)
  // instead of a before/after balance diff, which a stale RPC read or
  // unrelated wallet activity can silently turn into a wrong number.
  // Returns null if no matching Transfer log is found (e.g. the asset
  // is the native coin, which doesn't emit one) so the caller can fall
  // back to a balance diff for that case.
  function readReceivedAmount(receipt, tokenAddress, ownerAddress) {
    if (!tokenAddress) return null;
    const iface = new ethers.Interface(ERC20_ABI);
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) continue;
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "Transfer" && parsed.args.to.toLowerCase() === ownerAddress.toLowerCase()) {
          return parsed.args.value;
        }
      } catch {
        // Not a Transfer log (or from a different ABI), skip it.
      }
    }
    return null;
  }

  async function executeMultiTicket() {
    if (!unlockedPrivateKey) {
      throw new Error("Wallet locked.");
    }
    if (!multiTicket || !multiTicket.steps?.length) {
      throw new Error("No plan pending.");
    }

    setBusy(true);
    beginExecutionTimer();

    try {
      const signer = new ethers.Wallet(unlockedPrivateKey, RPC);
      let carriedAmount = null; // real measured amount from the previous step, if any

      async function balanceOfAsset(asset) {
  if (asset === activeNetwork.nativeSymbol) {
    return RPC.getBalance(signer.address);
  }
  const token = tokens[asset];
  if (!token?.address) return 0n;
  const contract = new ethers.Contract(token.address, ERC20_ABI, RPC);
  return contract.balanceOf(signer.address);
}

function decimalsOfAsset(asset) {
  return asset === activeNetwork.nativeSymbol ? 18 : (tokens[asset]?.decimals ?? 18);
}

            for (let i = 0; i < multiTicket.steps.length; i++) {
        const step = multiTicket.steps[i];
        const stepLabel = `Step ${i + 1}/${multiTicket.steps.length}`;
        setStatus(`${stepLabel}…`);

        if (i === 0) {
          // Very first step: transition already handled by the
          // existing useEffect (plan -> step 1).
          setExecutionLabel(`${stepLabel} · ${step.kind}`);
          setExecutionSteps(stepsForPlanStep(step));
          setExecutionStepIndex(-1);
          setPlanStepIndex(0);
        } else {
          // Later steps: switch directly to this step, exactly like
          // Hold-to-Confirm -> Step 1, the checklist is updated right
          // below (following lines) and the light band plays on top of
          // it on its own timer, never pausing the real execution flow.
          // The previous step's duration therefore has no influence on
          // it.
          setStepSweepActive(true);
          setTimeout(() => setStepSweepActive(false), 2400);
        }
        setPlanStepIndex(i);

        // Refresh the checklist for whichever plan step is currently
        // running, so the user always sees the real sub-actions for
        // the action in progress (e.g. Approve + Swap for step 2/3).
        setExecutionLabel(`${stepLabel} · ${step.kind}`);
        setExecutionSteps(stepsForPlanStep(step));
        setExecutionStepIndex(-1);

        if (step.kind === "send") {
          const recipient = step.recipient;
          if (!recipient || !ethers.isAddress(recipient)) {
            throw new Error(`${stepLabel}: missing or invalid recipient.`);
          }

          const amountToUse = (carriedAmount !== null && step.amountIsEstimate) ? carriedAmount : step.amount;
          if (!amountToUse || Number(amountToUse) <= 0) {
            throw new Error(`${stepLabel}: no amount to send.`);
          }

          let tx;
          if (step.asset === activeNetwork.nativeSymbol) {
            tx = await signer.sendTransaction(withNonceOverride({
              to: recipient,
              value: ethers.parseEther(String(amountToUse))
            }));
          } else {
            const token = tokens[step.asset];
            if (!token?.address) throw new Error(`${stepLabel}: ${step.asset} isn't supported.`);
            const contract = new ethers.Contract(token.address, ERC20_ABI, signer);
            tx = await contract.transfer(recipient, ethers.parseUnits(String(amountToUse), token.decimals), withNonceOverride({}));
          }

          setTxHash(tx.hash);
          setStepTxHashes(prev => { const next = [...prev]; next[i] = tx.hash; return next; });
          setMessages(m => [...m, { role: "ai", text: `${stepLabel} sent (send). Hash: ${shortAddress(tx.hash)}` }]);
          await tx.wait();
          advanceExecutionTo(1);
          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} confirmed.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

          carriedAmount = null;

        } else if (step.kind === "swap") {
          const stepTicket = { ...step.ticket, amount: (carriedAmount !== null && step.amountIsEstimate) ? carriedAmount : step.amount, asset: step.asset, tokenOutSymbol: step.tokenOutSymbol };
          const before = await balanceOfAsset(step.tokenOutSymbol);

          const tx = await executeSwapTicket(signer, stepTicket);
          setTxHash(tx.hash);
          setStepTxHashes(prev => { const next = [...prev]; next[i] = tx.hash; return next; });
          setMessages(m => [...m, { role: "ai", text: `${stepLabel} sent (swap). Hash: ${shortAddress(tx.hash)}` }]);
          const receipt = await tx.wait();

          // Prefer the exact amount from the swap's own Transfer event.
          // A before/after balance diff is fragile (a slightly stale RPC
          // read, or unrelated activity on the wallet in between, can
          // silently read back 0, which then gets staked/bridged as a
          // literal zero-amount transaction downstream). Only fall back
          // to the balance diff when there's no ERC-20 log to read (the
          // output is the native coin, which doesn't emit one).
          const isNativeOut = step.tokenOutSymbol === activeNetwork.nativeSymbol;
          const tokenOutAddress = !isNativeOut ? tokens[step.tokenOutSymbol]?.address : null;
          let received = readReceivedAmount(receipt, tokenOutAddress, signer.address);

          if (received === null) {
            const after = await balanceOfAsset(step.tokenOutSymbol);
            received = after > before ? after - before : 0n;
          }

          carriedAmount = Number(ethers.formatUnits(received, decimalsOfAsset(step.tokenOutSymbol)));

          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} confirmed and received ${carriedAmount} ${step.tokenOutSymbol}.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

        } else if (step.kind === "stake" || step.kind === "unstake") {
          const stepTicket = { ...step.ticket, amount: (carriedAmount !== null && step.amountIsEstimate) ? carriedAmount : step.amount, asset: step.asset, intent: step.intent };
          const tx = step.kind === "unstake"
            ? await executeUnstakeTicket(signer, stepTicket)
            : await executeStakeTicket(signer, stepTicket);

          setTxHash(tx.hash);
          setStepTxHashes(prev => { const next = [...prev]; next[i] = tx.hash; return next; });
          setMessages(m => [...m, { role: "ai", text: `${stepLabel} sent (${step.kind}). Hash: ${shortAddress(tx.hash)}` }]);
          const receipt = await tx.wait();

          if (step.kind === "unstake") {
            // No amount was necessarily specified up front (executeUnstakeTicket
            // may have withdrawn the entire staked balance via Aave's max-uint256
            // convention), read the real amount that actually landed in the
            // wallet so a step chained after this one (e.g. "withdraw my USDC,
            // then swap it") uses the real number instead of the placeholder 0.
            const withdrawnTokenAddress = tokens[step.asset]?.address;
            const received = readReceivedAmount(receipt, withdrawnTokenAddress, signer.address);
            carriedAmount = received !== null ? Number(ethers.formatUnits(received, decimalsOfAsset(step.asset))) : null;
          } else {
            carriedAmount = null;
          }

          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} confirmed.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

                } else if (step.kind === "bridge") {
          const stepTicket = { ...step.ticket, amount: (carriedAmount !== null && step.amountIsEstimate) ? carriedAmount : step.amount, asset: step.asset, destinationChainKey: step.destinationChainKey };
          const tx = await executeBridgeTicket(signer, stepTicket);

          setTxHash(tx.hash);
          setStepTxHashes(prev => { const next = [...prev]; next[i] = tx.hash; return next; });
          setMessages(m => [...m, { role: "ai", text: `${stepLabel} sent (bridge). Hash: ${shortAddress(tx.hash)}` }]);
          await tx.wait();
          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} confirmed.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

          carriedAmount = null;
        }

        if (i < multiTicket.steps.length - 1) {
          // The next loop iteration immediately resets executionStepIndex
          // for the next step, with nothing async in between, that reset
          // and this step's own advanceExecutionTo() land in the same
          // React batch, so the just-earned checkmark never actually gets
          // painted. This pause forces a real render in between so it does.
          await new Promise(resolve => setTimeout(resolve, DONE_TRANSITION_BEAT_MS));
        }
      }

      setStatus("Plan completed");
      setMessages(m => [...m, { role: "ai", text: `✅ All ${multiTicket.steps.length} steps completed on ${activeNetwork.name}.` }]);

      await refreshBalance(signer.address);
      await refreshTokenBalances(signer.address);

      // Same beat as every step-to-step handoff: let the last step's own
      // checkmark be seen for a moment, then sweep the frame one last
      // time and swap straight to the full-plan recap, same non-blocking
      // pattern, the wave plays on its own timer instead of gating this.
      await new Promise(resolve => setTimeout(resolve, DONE_TRANSITION_BEAT_MS));
      setStepSweepActive(true);
      setTimeout(() => setStepSweepActive(false), 2400);
      setMultiTicketDone(true);

      // Ticket stays open with the recap fully shown, the user closes it
      // manually (Done button) once they've seen it.

    } finally {
      await finishExecution();
    }
  }

  // Real max-sendable native-coin amount: current balance minus a
  // safety-padded gas reserve. The gas estimate itself is exact (a
  // plain transfer's cost doesn't depend on the amount, and estimating
  // against the real recipient also covers a contract wallet needing
  // more than a bare 21000), only the fee RATE gets padded (+30%), to
  // absorb normal base-fee drift between this estimate and whenever
  // the user actually confirms. Shared by the SEND_XPL ticket-display
  // computation and signAndSend's live recompute right before signing.
  async function estimateMaxSendableNative(recipient) {
    const [rawBalance, feeData, gasEstimate] = await Promise.all([
      RPC.getBalance(wallet.address),
      RPC.getFeeData(),
      RPC.estimateGas({ from: wallet.address, to: recipient, value: 1n }).catch(() => 21000n)
    ]);

    const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
    const reserve = gasEstimate * (feePerGas * 130n / 100n);

    if (rawBalance <= reserve) {
      throw new Error(`Your ${activeNetwork.nativeSymbol} balance is too low to cover the network fee, there's nothing left to send.`);
    }

    return ethers.formatEther(rawBalance - reserve);
  }

  async function signAndSend() {
  if (multiTicket) {
    return executeMultiTicket();
  }

  if (defiTicket) {
    return executeDefiTicket();
  }

  if (!wallet?.address) {
    throw new Error("Wallet not connected.");
  }

  if (!ethers.isAddress(sendTo)) {
    throw new Error("Invalid recipient address.");
  }

  if (!sendAmount || Number(sendAmount) <= 0) {
    throw new Error("Invalid amount.");
  }

  const STABLE_SYMBOLS_SEND = ["USDC", "USDC.e", "USDT", "USDT0", "EURC", "DAI"];
  const sendEstimatedUSD = sendAssetSymbol === activeNetwork.nativeSymbol
    ? Number(sendAmount) * xplPriceUSD
    : STABLE_SYMBOLS_SEND.includes(sendAssetSymbol) ? Number(sendAmount) : NaN;
  await requireBiometricForLargeAmount(sendEstimatedUSD);

  // isTokenSend (module-level derived value): true when sendToken
  // names a real ERC-20 on this network (see the SEND_XPL case where
  // sendAsset gets captured), false falls through to the native coin.
  // This used to always send the native coin regardless of what asset
  // the ticket actually showed, silently sending the wrong thing for
  // any token request.

  setBusy(true);
  setStatus("Preparing the transaction…");
  setExecutionLabel("Send");
  setExecutionSteps([`Send ${sendAssetSymbol}`]);
  setExecutionStepIndex(-1);
  beginExecutionTimer();

  try {
    const savedWallet = loadSavedWallet();

    if (!unlockedPrivateKey) {
  throw new Error("Wallet locked.");
}

const signer = new ethers.Wallet(
  unlockedPrivateKey,
  RPC
);

    let tx;

    if (isTokenSend) {
      const contract = new ethers.Contract(sendToken.address, ERC20_ABI, signer);
      const current = await contract.balanceOf(signer.address);
      // A "send max" token transfer uses the live balance directly
      // (no gas reserve needed, the token amount itself never pays
      // the network fee) rather than round-tripping through the
      // display string, which avoids leaving dust behind from a
      // formatUnits/parseUnits rounding step.
      const value = sendIsMax ? current : ethers.parseUnits(sendAmount, sendToken.decimals);

      if (current < value) {
        throw new Error(`Insufficient ${sendAssetSymbol} balance for this transfer.`);
      }

      setStatus("Sending the transaction…");
      tx = await contract.transfer(sendTo, value, withNonceOverride({}));
    } else {
      const current = await RPC.getBalance(signer.address);
      let value;

      if (sendIsMax) {
        // Recompute live instead of trusting sendAmount: that number
        // was only an estimate from whenever the ticket was built, and
        // "send everything" has to still hold true however long the
        // user took to review and hold-to-confirm it, not just at the
        // moment the ticket was shown.
        const feeData = await RPC.getFeeData();
        const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
        const gasEstimate = await RPC.estimateGas({ from: signer.address, to: sendTo, value: 1n }).catch(() => 21000n);
        const reserve = gasEstimate * (feePerGas * 130n / 100n);

        if (current <= reserve) {
          throw new Error(`Your ${activeNetwork.nativeSymbol} balance is too low to cover the network fee, there's nothing left to send.`);
        }

        value = current - reserve;
      } else {
        value = ethers.parseEther(sendAmount);

        if (current < value) {
          throw new Error(`Insufficient ${activeNetwork.nativeSymbol} balance for this transfer.`);
        }
      }

      setStatus("Sending the transaction…");
      tx = await signer.sendTransaction(withNonceOverride({ to: sendTo, value }));
    }

    setTxHash(tx.hash);
    setStatus("Transaction sent");

    setMessages(m => [
      ...m,
      {
        role: "ai",
        text: `Transaction sent. Hash: ${shortAddress(tx.hash)}`
      }
    ]);

    await tx.wait();

    setStatus("Transaction confirmed");

   setMessages(m => [...m, { role: "ai", text: `✅ Transaction confirmed on ${activeNetwork.name}. ${sendAmount} ${sendAssetSymbol} were sent.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

    logAuditEvent({ category: "send", action: "send", networkKey: activeNetworkKey, asset: sendAssetSymbol, amount: sendAmount, counterparty: sendTo, txHash: tx.hash });

    await advanceToDoneWithBeat(1);

    await refreshBalance(signer.address);

    setShowDetails(false);
    // Ticket stays open (showSend stays true) with the checklist
    // fully checked, the user closes it manually (Done button).

  } finally {
    await finishExecution();
  }
}

  // A bare "Failed to fetch" (fetch() itself rejecting, not an HTTP
  // error status) means the browser couldn't complete some request at
  // all: dropped connection, backend/dev-server restart, or the
  // request just sat too long on a slow/unstable network hop (the
  // Polymarket bet flow alone makes several real round trips: ticket
  // prep is multiple sequential AI tool-use turns, and signing hits
  // Polygon RPC plus Polymarket's own CLOB auth/order endpoints).
  // Surfacing the raw browser message isn't actionable, so reword it.
  // ethers v6 tags most on-chain/provider errors with a machine-
  // readable "code" (INSUFFICIENT_FUNDS, CALL_EXCEPTION, etc.). Left
  // alone, e.message on those is often a multi-line JSON-RPC error
  // blob (gas estimates, hex revert data, an internal request id),
  // meaningless and alarming to someone who isn't a developer. Map the
  // common ones to plain language the user can actually act on, and
  // only fall back to the raw message for genuinely unrecognized cases.
  function friendlyErrorText(e) {
    if (e.message === "Failed to fetch") {
      return "❌ Lost connection before this could finish (this can happen on a slow network, some of these requests need several round trips). Please try again.";
    }

    switch (e.code) {
      case "INSUFFICIENT_FUNDS":
        return "❌ Not enough funds to cover this, including the network fee. Add a bit more and try again.";
      case "NONCE_EXPIRED":
      case "REPLACEMENT_UNDERPRICED":
        return "❌ Another transaction from this wallet is already pending. Wait for it to confirm, then try again.";
      case "UNPREDICTABLE_GAS_LIMIT":
      case "CALL_EXCEPTION":
        return "❌ The network rejected this transaction, it would have failed on-chain (often a contract restriction or a stale quote). Try again, or with a smaller amount.";
      case "NETWORK_ERROR":
      case "TIMEOUT":
      case "SERVER_ERROR":
        return "❌ Couldn't reach the network in time. Please try again in a moment.";
      default:
        // e.shortMessage (ethers v6) is already a clean one-liner when
        // present, prefer it over the full e.message.
        return `❌ ${e.shortMessage || e.message}`;
    }
  }

  async function askAI(text) {
  try {
    setBusy(true);
    setStatus("Lyra redefine...");

    setMessages(m => [
      ...m,
      { role: "user", text }
    ]);

    const response = await fetch(`${API_BASE_URL}/api/ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
      message: text,
      walletAddress: wallet?.address || null,
      balance: fmtXpl(balance),
      history: messages,
      pendingTransaction,
      contacts: loadContacts(),
      network: activeNetworkKey
    })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "AI error.");
    }

    if (data.suggestedContact) {
  const alreadySaved = loadContacts().some(
    c => c.address.toLowerCase() === data.suggestedContact.address.toLowerCase()
  );

  if (!alreadySaved) {
    setSuggestedContact(data.suggestedContact);
    setContactSaved(false);
  }
}

    if (data.message && data.intent !== "GET_TRANSACTIONS") {
  setMessages(m => [
    ...m,
    {
      role: "ai",
      text: data.message
    }
  ]);

  const typingDuration = data.message.length * 12 + 500;
  await new Promise(resolve => setTimeout(resolve, typingDuration));
}

await executeAIIntent(data);

  } catch (e) {
    console.error(e);

    setMessages(m => [
      ...m,
      { role: "ai", text: friendlyErrorText(e) }
    ]);

    setStatus("Error");
  } finally {
    setBusy(false);
  }
}

function findLookalikeMatch(candidate, contacts, ownAddress) {
  const known = contacts.map(c => ({ label: `your saved contact "${c.name}"`, address: c.address }));
  if (ownAddress) {
    known.push({ label: "your own wallet address", address: ownAddress });
  }

  const c = candidate.toLowerCase();

  for (const k of known) {
    const a = k.address.toLowerCase();
    if (a === c) continue;
    const prefixMatch = a.slice(0, 6) === c.slice(0, 6);
    const suffixMatch = a.slice(-4) === c.slice(-4);
    if (prefixMatch && suffixMatch) {
      return k.label;
    }
  }

  return null;
}

async function checkAddressAndProceed(address, proceed) {
  const currentContacts = loadContacts();

  const alreadyKnown = currentContacts.some(
    c => c.address.toLowerCase() === address.toLowerCase()
  );
  if (alreadyKnown) {
    proceed();
    return;
  }

  const reasons = [];

  const lookalike = findLookalikeMatch(address, currentContacts, wallet?.address);
  if (lookalike) {
    reasons.push(`This address is nearly identical to ${lookalike}, but is not the same address, a common address-poisoning scam.`);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/address-check/${address}?network=${activeNetworkKey}`);
    const data = await response.json();
    if (data.suspicious && Array.isArray(data.reasons)) {
      reasons.push(...data.reasons);
    }
  } catch (e) {
    console.error("On-chain address check unavailable, proceeding without it:", e);
  }

  if (reasons.length > 0) {
    setAddressCheck({ address, reasons, proceed });
  } else {
    proceed();
  }
}

async function executeAIIntent(action) {
  // See SCAM AWARENESS in server.js: the classifier still resolves
  // and returns the normal intent alongside this, Lyra can't actually
  // stop someone from sending their own funds wherever they choose,
  // only make the risk impossible to miss before they get there.
  if (action.scamWarning) {
    setMessages(m => [
      ...m,
      {
        role: "ai",
        variant: "warning",
        text: `⚠️ ${action.scamWarning}\n\nLegitimate support, giveaways, and platforms never ask for this. If you're at all unsure, stop here and verify independently before continuing.`
      }
    ]);
  }

  switch (action.intent) {
    case "GET_BALANCE":
    case "REFRESH_BALANCE":
      await refreshBalance();
      break;

    case "GET_ADDRESS":
      if (!wallet?.address) {
        setMessages(m => [
          ...m,
          {
            role: "ai",
            text: "You need to create a wallet first."
          }
        ]);
        return;
      }

      setMessages(m => [
        ...m,
        {
          role: "ai",
          text: `Your address is ${wallet.address}`
        }
      ]);
      break;

    case "RECEIVE_XPL": {
      if (!wallet?.address) {
        setMessages(m => [
          ...m,
          { role: "ai", text: "You need to create or import a wallet first." }
        ]);
        return;
      }

      pushActiveToCollapsedIfAny();

      // One universal receive QR: this address already works on every
      // EVM chain and any token, so there's no separate "crypto only"
      // vs "any chain" variant to choose between anymore. Anything
      // that lands on Plasma itself just shows up as a normal
      // balance; anything landing on another chain gets picked up by
      // the auto-consolidate watch below and bridged into USDT0 on
      // Plasma automatically.
      const qr = await generateAddressQRCode(wallet.address, 150);

      setDefiTicket({
        feature: "receive-any-chain",
        intent: "RECEIVE_XPL",
        executable: false,
        qrCode: qr,
        platform: "Lyra Universal Receive",
        riskLevel: "low"
      });

      // Baseline the watch right now, at the moment the QR is
      // actually requested, not on login: only a balance that grows
      // PAST this snapshot counts as "just arrived" for the poll
      // effect below, so anything already sitting on another chain
      // before this point (e.g. Predictions' own Polygon funds) never
      // gets treated as a fresh deposit.
      const baseline = await scanForStrayBalances();
      const snapshot = {};
      for (const item of baseline) snapshot[`${item.networkKey}:${item.symbol}`] = item.balance.toString();
      prevStrayBalancesRef.current = snapshot;
      setAwaitingDeposit(true);

      break;
    }

    case "RECEIVE_FIAT": {
      if (!wallet?.address) {
        setMessages(m => [
          ...m,
          { role: "ai", text: "You need to create or import a wallet first." }
        ]);
        return;
      }

      const amountUSD = action.amountUSD || null;

      if (!amountUSD) {
        setMessages(m => [
          ...m,
          { role: "ai", text: action.message || "How much would you like to receive?" }
        ]);
        return;
      }

      pushActiveToCollapsedIfAny();

      // No real on-ramp provider (Circle, MoonPay, Transak, etc.) is
      // wired in yet, see the RECEIVE_FIAT note in server.js. This
      // reference is a demo-only payment link, never fetched, just
      // encoded into the QR for the ticket to display.
      const refId = Math.random().toString(36).slice(2, 10).toUpperCase();
      const qr = await generateAddressQRCode(`https://pay.lyra.wallet/r/${refId}`, 150);

      setDefiTicket({
        feature: "receive-fiat",
        intent: "RECEIVE_FIAT",
        executable: true,
        amountUSD,
        refId,
        qrCode: qr,
        platform: "Lyra Cash-to-Crypto (demo)",
        fees: "No fees in demo mode",
        riskLevel: "low"
      });

      break;
    }

    case "CONSOLIDATE_FUNDS": {
      if (!wallet?.address) {
        setMessages(m => [
          ...m,
          { role: "ai", text: "You need to create or import a wallet first." }
        ]);
        return;
      }

      setStatus("Scanning other networks for balances…");
      const stray = await scanForStrayBalances();

      // The model doesn't always use our exact keys for the extra
      // chains ("bnb", "binance", "BNB Chain" for bsc...), and an
      // unknown key used to filter out a balance that was really there.
      const CONSOLIDATE_NETWORK_ALIASES = {
        bnb: "bsc", binance: "bsc", "bnb chain": "bsc", "bnb smart chain": "bsc", "binance smart chain": "bsc",
        arb: "arbitrum", "arbitrum one": "arbitrum",
        op: "optimism",
        avax: "avalanche", "avalanche c-chain": "avalanche",
        eth: "ethereum", matic: "polygon", xpl: "plasma",
      };
      const rawNetwork = action.network ? String(action.network).toLowerCase().trim() : null;
      const requestedNetworkKey = rawNetwork ? (CONSOLIDATE_NETWORK_ALIASES[rawNetwork] || rawNetwork) : null;
      const requestedAsset = action.asset ? String(action.asset).toUpperCase() : null;

      let candidates = stray;
      if (requestedAsset) candidates = candidates.filter(c => c.symbol.toUpperCase() === requestedAsset);
      // A network name we still can't match shouldn't hide the balance:
      // only narrow by network when that leaves something to show.
      if (requestedNetworkKey) {
        const onNetwork = candidates.filter(c => c.networkKey === requestedNetworkKey);
        if (onNetwork.length > 0 || !requestedAsset) candidates = onNetwork;
      }

      presentConsolidationCandidates(candidates, stray);
      break;
    }

        case "OPEN_WALLET":
      setShowWallet(true);
      break;

    case "OPEN_CONTACTS":
      setContacts(loadContacts());
      setMenuOpen(false);
      setShowContacts(true);
      break;

    case "OPEN_TRANSACTION_HISTORY":
      setMenuOpen(false);
      openTxHistory();
      break;

    case "OPEN_SETTINGS":
      setMenuOpen(false);
      setShowSettings(true);
      break;

    case "LOCK_WALLET":
      lockWallet();
      break;

    case "GATEWAY_BALANCE": {
      if (!wallet?.address) {
        setMessages(m => [...m, { role: "ai", text: "Create or unlock a wallet first, then I can check your Nanopayments balance." }]);
        return;
      }
      setStatus("Checking your Nanopayments balance…");
      try {
        const balances = await fetchGatewayBalances(wallet.address);
        const funded = Object.entries(balances).filter(([, v]) => v > 0);
        const text = funded.length
          ? `Your Nanopayments balance: ${funded.map(([k, v]) => `${v} USDC on ${getNetworkByKey(k).name}`).join(", ")}. It pays for x402 services with no gas fees.`
          : `Your Nanopayments balance is empty. Say "deposit 1 USDC into my nanopayments balance on Arc" to fill it, Arc credits in about a second.`;
        setMessages(m => [...m, { role: "ai", text }]);
      } catch (e) {
        console.error(e);
        setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
      }
      setStatus("Ready");
      break;
    }

    case "GATEWAY_DEPOSIT": {
      if (!unlockedPrivateKey) {
        setMessages(m => [...m, { role: "ai", text: "Unlock your wallet first so I can prepare that deposit." }]);
        return;
      }
      const depositAmount = Number(action.amount ?? action.amountUSD);
      if (!(depositAmount > 0)) {
        setMessages(m => [...m, { role: "ai", text: "How much USDC do you want to deposit into your Nanopayments balance? Tell me the amount and I'll prepare it right away." }]);
        return;
      }
      const requestedKey = String(action.network || "").toLowerCase();
      const depositKey = GATEWAY_NETWORKS[requestedKey] ? requestedKey : (GATEWAY_NETWORKS[activeNetworkKey] ? activeNetworkKey : "arc");
      const depositNetwork = getNetworkByKey(depositKey);

      try {
        const provider = new ethers.JsonRpcProvider(depositNetwork.rpcUrl, depositNetwork.chainId);
        const usdc = new ethers.Contract(GATEWAY_NETWORKS[depositKey].usdc, ERC20_ABI, provider);
        const have = await usdc.balanceOf(wallet.address);
        const amountRaw = ethers.parseUnits(String(depositAmount), 6);
        if (have < amountRaw) {
          setMessages(m => [...m, { role: "ai", text: `You only have ${ethers.formatUnits(have, 6)} USDC on ${depositNetwork.name}, not ${depositAmount}. Try a smaller amount, or another network (Nanopayments works on Arc, Polygon, Base and Ethereum).` }]);
          return;
        }
        pushActiveToCollapsedIfAny();
        setDefiTicket({
          feature: "gateway-deposit",
          intent: "GATEWAY_DEPOSIT",
          executable: true,
          network: depositNetwork,
          networkKey: depositKey,
          symbol: "USDC",
          amount: String(depositAmount),
          amountRaw: amountRaw.toString(),
          amountUSD: depositAmount,
          platform: "Circle Gateway (Nanopayments)",
          fees: "Network fee for 2 transactions (approve, then deposit)",
          riskLevel: "low",
          riskReason: "Your USDC stays yours: it sits in Circle's Gateway Wallet contract and can be withdrawn",
          summary: `Deposit ${depositAmount} USDC into your Nanopayments balance on ${depositNetwork.name}`,
        });
      } catch (e) {
        console.error(e);
        setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
      }
      break;
    }

    case "OPEN_SEED_EXPORT":
      setMenuOpen(false);
      setShowSettings(false);
      setExportSeedPassword("");
      setExportedSeed(null);
      setExportSeedError("");
      setRevealExportedSeed(false);
      setShowExportSeed(true);
      break;

    case "OPEN_MULTISIG_SETUP":
      setMenuOpen(false);
      if (!isSafeSupportedNetwork(activeNetworkKey)) {
        setMessages(m => [...m, { role: "ai", text: `Multisig isn't available on ${activeNetwork.name} yet. Switch to ${SAFE_SUPPORTED_NETWORK_KEYS.map(k => getNetworkByKey(k).name).join(", ")} first, then ask me again.` }]);
        return;
      }
      setShowSettings(false);
      setMultisigSetupError("");
      setShowMultisigSetup(true);
      break;

    case "OPEN_AUDIT_TRAIL":
      setMenuOpen(false);
      setAuditLogEntries(loadAuditLog());
      setShowAuditLog(true);
      break;

    case "SWITCH_NETWORK": {
  const targetKey = (action.network || "").toLowerCase();
  const target = NETWORKS.find(n => n.key === targetKey || n.name.toLowerCase() === targetKey);

  if (!target) {
    setMessages(m => [...m, {
      role: "ai",
      text: `${action.network || "This network"} isn't available yet.`
    }]);
    return;
  }
  if (target.key === activeNetworkKey) {
    setMessages(m => [...m, { role: "ai", text: `You're already on ${target.name}.` }]);
    return;
  }

  switchNetwork(target.key);
  setMessages(m => [...m, { role: "ai", text: `Switched to ${target.name}.` }]);
  break;
}

    case "OPEN_MULTISIG": {
  let targetNetworkKey = null;
  if (action.network) {
    const key = action.network.toLowerCase();
    const target = NETWORKS.find(n => n.key === key || n.name.toLowerCase() === key);
    if (!target) {
      setMessages(m => [...m, { role: "ai", text: `${action.network} isn't a network I recognize.` }]);
      return;
    }
    targetNetworkKey = target.key;
  }

  const safe = targetNetworkKey
    ? multisigSafes.find(s => s.network === targetNetworkKey)
    : multisigSafes.find(s => s.network === activeNetworkKey) || (multisigSafes.length === 1 ? multisigSafes[0] : null);

  if (safe) {
    setMessages(m => [...m, { role: "ai", text: `Here's your multisig on ${getNetworkByKey(safe.network).name}.` }]);
    openMultisigManage(safe);
  } else if (!targetNetworkKey && multisigSafes.length > 1) {
    setMessages(m => [...m, { role: "ai", text: `You have multisigs on ${multisigSafes.map(s => getNetworkByKey(s.network).name).join(", ")}. Which one?` }]);
  } else {
    // Straight to the multisig screen itself, not the general
    // Settings list it lives inside of, "open my multisig" means the
    // multisig, not a menu they'd still have to scroll through.
    const resolvedNetworkKey = targetNetworkKey || activeNetworkKey;
    const network = getNetworkByKey(resolvedNetworkKey);

    if (!isSafeSupportedNetwork(resolvedNetworkKey)) {
      setMessages(m => [...m, { role: "ai", text: `Multisig isn't available on ${network.name} yet.` }]);
      return;
    }
    if (resolvedNetworkKey !== activeNetworkKey) {
      switchNetwork(resolvedNetworkKey);
    }

    setMessages(m => [...m, { role: "ai", text: `You don't have a multisig on ${network.name} yet, here's how to set one up.` }]);
    setMultisigSetupError("");
    setShowMultisigSetup(true);
  }
  break;
}

    case "MULTISIG_ADD_OWNER": {
  if (!unlockedPrivateKey) {
    setMessages(m => [...m, { role: "ai", text: "Unlock your wallet first so I can prepare that." }]);
    return;
  }

  let targetNetworkKey = activeNetworkKey;
  if (action.network) {
    const key = action.network.toLowerCase();
    const target = NETWORKS.find(n => n.key === key || n.name.toLowerCase() === key);
    if (!target) {
      setMessages(m => [...m, { role: "ai", text: `${action.network} isn't a network I recognize.` }]);
      return;
    }
    targetNetworkKey = target.key;
  }

  const targetSafe = multisigSafes.find(s => s.network === targetNetworkKey);
  if (!targetSafe) {
    setMessages(m => [...m, { role: "ai", text: `You don't have a multisig on ${getNetworkByKey(targetNetworkKey).name} yet. Set one up first in Settings.` }]);
    return;
  }

  const requested = Array.isArray(action.multisigNewOwners) ? action.multisigNewOwners : [];
  if (requested.length === 0) {
    setMessages(m => [...m, { role: "ai", text: "Who would you like to add?" }]);
    return;
  }

  // Resolved here, never by the AI itself: it never sees the user's
  // contacts, exactly the same reasoning as SEND_XPL's own
  // contactName handling elsewhere in this file.
  const contacts = loadContacts();
  const resolvedOwners = [];
  for (const entry of requested) {
    if (entry.address) {
      if (!ethers.isAddress(entry.address)) {
        setMessages(m => [...m, { role: "ai", text: `"${entry.address}" isn't a valid address.` }]);
        return;
      }
      resolvedOwners.push({ name: entry.name || null, address: entry.address });
    } else if (entry.name) {
      const match = contacts.find(c => c.name.toLowerCase() === entry.name.toLowerCase());
      if (!match) {
        setMessages(m => [...m, { role: "ai", text: `I don't know ${entry.name}'s address yet. What's their address?` }]);
        return;
      }
      resolvedOwners.push({ name: entry.name, address: match.address });
    }
  }

  let safeInfo;
  try {
    safeInfo = await getSafeInfo({ networkKey: targetSafe.network, safeAddress: targetSafe.address });
  } catch (e) {
    console.error(e);
    setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
    return;
  }

  const currentOwnersLower = safeInfo.owners.map(o => o.toLowerCase());
  const alreadyOwners = resolvedOwners.filter(o => currentOwnersLower.includes(o.address.toLowerCase()));
  if (alreadyOwners.length > 0) {
    const names = alreadyOwners.map(o => o.name || shortAddress(o.address)).join(", ");
    setMessages(m => [...m, { role: "ai", text: `${names} ${alreadyOwners.length > 1 ? "are" : "is"} already an owner of that multisig.` }]);
    return;
  }

  if (safeInfo.owners.length + resolvedOwners.length > MULTISIG_MAX_OWNERS) {
    setMessages(m => [...m, { role: "ai", text: `A multisig can have at most ${MULTISIG_MAX_OWNERS} owners, adding ${resolvedOwners.length} more would go over that.` }]);
    return;
  }

  const ownerNames = resolvedOwners.map(o => o.name || shortAddress(o.address)).join(" and ");
  setMessages(m => [...m, {
    role: "ai",
    text: `Preparing the request to add ${ownerNames} to your ${getNetworkByKey(targetSafe.network).name} multisig. This still needs ${safeInfo.threshold > 1 ? "the other owner(s)" : "confirmation"} to approve, same as any transfer.`
  }]);

  try {
    const signer = multisigSigner(targetSafe.network);
    let nonce = await getNextNonce({ networkKey: targetSafe.network, safeAddress: targetSafe.address });

    for (const owner of resolvedOwners) {
      await proposeAddOwner({
        networkKey: targetSafe.network,
        safeAddress: targetSafe.address,
        signer,
        newOwner: owner.address,
        newThreshold: safeInfo.threshold,
        nonce,
      });
      nonce += 1n;
      logAuditEvent({ category: "multisig", action: "add_owner", networkKey: targetSafe.network, counterparty: owner.address, meta: { safe: targetSafe.address } });
    }

    setMessages(m => [...m, {
      role: "ai",
      text: resolvedOwners.length > 1 ? "Done, both requests are now waiting for approval." : "Done, the request is now waiting for approval."
    }]);
    openMultisigManage(targetSafe);
  } catch (e) {
    console.error(e);
    setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
  }
  break;
}

    case "PAY_X402": {
      if (!unlockedPrivateKey) {
        setMessages(m => [...m, { role: "ai", text: "Unlock your wallet first so I can check that resource." }]);
        return;
      }
      const rawX402Url = (action.x402Url || "").trim();
      if (!rawX402Url) {
        setMessages(m => [...m, { role: "ai", text: "What's the URL of the paid resource you'd like me to pay for?" }]);
        return;
      }
      // The demo resource is given as a path ("/api/x402/demo-resource"),
      // relative to Lyra's own backend, not a full URL, resolve it
      // against API_BASE_URL so it's a real absolute URL the proxy's
      // own URL() parsing (and every downstream fetch call) accepts.
      const x402Url = rawX402Url.startsWith("/") ? `${API_BASE_URL}${rawX402Url}` : rawX402Url;

      setMessages(m => [...m, { role: "ai", text: "Checking that resource…" }]);
      try {
        const probeRes = await fetch(`${API_BASE_URL}/api/x402/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: x402Url, method: "GET" }),
        });
        const probe = await probeRes.json();
        if (!probeRes.ok) {
          setMessages(m => [...m, { role: "ai", text: probe.error || "Couldn't reach that resource." }]);
          return;
        }

        if (probe.status !== 402) {
          setMessages(m => [...m, { role: "ai", text: `That resource didn't ask for payment (HTTP ${probe.status}). It may already be free, or the request failed for another reason.` }]);
          return;
        }

        // v2 servers put the payment terms in the PAYMENT-REQUIRED
        // header (body may be empty), v1 servers in the JSON body.
        const paymentRequired = probe.body?.accepts ? probe.body : decodePaymentRequiredHeader(probe.paymentRequiredHeader);
        // Two ways to pay: a normal on-chain-settled USDC payment, or a
        // Circle Nanopayments payment (gasless, from a prepaid Gateway
        // balance). A funded Gateway balance wins: no routing, no gas, and
        // it is the only way to pay sub-cent prices. Otherwise the normal
        // payment. A Nanopayments-only seller with an empty balance gets a
        // clear next step instead of a dead end.
        const gatewayOptions = selectGatewayOptions(paymentRequired, NETWORKS);
        const standardPick = selectPaymentRequirement(paymentRequired, NETWORKS);
        let picked = null;
        let paymentMethod = "exact";
        let gatewayBalances = null;
        if (gatewayOptions.length && wallet?.address) {
          gatewayBalances = await fetchGatewayBalances(wallet.address);
          const funded = gatewayOptions.find(o => (gatewayBalances[o.network.key] || 0) >= Number(ethers.formatUnits(o.requirement.amount, 6)));
          if (funded) {
            picked = funded;
            paymentMethod = "gateway";
          }
        }
        if (!picked && standardPick) picked = standardPick;
        if (!picked && gatewayOptions.length) {
          const best = ["arc", "polygon", "base", "ethereum"].map(k => gatewayOptions.find(o => o.network.key === k)).find(Boolean);
          const priceText = ethers.formatUnits(best.requirement.amount, 6);
          setMessages(m => [...m, { role: "ai", text: `This service takes Circle Nanopayments: tiny gasless payments from a prepaid USDC balance, and yours is empty. It costs ${priceText} USDC per request. Say "deposit 1 USDC into my nanopayments balance on ${best.network.name}" (credited in ${GATEWAY_NETWORKS[best.network.key].creditTime}), then ask me again.` }]);
          return;
        }
        if (!picked) {
          const wanted = (paymentRequired?.accepts || []).map(a => a.network).join(", ") || "an unknown network";
          setMessages(m => [...m, { role: "ai", text: `I couldn't find a payment option here that Lyra can pay: it needs the standard "exact" USDC payment, or Circle Nanopayments, on a supported network. This resource offers: ${wanted}.` }]);
          return;
        }

        pushActiveToCollapsedIfAny();
        setDefiTicket(buildX402Ticket(x402Url, picked.requirement, picked.network, paymentRequired?.resource, {
          paymentMethod,
          gatewayBalance: gatewayBalances?.[picked.network.key] ?? null
        }));
      } catch (e) {
        console.error(e);
        setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
      }
      break;
    }

    case "DELEGATE_A2A": {
      const task = (action.task || "").trim();
      if (!task) {
        setMessages(m => [...m, { role: "ai", text: "What should I ask the other agent to do?" }]);
        return;
      }
      const agentUrl = (action.agentUrl || "").trim() || DEMO_A2A_AGENT_URL;

      setMessages(m => [...m, { role: "ai", text: `Delegating to another agent (A2A)…` }]);
      try {
        const card = await fetchAgentCard(agentUrl).catch(() => null);
        const { text } = await sendA2ATask(agentUrl, task);
        const agentName = card?.name || "the other agent";
        logAuditEvent({ category: "a2a", action: "delegate", status: "success", agentUrl, task });
        setMessages(m => [...m, { role: "ai", text: `${agentName} replied:\n\n${text}` }]);
      } catch (e) {
        console.error(e);
        logAuditEvent({ category: "a2a", action: "delegate", status: "failed", agentUrl, task, meta: { error: e.message } });
        setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
      }
      break;
    }

    case "ACP_CHECKOUT": {
      if (!unlockedPrivateKey) {
        setMessages(m => [...m, { role: "ai", text: "Unlock your wallet first so I can prepare the checkout." }]);
        return;
      }
      const items = Array.isArray(action.items) ? action.items : [];
      if (items.length === 0) {
        setMessages(m => [...m, { role: "ai", text: "What would you like to order, and how many?" }]);
        return;
      }

      setMessages(m => [...m, { role: "ai", text: "Preparing your checkout…" }]);
      try {
        const session = await createCheckoutSession(items);
        pushActiveToCollapsedIfAny();
        setDefiTicket(buildAcpTicket(session));
      } catch (e) {
        console.error(e);
        setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
      }
      break;
    }

    case "SET_RPC": {
  const rpcUrl = (action.rpcUrl || "").trim();
  const targetKey = action.network ? (NETWORKS.find(n => n.key === action.network.toLowerCase() || n.name.toLowerCase() === action.network.toLowerCase())?.key) : activeNetworkKey;

  if (!targetKey) {
    setMessages(m => [...m, { role: "ai", text: `${action.network} isn't a network I recognize.` }]);
    return;
  }

  if (!rpcUrl) {
    resetCustomRpc(targetKey);
    setMessages(m => [...m, { role: "ai", text: `Reset ${getNetworkByKey(targetKey).name}'s RPC back to the default endpoint.` }]);
    return;
  }

  if (!/^https?:\/\//i.test(rpcUrl)) {
    setMessages(m => [...m, { role: "ai", text: `That doesn't look like a valid RPC URL (needs to start with http:// or https://).` }]);
    return;
  }

  setCustomRpc(targetKey, rpcUrl);
  setMessages(m => [...m, { role: "ai", text: `${getNetworkByKey(targetKey).name} will now use\n${rpcUrl}\nfor all reads and transactions. Say "reset the RPC" to go back to the default.` }]);
  break;
}

    case "SET_NEXT_NONCE": {
  const nonce = Number(action.nonce);

  if (!Number.isInteger(nonce) || nonce < 0) {
    setMessages(m => [...m, { role: "ai", text: `That's not a valid nonce. It needs to be a whole number, 0 or higher.` }]);
    return;
  }

  setPendingNonceOverride(nonce);
  setMessages(m => [...m, {
    role: "ai",
    text: `Got it. The next transaction you send will use nonce ${nonce} instead of the automatic one. This only applies once; after that it goes back to normal.`
  }]);
  break;
}

    case "GET_TRANSACTIONS": {
      if (!wallet?.address) {
        setMessages(m => [
          ...m,
          {
            role: "ai",
            text: "You need to create or import a wallet first."
          }
        ]);
        return;
      }

      try {
        setStatus("Fetching transactions…");

        const response = await fetch(
          `${API_BASE_URL}/api/transactions/${wallet.address}?network=${activeNetworkKey}`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Couldn't fetch the transactions."
          );
        }

        if (!data.transactions?.length) {
          setMessages(m => [
            ...m,
            {
              role: "ai",
              text: "No transactions found for this wallet."
            }
          ]);
          return;
        }

        const lines = data.transactions.slice(0, 5).map(tx => {
          const isSent =
            tx.from.toLowerCase() === wallet.address.toLowerCase();

          const amount = Number(tx.valueXPL).toLocaleString("en-US", {
            minimumFractionDigits: 4,
            maximumFractionDigits: 8
          });

          return `${isSent ? "↗️ Sent" : "↙️ Received"} · ${amount} ${tx.symbol || "XPL"} · ${shortAddress(
            isSent ? tx.to : tx.from
          )}`;
        });

        setMessages(m => [
          ...m,
          {
            role: "ai",
            text: `Here are your latest transactions:\n\n${lines.join("\n")}`
          }
        ]);

        setStatus(`Connected to ${activeNetwork.name}`);
      } catch (e) {
        console.error(e);

        setMessages(m => [
          ...m,
          {
            role: "ai",
            text: friendlyErrorText(e)
          }
        ]);

        setStatus("Error");
      }

      break;
    }

    case "SEND_XPL": {
      if (!wallet?.address) {
        setMessages(m => [
          ...m,
          {
            role: "ai",
            text: "You need to create or import a wallet first."
          }
        ]);
        return;
      }

      const amount = action.amount || null;
      const amountUSD = action.amountUSD || null;
      const priceUSD = action.priceUSD || null;
      const recipient = action.recipient || null;
      const contactName = action.contactName || null;

      if (contactName && !recipient) {
  setPendingContactName(contactName);
}

setPendingTransaction({
  amount,
  amountUSD,
  priceUSD,
  recipient
}); 

      if (!amount && !amountUSD) {
        setShowSend(false);

        setMessages(m => [
          ...m,
          {
            role: "ai",
            text: action.message || "How much would you like to send?"
          }
        ]);

        return;
      }

      if (!recipient) {
        setShowSend(false);

        setMessages(m => [
          ...m,
          {
            role: "ai",
            text:
              action.message ||
              `Which address would you like to send the ${activeNetwork.nativeSymbol} to?`
          }
        ]);

        return;
      }

      pushActiveToCollapsedIfAny();

      setSendTo(recipient);
      // Only a real ERC-20 symbol on this network counts, otherwise
      // treat it as unset (native), a routing-guessed or stale asset
      // string here would otherwise silently 404 the token lookup
      // later in signAndSend.
      const resolvedAsset = action.asset && action.asset !== activeNetwork.nativeSymbol && tokens[action.asset] ? action.asset : "";
      setSendAsset(resolvedAsset);

      if (amount === "MAX") {
        // "Send everything"/"max"/"all": the AI never guesses this
        // number itself (see SECURITY RULES: never make up an amount),
        // it hands back the "MAX" sentinel and the real
        // balance-minus-fees math happens here, live, where the real
        // balance and gas price actually are. This is only the ticket's
        // display number, signAndSend recomputes it fresh right before
        // signing (sendIsMax), so it can never go stale between now and
        // the user actually confirming.
        setSendIsMax(true);
        setSendAmountUSD("");
        setSendPriceUSD(null);

        try {
          const resolvedToken = resolvedAsset ? tokens[resolvedAsset] : null;

          if (resolvedToken?.address) {
            const contract = new ethers.Contract(resolvedToken.address, ERC20_ABI, RPC);
            const raw = await contract.balanceOf(wallet.address);
            setSendAmount(ethers.formatUnits(raw, resolvedToken.decimals));
          } else {
            setSendAmount(await estimateMaxSendableNative(recipient));
          }
        } catch (e) {
          console.error("Couldn't compute the max sendable amount:", e);
          setShowSend(false);
          setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
          return;
        }
      } else {
        setSendIsMax(false);
        setSendAmount(amount);
        setSendAmountUSD(action.amountUSD || "");
        setSendPriceUSD(action.priceUSD || null);
      }

if (contactName && recipient) {
  const alreadySaved = loadContacts().some(
    c => c.address.toLowerCase() === recipient.toLowerCase()
  );

  if (!alreadySaved) {
    setSuggestedContact({
      name: contactName,
      address: recipient
    });
  }
}

checkAddressAndProceed(recipient, () => setShowSend(true));

      break;
    }

    case "CANCEL":
      setShowSend(false);
      setDefiTicket(null);
      setMultiTicket(null);
      setSendAsset("");
      setSendIsMax(false);
      resetExecutionProgress();
      setPendingTransaction({
        amount: null,
        recipient: null
      });

      setMessages(m => [
        ...m,
        {
          role: "ai",
          text: "Okay, transaction cancelled."
        }
      ]);
      break;

    case "CANCEL_PREDICTION": {
      if (!unlockedPrivateKey) {
        setMessages(m => [...m, { role: "ai", text: "Unlock your wallet first so I can check your Polymarket bets." }]);
        break;
      }
      try {
        // A market order (Lyra's only kind now) fills instantly, so
        // there's usually no open order left to find by the time
        // someone says "cancel"/"cash out"/"sell" -- check live
        // positions too, not just unfilled orders, and let
        // openPredictionDetail pick the right ticket (cancel vs cash
        // out) either way instead of duplicating that logic here.
        let all = await fetchCombinedPredictions();
        let actionable = all.filter(i => i.status === "opened" || i.status === "live");

        // Polymarket's public positions API can lag a few seconds behind
        // a trade that just settled (live-confirmed: a position missing
        // right after "Bet placed" shows up correctly moments later with
        // nothing else changed). One retry after a short pause covers
        // that exact race without making every other "nothing to do"
        // case wait pointlessly.
        if (!actionable.length) {
          await new Promise(resolve => setTimeout(resolve, 2500));
          all = await fetchCombinedPredictions();
          actionable = all.filter(i => i.status === "opened" || i.status === "live");
        }

        if (!actionable.length) {
          // Nothing live to cancel/cash out doesn't mean there's
          // nothing at all: a market that already resolved shows up
          // here as "closed" instead, and "withdraw"/"cash out" is
          // exactly how someone asks about that too. Saying "nothing to
          // cancel" and stopping there leaves them stuck with no next
          // step, point them at the one place that can actually pay
          // out a resolved market instead.
          const redeemable = all.filter(i => i.status === "closed");

          if (redeemable.length === 1) {
            await openPredictionDetail(redeemable[0]);
            break;
          }

          if (redeemable.length > 1) {
            const lines = redeemable.map(i => `- ${i.title || i.outcome}: ${i.outcome}, ${i.size} shares`);
            setMessages(m => [...m, { role: "ai", text: `Those markets have already resolved, so there's nothing left for me to cancel or cash out. Claiming winnings isn't built into Lyra yet: go to polymarket.com, connect this same wallet, and redeem them there directly.\n\n${lines.join("\n")}` }]);
            break;
          }

          setMessages(m => [...m, { role: "ai", text: "You don't have any open orders or live bets on Polymarket right now to cancel or cash out." }]);
          break;
        }

        if (actionable.length > 1) {
          const lines = actionable.map(i =>
            `- ${i.status === "opened" ? "Open order" : "Live bet"}: ${i.title || i.outcome}. ${i.outcome}, ${i.size} shares @ $${i.price}`
          );
          setMessages(m => [...m, { role: "ai", text: `You have ${actionable.length} bets I could act on. Tell me which one (name the match/market):\n\n${lines.join("\n")}` }]);
          break;
        }

        await openPredictionDetail(actionable[0]);
      } catch (e) {
        console.error(e);
        setMessages(m => [...m, { role: "ai", text: friendlyErrorText(e) }]);
      }
      break;
    }

    case "SWAP_XPL":
    case "BRIDGE_XPL":
    case "STAKE_XPL":
    case "UNSTAKE_XPL":
    case "PREDICT_MARKET":
    case "SAFE_RECOVERY":

      if (action.defiTicket) {
        pushActiveToCollapsedIfAny();

        setDefiTicket({
          feature: action.defiFeature,
          intent: action.intent,
          amount: action.amount,
          asset: action.asset,
          executable: !!action.defiExecutable,
          slippage: action.defiFeature === "swap" ? DEFAULT_SLIPPAGE : undefined,
          ...action.defiTicket
        });
      }
      break;

    case "MULTI_ACTION":
      if (Array.isArray(action.steps) && action.steps.length > 0) {
        pushActiveToCollapsedIfAny();
        setMultiTicket({ steps: action.steps });
      }
      break;

    case "ASK_CRYPTO":
    case "CHAT":
    default:
      break;
  }
}

  function handleIntent(text) {
  if (!text.trim()) return;

  askAI(text.trim());
}

  async function copy(text) {
  await navigator.clipboard.writeText(text);
  setStatus("Copied");
  setTimeout(() => setStatus(`Connected to ${activeNetwork.name}`), 1200);
}

function handleHoldStart() {
  if (busy || holdIntervalRef.current) return;

  holdCanvasDrawRef.current?.(0);

  const duration = 2000;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min((elapsed / duration) * 100, 100);

    holdCanvasDrawRef.current?.(progress, now);

    if (progress >= 100) {
      holdIntervalRef.current = null;

      signAndSend()
        .catch((e) => {
          console.error(e);

          setStatus("Error");

          setMessages(m => [
            ...m,
            {
              role: "ai",
              text: friendlyErrorText(e)
            }
          ]);
        })
        .finally(() => {
          holdCanvasDrawRef.current?.(0);
        });
      return;
    }

    holdIntervalRef.current = requestAnimationFrame(tick);
  }

  holdIntervalRef.current = requestAnimationFrame(tick);
}

function handleHoldEnd() {
  if (holdIntervalRef.current) {
    cancelAnimationFrame(holdIntervalRef.current);
    holdIntervalRef.current = null;
  }

  holdCanvasDrawRef.current?.(0);
}

  return (
    <div className="page">
      {toast && (
        <div className="toast">{toast}</div>
      )}
      <main className="frame">
        <header className="header">
          <div className="brand">
  <img
    className="mark"
    src="/logo.svg"
    alt="Lyra"
  />
  <div className="name">Lyra</div>

  <div className="header-actions">
    {wallet && (
      <div className="header-menu" ref={headerMenuRef}>
        <CircleMenu
          open={menuOpen}
          setOpen={setMenuOpen}
          items={[
            {
              label: "Contacts",
              icon: <UserRound size={17} strokeWidth={1.8} color="var(--beige)" />,
              onClick: () => {
                setContacts(loadContacts());
                setShowContacts(true);
              }
            },
            {
              label: "Transactions",
              icon: <History size={17} strokeWidth={1.8} color="var(--beige)" />,
              onClick: openTxHistory
            },
            {
              label: activeNetwork.name,
              icon: <Link size={17} strokeWidth={1.8} color="var(--beige)" />,
              onClick: () => setShowNetworkMenu(true)
            },
            {
              label: "Settings",
              icon: <Settings size={17} strokeWidth={1.8} color="var(--beige)" />,
              onClick: () => setShowSettings(true)
            }
          ]}
        />

      </div>
    )}
  </div>
</div>

{showNetworkMenu && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => { if (e.target === e.currentTarget) setShowNetworkMenu(false); }}
  >
    <div className="contacts-panel">
      <div className="contacts-header">
        <div>
          <div className="contacts-title">Network</div>
          <div className="contacts-subtitle">Choose which chain Lyra talks to</div>
        </div>
        <button type="button" className="contacts-close" onClick={() => setShowNetworkMenu(false)}>
          <X size={18} />
        </button>
      </div>

      <div className="network-picker-list">
        {NETWORKS.map(net => {
          const active = net.key === activeNetworkKey;
          return (
            <button
              key={net.key}
              type="button"
              className={`network-card ${active ? "active" : ""}`}
              onClick={() => {
                switchNetwork(net.key);
                setShowNetworkMenu(false);
              }}
            >
              <div className="network-card-top">
                <span className="network-card-dot" style={{ background: net.color || "var(--muted-dim)" }} />
                <span className="network-card-name">{net.name}</span>
                <span className="network-card-chain">{net.nativeSymbol} · Chain {net.chainId}</span>
                {active && (
                  <span className="network-card-check">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
              </div>
              {net.description && (
                <p className="network-card-desc">{net.description}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  </div>
)}

            <div className="balance-card">
            <div className="balance-label-row">
            <div className="balance-label">Available balance</div>
          </div>
          <div className="balance-row">
            <div className="balance"><AnimatedBalance value={Number(ethers.formatEther(balance || 0n))} decimals={2} /></div>
            <div className="balance-usd">{activeNetwork.nativeSymbol}</div>
            <button
              type="button"
              className={`balance-refresh ${balanceLoading ? "spinning" : ""}`}
              onClick={() => refreshBalance()}
              disabled={balanceLoading}
              title="Refresh"
              aria-label="Refresh balance"
            >
              <RefreshCw size={14} />
            </button>
            {portfolioChangePercent !== null && (
              <div className={`balance-change ${portfolioChangePercent >= 0 ? "positive" : "negative"}`}>
                {portfolioChangePercent >= 0 ? "+" : ""}{portfolioChangePercent.toFixed(2)}%
              </div>
            )}
          </div>
          {(xplPriceUSD || wallet?.address) && (
  <div className="balance-usd-value">
    {xplPriceUSD && (
      <span className="balance-usd-total">
        ≈ {(
          Number(ethers.formatEther(balance || 0n)) * xplPriceUSD +
          Object.entries(tokens).reduce((sum, [symbol, token]) => {
            const walletAmt = Number(ethers.formatUnits(tokenBalances[symbol] || 0n, token.decimals));
            const stakedAmt = Number(ethers.formatUnits(stakedBalances[symbol] || 0n, token.decimals));
            return sum + walletAmt + stakedAmt;
          }, 0)
        ).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
        <span className="info-tooltip">
          <Info size={12} strokeWidth={2} />
          <span className="info-tooltip-bubble">
            <strong>{activeNetwork.name} network only</strong>
          </span>
        </span>
      </span>
    )}

    {xplPriceUSD && wallet?.address && (
      <span className="usd-dot"> · </span>
    )}

    {wallet?.address && (
      <span className="wallet-address-inline">
        {shortAddress(wallet.address)}
        <button
  type="button"
  className="address-copy-btn"
  onClick={() => {
    copy(wallet.address);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 1000);
  }}
  title="Copy address"
  aria-label="Copy address"
>
  {addressCopied ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        className="copy-check-path"
        d="M5 13l4 4L19 7"
        stroke="var(--success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <Copy size={11} strokeWidth={2} />
  )}
</button>
      </span>
    )}
  </div>
)}
            </div>

          {(Object.entries(tokens).some(([symbol]) => (tokenBalances[symbol] || 0n) > 0n) ||
            Object.entries(tokens).some(([symbol]) => (stakedBalances[symbol] || 0n) > 0n)) && (
            <div className="token-balances-row">
              {Object.entries(tokens)
                .filter(([symbol]) => (tokenBalances[symbol] || 0n) > 0n || (stakedBalances[symbol] || 0n) > 0n)
                .map(([symbol, token], chipIndex) => {
                  const walletAmt = Number(ethers.formatUnits(tokenBalances[symbol] || 0n, token.decimals));
                  const stakedAmt = Number(ethers.formatUnits(stakedBalances[symbol] || 0n, token.decimals));
                  const hasStaked = stakedAmt > 0;
                  const apy = stakedApy[symbol];
                  return (
                    <div className="token-balance-chip" key={symbol} style={{ "--i": chipIndex }}>
                      <span className="token-dot" style={{ background: token.color }} />
                      {walletAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })} {symbol}
                      {hasStaked && (
                        <span className="info-tooltip staked-info-tooltip">
                          <Coins size={11} strokeWidth={2} />
                          <span className="info-tooltip-bubble">
                            <strong>{stakedAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })} {symbol} staked</strong> on Aave
                            {typeof apy === "number" ? ` · ${apy.toFixed(2)}% APY` : ""}
                          </span>
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

            <PortfolioChart
  history={networkPortfolioHistory}
  range={chartRange}
  onRangeChange={setChartRange}
  mode={chartMode}
  onModeChange={setChartMode}
  xplPriceUSD={xplPriceUSD}
  currentBalance={balance}
  tokenBalances={tokenBalances}
  stakedBalances={stakedBalances}
  tokens={tokens}
  nativeSymbol={activeNetwork.nativeSymbol}
/>

          {!wallet && (
  <button className="connect-wallet" onClick={() => setShowWallet(true)}>
    <WalletCards size={16} />
    Create a wallet
  </button>
)}

        </header>

        <section className="chat" ref={chatScrollRef}>
          {messages.length === 0 && !showSend && !defiTicket && !multiTicket && (
  <div className="chat-empty-card" ref={chatEmptyPathRef}>
    <span className="border-light" />
    <span className="border-light-mask" />
    <div className="chat-empty-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M21 11.5a8.5 8.5 0 0 1-11.8 7.8L4 21l1.7-5.2A8.5 8.5 0 1 1 21 11.5Z"/>
      </svg>
    </div>
    <div className="chat-empty-title">What would you like to do?</div>
    <div className="chat-empty-subtitle">Send, receive, swap, bridge or stake tokens.</div>
  </div>
)}

          {messages.map((m, i) => (
            <div className={`msg ${m.role}`} key={i}>
              {m.role === "ai" && <div className="ai-label">Lyra</div>}
              <div className={`bubble${m.variant === "warning" ? " bubble-warning" : ""}`}>
                {m.role === "ai" ? <TypewriterText text={m.text} /> : m.text}
                {m.variant === "onboarding" && <OnboardingExamples />}
              </div>
            </div>
          ))}

          <AnimatePresence>
            {busy && messages.length > 0 && messages[messages.length - 1].role === "user" && (
              <motion.div
                className="msg ai"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <div className="ai-label">Lyra</div>
                <div className="bubble">
                  <span className="thinking-shimmer">Lyra is executing...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {collapsedTickets.length > 0 && (
            <div className="collapsed-tickets-row">
              {collapsedTickets.map(t => (
                <button
                  type="button"
                  className="collapsed-ticket-chip"
                  key={t.id}
                  onClick={() => restoreCollapsedTicket(t.id)}
                  title="Reopen this ticket"
                >
                  <span className="collapsed-ticket-dot" />
                  {t.label}
                  <span
                    className="collapsed-ticket-dismiss"
                    onClick={(e) => { e.stopPropagation(); dismissCollapsedTicket(t.id); }}
                    title="Discard"
                  >
                    <X size={12} />
                  </span>
                </button>
              ))}
            </div>
          )}

        </section>

        <div className="inputbar">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && input.trim()) { handleIntent(input.trim()); setInput(""); } }}
            placeholder="Message Lyra…" />
          <button className="send" onClick={() => { if(input.trim()){ handleIntent(input.trim()); setInput(""); }}}>
            <MousePointer2 size={15} fill="currentColor" strokeWidth={0} style={{ transform: "rotate(135deg)" }} />
          </button>
        </div>

        <div className="wallet-modal" style={{display: showWallet ? "flex" : "none"}}>
          <WalletPanel
            existing={!!wallet}
            onClose={() => setShowWallet(false)}
            onCreate={createWallet}
            onImport={importWallet}
          />
        </div>


{(showSend || defiTicket || multiTicket) && (
  <div className="ticket-fullscreen-overlay">
    <motion.div className="ticket-fullscreen-panel" layout transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}>

      {!busy && !multiTicketDone && (
        <button
          type="button"
          className="ticket-fullscreen-close"
          onClick={clearActiveTicket}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      )}

      {showSend && (
  <div className="ticket">

    {waveActive && <TicketTransitionWave />}

    <div className={`ticket-collapsible-top ${ticketTopCollapsed ? "collapsed" : ""}`}>
      <div>

    <div className="ticket-title">
      Transaction · Send {sendAssetSymbol}
    </div>

    {/* ============================= */}
    {/* MAIN SUMMARY */}
    {/* ============================= */}

    <div className="transaction-summary">

      {sendAmountUSD && sendPriceUSD ? (
        <>
          <div className="transaction-row">
            <span>Requested amount</span>
            <strong>
              {Number(sendAmountUSD).toFixed(2)} $
            </strong>
          </div>

          <div className="transaction-row">
            <span>Amount sent</span>
            <strong>
              {formatTicketAmount(sendAmount)} {sendAssetSymbol}
            </strong>
          </div>

          <div className="transaction-row">
            <span>Rate</span>
            <strong>
              1 {sendAssetSymbol} = {Number(sendPriceUSD).toFixed(6)} $
            </strong>
          </div>
        </>
      ) : (
        <div className="transaction-row">
          <span>Amount sent</span>
          <strong>
            {formatTicketAmount(sendAmount)} {sendAssetSymbol}
          </strong>
        </div>
      )}

      <div className="transaction-row recipient-row">
        <span>Recipient</span>

        <strong title={sendTo}>
          {(() => {
            const contactName = contacts.find(c => c.address?.toLowerCase() === String(sendTo).toLowerCase())?.name;
            return contactName ? `${contactName} · ${shortAddress(sendTo)}` : shortAddress(sendTo);
          })()}
        </strong>
      </div>

      {suggestedContact && (
  <div className="contact-save-box">
    {contactSaved ? (
      <div className="contact-saved">
        ✓ Address saved as "{contactNameInput.trim() || suggestedContact.name}".
      </div>
    ) : editingContactName ? (
      <div className="contact-name-edit-row">
        <input
          type="text"
          className="contact-name-input"
          value={contactNameInput}
          onChange={e => setContactNameInput(e.target.value)}
          placeholder="Contact name"
          autoFocus
          onKeyDown={e => {
            if (e.key === "Escape") setEditingContactName(false);
          }}
        />
        <button
          type="button"
          className="save-contact"
          disabled={!contactNameInput.trim()}
          onClick={() => {
  addContact(
    contactNameInput.trim(),
    suggestedContact.address
  );

  setContacts(loadContacts());
  setContactSaved(true);

  setTimeout(() => {
    setSuggestedContact(null);
    setContactSaved(false);
  }, 3000);
}}
        >
          Save
        </button>
      </div>
    ) : (
      <button
        type="button"
        className="save-contact"
        onClick={() => {
          setContactNameInput(suggestedContact.name);
          setEditingContactName(true);
        }}
      >
        ＋ Save as contact
      </button>
    )}
  </div>
)}

    </div>


    {/* ============================= */}
    {/* DETAILS */}
    {/* ============================= */}

    <button
      type="button"
      className="details-toggle"
      onClick={() => setShowDetails(v => !v)}
      aria-label={showDetails ? "Hide details" : "Show details"}
    >
      <svg
        className={showDetails ? "chevron open" : "chevron"}
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>


    <AnimatePresence initial={false}>
    {showDetails && (
      <motion.div
        className="transaction-details"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        style={{ overflow: "hidden" }}
      >

        <div className="detail-row">
          <span>Asset</span>
          <span>{sendAssetSymbol}</span>
        </div>

        <div className="detail-row">
          <span>Network</span>
          <span>{activeNetwork.name}</span>
        </div>

        <div className="detail-row">
          <span>Full address</span>

          <span className="detail-address">
            {sendTo}
          </span>
        </div>

        {sendAmountUSD && sendPriceUSD && (
          <div className="detail-row">
            <span>USD amount</span>
            <span>
              {Number(sendAmountUSD).toFixed(2)} $
            </span>
          </div>
        )}

        <div className="detail-row">
          <span>{sendAssetSymbol} amount</span>
          <span>
            {sendAmount
              ? isTokenSend
                ? `${sendAmount} ${sendAssetSymbol}`
                : `${fmtXpl(ethers.parseEther(sendAmount))} ${sendAssetSymbol}`
              : "—"
            }
          </span>
        </div>

        {sendPriceUSD && (
          <div className="detail-row">
            <span>Conversion rate</span>
            <span>
              1 {sendAssetSymbol} = {Number(sendPriceUSD).toFixed(6)} $
            </span>
          </div>
        )}

        <div className="detail-row">
          <span>Balance before</span>
          <span>
            {isTokenSend
              // fmtXpl hardcodes formatEther (18 decimals) internally,
              // wrong for a token whose own decimals differ (e.g.
              // USDC.e's 6), format with the token's real decimals
              // directly instead.
              ? `${Number(ethers.formatUnits(tokenBalances[sendAsset] || 0n, sendToken.decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${sendAssetSymbol}`
              : `${fmtXpl(balance)} ${activeNetwork.nativeSymbol}`
            }
          </span>
        </div>

        <div className="detail-row">
          <span>Estimated network fees</span>
          <span>
            {sendFeeEstimate !== null
              ? `${fmtXpl(sendFeeEstimate, 8)} ${activeNetwork.nativeSymbol}`
              : sendFeeEstimateError
                ? "Couldn't estimate"
                : "Calculating…"
            }
          </span>
        </div>

        <div className="detail-row">
          <span>Estimated total debited</span>
          <span>
            {!sendAmount
              ? "—"
              : isTokenSend
                // Gas is always paid in the native coin even for a
                // token send, the amount itself and the fee are two
                // different assets here, not one combined number.
                ? `${sendAmount} ${sendAssetSymbol} + ${sendFeeEstimate !== null ? `${fmtXpl(sendFeeEstimate, 8)} ${activeNetwork.nativeSymbol} fee` : "fee"}`
                : sendFeeEstimate !== null
                  ? `${fmtXpl(ethers.parseEther(sendAmount) + sendFeeEstimate, 8)} ${activeNetwork.nativeSymbol}`
                  : `${fmtXpl(ethers.parseEther(sendAmount))} ${activeNetwork.nativeSymbol} + fees`
            }
          </span>
        </div>

      </motion.div>
    )}
    </AnimatePresence>


    {/* ============================= */}
    {/* AVERTISSEMENT */}
    {/* ============================= */}

      </div>
    </div>

    {/* ============================= */}
    {/* CONFIRMATION */}
    {/* ============================= */}

        {executionSteps.length > 0 ? (
      executionStepIndex >= executionSteps.length ? (
        <TicketDoneRecap
          steps={[{
            text: completedSummaryLine({ kind: "send", amount: sendAmount, asset: sendAssetSymbol, recipient: sendTo }),
            txUrl: txHash ? explorerTx(txHash, activeNetwork) : null
          }]}
          onDone={clearActiveTicket}
        />
      ) : (
      <div className="ticket-checklist-enter">
        <ExecutionChecklist
          label={executionLabel || "Send"}
          steps={executionSteps}
          currentIndex={executionStepIndex}
          busy={busy}
          txHash={txHash}
          network={activeNetwork}
          onDone={clearActiveTicket}
        />
      </div>
      )
    ) : (
      <button
        className="confirm hold-confirm"
        disabled={busy}
        onMouseDown={handleHoldStart}
        onMouseUp={handleHoldEnd}
        onMouseLeave={handleHoldEnd}
        onTouchStart={handleHoldStart}
        onTouchEnd={handleHoldEnd}
        onTouchCancel={handleHoldEnd}
      >

        <HoldSquares drawRef={holdCanvasDrawRef} />

        <span className="hold-content">
          Hold to Confirm
        </span>

      </button>
    )}

  </div>
)}

{defiTicket && (
  <div className="ticket defi-ticket">

    {waveActive && <TicketTransitionWave />}

    <div className={`ticket-collapsible-top ${ticketTopCollapsed ? "collapsed" : ""}`}>
      <div>

    <div className="ticket-title">
      {defiTicket.feature === "closed-prediction"
        ? (defiTicket.cashedOut ? "Cashed Out" : "Completed")
        : defiTicket.feature === "cancel-prediction"
        ? "Opened"
        : defiTicket.feature === "cashout-prediction"
        ? "Live"
        : { swap: "Swap", bridge: "Bridge", staking: "Staking", prediction: "Bet", "safe-recovery": "Recovery", "receive-fiat": "Receive", "receive-any-chain": "Receive", consolidate: "Consolidate", x402: "x402 Payment", acp: "ACP Checkout", "gateway-deposit": "Nanopayments Deposit" }[defiTicket.feature] || "DeFi"}
      {defiTicket.feature === "prediction"
        ? <>{" · "}${defiTicket.amountUSD || "?"} USDC.e</>
        : defiTicket.feature === "cancel-prediction" || defiTicket.feature === "cashout-prediction" || defiTicket.feature === "closed-prediction"
        ? <>{" · "}{defiTicket.size || "?"} shares</>
        : defiTicket.feature === "safe-recovery"
        ? <>{" · "}{defiTicket.amount || "?"} USDC.e</>
        : defiTicket.feature === "receive-fiat"
        ? <>{" · "}${defiTicket.amountUSD || "?"}</>
        : defiTicket.feature === "receive-any-chain"
        ? <>{" · "}Any chain</>
        : defiTicket.feature === "consolidate"
        ? <>{" · "}{defiTicket.amountDisplay} {defiTicket.symbol}</>
        : defiTicket.feature === "x402" || defiTicket.feature === "acp" || defiTicket.feature === "gateway-deposit"
        ? <>{" · "}{defiTicket.amount} {defiTicket.symbol}</>
        : <>{" · "}{defiTicket.amount || "?"} {defiTicket.asset || activeNetwork.nativeSymbol}</>}
    </div>

    {defiTicket.dataFound === false && (
      <div className="warning">
        {defiTicket.summary || "No reliable data found for this operation."}
      </div>
    )}

    {defiTicket.dataFound !== false && (
      <div className="transaction-summary">

        <div className="transaction-row">
          <span>Platform</span>
          <strong>{defiTicket.platform || "—"}</strong>
        </div>

        {defiTicket.feature === "staking" && (
          <>
            <div className="transaction-row">
              <span>Estimated yield</span>
              <strong>{defiTicket.apy || "—"}</strong>
            </div>
            <div className="transaction-row">
              <span>Lock</span>
              <strong>{defiTicket.lock === null || defiTicket.lock === undefined ? "—" : (defiTicket.lock ? "Yes" : "No")}</strong>
            </div>
          </>
        )}

        {defiTicket.feature === "swap" && (
          <>
            <div className="transaction-row">
              <span>Rate</span>
              <strong>{defiTicket.rate || "—"}</strong>
            </div>
            <div className="transaction-row">
              <span>You'll receive approximately</span>
              <strong>{defiTicket.estimatedReceive || "—"}</strong>
            </div>
          </>
        )}

        {defiTicket.feature === "bridge" && (
          <div className="transaction-row">
            <span>Route</span>
            <strong>{defiTicket.route || "—"}</strong>
          </div>
        )}

        {defiTicket.feature === "prediction" && (
          <>
            <div className="transaction-row">
              <span>Market</span>
              <strong>{defiTicket.marketQuestion || "—"}</strong>
            </div>
            <div className="transaction-row">
              <span>Outcome</span>
              <strong>{defiTicket.outcome || "—"}</strong>
            </div>
            <div className="transaction-row">
              <span>Implied odds</span>
              <strong>{defiTicket.price != null ? `${(Number(defiTicket.price) * 100).toFixed(1)}%` : "—"}</strong>
            </div>
            <div className="transaction-row">
              <span>Potential payout</span>
              <strong>{defiTicket.potentialPayout ? `$${defiTicket.potentialPayout}` : "—"}</strong>
            </div>
            {defiTicket.endDate && (
              <div className="transaction-row">
                <span>Resolves</span>
                <strong>{new Date(defiTicket.endDate).toLocaleDateString()}</strong>
              </div>
            )}
          </>
        )}

        {(defiTicket.feature === "cancel-prediction" || defiTicket.feature === "cashout-prediction" || defiTicket.feature === "closed-prediction") && (
          <>
            {defiTicket.marketQuestion && (
              <div className="transaction-row">
                <span>Market</span>
                <strong>{defiTicket.marketQuestion}</strong>
              </div>
            )}
            <div className="transaction-row">
              <span>Outcome</span>
              <strong>{defiTicket.outcome || "—"}</strong>
            </div>
            <div className="transaction-row">
              <span>Price</span>
              <strong>{defiTicket.price != null ? `$${defiTicket.price}` : "—"}</strong>
            </div>
            <div className="transaction-row">
              <span>Size</span>
              <strong>{defiTicket.size || "—"} shares</strong>
            </div>
            {defiTicket.feature === "cashout-prediction" && (
              <div className="transaction-row">
                <span>Estimated proceeds</span>
                <strong>{defiTicket.price != null && defiTicket.size != null ? `$${(Number(defiTicket.price) * Number(defiTicket.size)).toFixed(2)}` : "—"}</strong>
              </div>
            )}
          </>
        )}

        {defiTicket.feature === "safe-recovery" && (
          <>
            <div className="transaction-row">
              <span>From</span>
              <strong>{shortAddress(defiTicket.fromSafe)}</strong>
            </div>
            <div className="transaction-row">
              <span>To</span>
              <strong>{defiTicket.toLabel || shortAddress(defiTicket.toAddress)}</strong>
            </div>
            <div className="transaction-row">
              <span>Amount</span>
              <strong>{defiTicket.amount} USDC.e</strong>
            </div>
          </>
        )}

        {defiTicket.feature === "receive-fiat" && (
          <>
            <div className="transaction-row">
              <span>Amount requested</span>
              <strong>${defiTicket.amountUSD}</strong>
            </div>
            <div className="transaction-row">
              <span>You'll receive</span>
              <strong>≈ {defiTicket.amountUSD} USDC.e</strong>
            </div>
            {defiTicket.qrCode && (
              <div className="qr-body" style={{ margin: "10px 0" }}>
                <div className="qr-frame">
                  <img
                    src={defiTicket.qrCode.output}
                    alt={`Payment request QR for $${defiTicket.amountUSD}`}
                    width={defiTicket.qrCode.size}
                    height={defiTicket.qrCode.size}
                    className="qr-image"
                  />
                </div>
                <div className="qr-address">Ref. {defiTicket.refId}</div>
              </div>
            )}
          </>
        )}

        {defiTicket.feature === "receive-any-chain" && (
          <>
            <div className="transaction-row">
              <span>Works on</span>
              <strong>Any EVM chain, any token</strong>
            </div>
            {defiTicket.qrCode && (
              <div className="qr-body" style={{ margin: "10px 0" }}>
                <div className="qr-frame">
                  <img
                    src={defiTicket.qrCode.output}
                    alt="Universal receive address QR"
                    width={defiTicket.qrCode.size}
                    height={defiTicket.qrCode.size}
                    className="qr-image"
                  />
                </div>
                <div className="qr-address" title={defiTicket.qrCode.data}>{shortAddress(defiTicket.qrCode.data)}</div>
              </div>
            )}
          </>
        )}

        {defiTicket.feature === "consolidate" && (
          <>
            <div className="transaction-row">
              <span>From</span>
              <strong>{defiTicket.amountDisplay} {defiTicket.symbol} on {defiTicket.networkName}</strong>
            </div>
            <div className="transaction-row">
              <span>To</span>
              <strong>USDT0 on Plasma</strong>
            </div>
          </>
        )}

        {defiTicket.feature === "x402" && (
          <>
            <div className="transaction-row">
              <span>Resource</span>
              <strong style={{ wordBreak: "break-all", textAlign: "right" }}>{defiTicket.url}</strong>
            </div>
            <div className="transaction-row">
              <span>Network</span>
              <strong>{defiTicket.network.name}</strong>
            </div>
            {defiTicket.paymentMethod === "gateway" && (
              <div className="transaction-row">
                <span>Paid from</span>
                <strong>Nanopayments balance (${defiTicket.gatewayBalance ?? "?"})</strong>
              </div>
            )}
            <div className="transaction-row">
              <span>Pay to</span>
              <strong>{shortAddress(defiTicket.payTo)}</strong>
            </div>
            {defiTicket.amountUSD > x402SpendLimitUSD && (
              <div className="warning">This is above your ${x402SpendLimitUSD} x402 spending limit and will be blocked. Raise the limit in Settings first if you want to allow it.</div>
            )}
            {defiTicket.amountUSD >= biometricThresholdUSD && biometricEnabled && (
              <div className="ticket-note">This amount requires a biometric confirmation on top of Hold-to-Confirm.</div>
            )}
          </>
        )}

        {defiTicket.feature === "gateway-deposit" && (
          <>
            <div className="transaction-row">
              <span>Network</span>
              <strong>{defiTicket.network.name}</strong>
            </div>
            <div className="transaction-row">
              <span>Deposit into</span>
              <strong>Circle Gateway Wallet</strong>
            </div>
            <div className="transaction-row">
              <span>Credited in</span>
              <strong>{GATEWAY_NETWORKS[defiTicket.networkKey].creditTime}</strong>
            </div>
          </>
        )}

        {defiTicket.feature === "acp" && (
          <>
            {defiTicket.lineItems.map((li, i) => (
              <div className="transaction-row" key={i}>
                <span>{li.quantity}× {li.name}</span>
                <strong>${li.subtotalUSD.toFixed(2)}</strong>
              </div>
            ))}
            <div className="transaction-row">
              <span>Pay to</span>
              <strong>{shortAddress(defiTicket.payTo)}</strong>
            </div>
            {defiTicket.amountUSD > x402SpendLimitUSD && (
              <div className="warning">This is above your ${x402SpendLimitUSD} x402 spending limit and will be blocked. Raise the limit in Settings first if you want to allow it.</div>
            )}
            {defiTicket.amountUSD >= biometricThresholdUSD && biometricEnabled && (
              <div className="ticket-note">This amount requires a biometric confirmation on top of Hold-to-Confirm.</div>
            )}
          </>
        )}

        {defiTicket.feature !== "receive-any-chain" && (
          <>
            <div className="transaction-row">
              <span>Estimated fees</span>
              <strong>{defiTicket.fees || "—"}</strong>
            </div>

            <div className={`transaction-row risk-row risk-${defiTicket.riskLevel}`}>
              <span>Risk level</span>
              <strong>{defiTicket.riskLevel || "unknown"}</strong>
            </div>
          </>
        )}

        {defiTicket.riskReason && (
          <div className="ticket-note">{defiTicket.riskReason}</div>
        )}

        {defiTicket.feature === "bridge" && Array.isArray(defiTicket.steps) && defiTicket.steps.length > 0 && (
          <div className="bridge-steps">
            {defiTicket.steps.map((step, i) => (
              <div className="bridge-step" key={i}>
                <span className="bridge-step-index">{i + 1}</span>
                {step}
              </div>
            ))}
          </div>
        )}

        {defiTicket.summary && (
          <div className="ticket-note">{defiTicket.summary}</div>
        )}

      </div>
    )}

    <div className="warning">
      {defiTicket.executable
        ? (defiTicket.feature === "swap"
            ? `The operation will be signed locally. A ${(((defiTicket.slippage ?? 0.005) * 100)).toFixed(2)}% slippage tolerance protects this swap. It will revert instead of executing at a materially worse rate.`
            : defiTicket.feature === "prediction" || defiTicket.feature === "cashout-prediction"
              ? "This executes immediately as a market order against Polymarket's live order book, not a resting limit order. The odds shown are an estimate, the actual fill price is fetched fresh right when you confirm and may differ slightly."
              : defiTicket.feature === "receive-fiat"
                ? "Demo mode: no real on-ramp provider is connected yet, so scanning this QR doesn't actually collect a payment. Confirming below simulates a payment arriving and converting instantly, no real money moves and no on-chain transaction happens."
                : defiTicket.feature === "consolidate"
                  ? "This routes through LI.FI, the same provider Bridge uses. The operation will be signed locally with your encrypted wallet."
                  : defiTicket.feature === "gateway-deposit"
                    ? "This moves real USDC into Circle's Gateway Wallet contract (two transactions: approve, then deposit). Your balance there pays for x402 services with free signatures, no gas. It stays yours and can be withdrawn."
                  : defiTicket.feature === "x402"
                    ? (defiTicket.paymentMethod === "gateway"
                      ? "Paid from your Circle Nanopayments balance: a free signature, no gas and no bridging. Circle settles it later in a batch."
                      : "If this network doesn't have enough funds, Lyra bridges/swaps them in automatically first (LI.FI), then signs the payment, all under this one confirmation. This demo endpoint (or a real x402 resource) is the target, not Lyra itself.")
                    : defiTicket.feature === "acp"
                      ? "This checkout completes over x402 (same signature, same spend limit) once you hold to confirm. Demo merchant, no real settlement."
                      : "The operation will be signed locally with your encrypted wallet.")
        : defiTicket.feature === "closed-prediction"
          ? (defiTicket.cashedOut
              ? "This position was already cashed out."
              : "This market has already resolved. Claiming winnings isn't built into Lyra yet, you can redeem it directly on polymarket.com.")
          : defiTicket.feature === "receive-any-chain"
            ? "Only send tokens from an EVM-compatible blockchain. This window will close automatically once the funds are received."
            : "This operation isn't executable in Lyra yet. The verified contract isn't wired in yet. This ticket is shown for information only."}
    </div>

      </div>
    </div>

    {defiTicket.executable ? (
      executionSteps.length > 0 ? (
        executionStepIndex >= executionSteps.length ? (
          <TicketDoneRecap
            steps={[{
              text: completedSummaryLine({
                kind: { SWAP_XPL: "swap", BRIDGE_XPL: "bridge", STAKE_XPL: "stake", UNSTAKE_XPL: "unstake" }[defiTicket.intent] || defiTicket.feature,
                amount: defiTicket.amount,
                asset: defiTicket.asset,
                ticket: { estimatedReceive: defiTicket.estimatedReceive, platform: defiTicket.platform },
                destinationChainKey: defiTicket.destinationChainKey,
                outcome: defiTicket.outcome,
                price: defiTicket.price,
                size: defiTicket.size,
                marketQuestion: defiTicket.marketQuestion,
                amountUSD: defiTicket.amountUSD,
                amountDisplay: defiTicket.amountDisplay,
                symbol: defiTicket.symbol,
                networkName: defiTicket.networkName,
                lineItems: defiTicket.lineItems,
                url: defiTicket.url,
                toSymbol: "USDT0"
              }),
              txUrl: txHash ? explorerTx(txHash, defiTicket.feature === "x402" ? defiTicket.network : activeNetwork) : null
            }]}
            onDone={clearActiveTicket}
          />
        ) : (
        <div className="ticket-checklist-enter">
          <ExecutionChecklist
            label={executionLabel || "Confirm"}
            steps={executionSteps}
            currentIndex={executionStepIndex}
            busy={busy}
            txHash={txHash}
            network={activeNetwork}
            onDone={clearActiveTicket}
          />
        </div>
        )
      ) : (
        <button
          className="confirm hold-confirm"
          disabled={busy}
          onMouseDown={handleHoldStart}
          onMouseUp={handleHoldEnd}
          onMouseLeave={handleHoldEnd}
          onTouchStart={handleHoldStart}
          onTouchEnd={handleHoldEnd}
          onTouchCancel={handleHoldEnd}
        >
          <HoldSquares drawRef={holdCanvasDrawRef} />
          <span className="hold-content">
            {{ "cancel-prediction": "Hold to Cancel", "cashout-prediction": "Hold to Cashout", "receive-fiat": "Hold to Simulate Payment", consolidate: "Hold to Consolidate" }[defiTicket.feature] || "Hold to Confirm"}
          </span>
        </button>
      )
    ) : (
      <button type="button" className="confirm defi-ticket-close" onClick={() => setDefiTicket(null)}>
        Close
      </button>
    )}

  </div>
)}

{multiTicket && (
  <div className="ticket defi-ticket multi-ticket">

   {(waveActive || stepSweepActive) && <TicketTransitionWave />}

    <div className={`ticket-collapsible-top ${ticketTopCollapsed ? "collapsed" : ""}`}>
      <div>

    <div className="ticket-title">Plan · {multiTicket.steps.length} steps</div>

    {multiTicket.steps.map((step, i) => {
      const expanded = !!expandedSteps[i];
      const t = step.ticket;

      return (
        <div className={`multi-step ${expanded ? "expanded" : ""}`} key={i}>

          <div
            className="multi-step-head"
            onClick={() => setExpandedSteps(s => ({ ...s, [i]: !s[i] }))}
          >
            <span className="multi-step-num">{i + 1}</span>
            <span className="multi-step-summary">{stepSummaryLine(step)}</span>
            <span className="multi-step-toggle" aria-label={expanded ? "Hide details" : "Show details"}>
              <svg
                className={expanded ? "chevron open" : "chevron"}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </div>

          <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              className="multi-step-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: "hidden" }}
            >

              {step.kind === "send" && (
                <>
                  <div className="transaction-row"><span>Recipient</span><strong>{step.contactName || shortAddress(step.recipient)}</strong></div>
                  <div className="transaction-row"><span>Amount</span><strong>{step.amountIsEstimate ? "≈ " : ""}{step.amount ?? "…"} {step.asset}</strong></div>
                  {step.amountIsEstimate && (
                    <div className="ticket-note">Exact amount depends on the previous step's real result resolved right before this step runs.</div>
                  )}
                </>
              )}

              {step.kind !== "send" && t?.dataFound === false && (
                <div className="warning">{t.summary || "No reliable data found for this step."}</div>
              )}

              {step.kind !== "send" && t?.dataFound !== false && (
                <>
                  <div className="transaction-row"><span>Platform</span><strong>{t?.platform || "—"}</strong></div>

                  {step.kind === "swap" && (
                    <>
                      <div className="transaction-row"><span>Rate</span><strong>{t?.rate || "—"}</strong></div>
                      <div className="transaction-row"><span>You'll receive</span><strong>{t?.estimatedReceive || "—"}</strong></div>
                    </>
                  )}

                  {(step.kind === "stake" || step.kind === "unstake") && (
                    <>
                      <div className="transaction-row"><span>Amount</span><strong>{step.amountIsEstimate ? "≈ " : ""}{step.amount ?? "…"} {step.asset}</strong></div>
                      <div className="transaction-row"><span>Estimated yield</span><strong>{t?.apy || "—"}</strong></div>
                      <div className="transaction-row"><span>Lock</span><strong>{t?.lock === null || t?.lock === undefined ? "—" : (t.lock ? "Yes" : "No")}</strong></div>
                    </>
                  )}

                  {step.kind === "bridge" && (
                    <div className="transaction-row"><span>Route</span><strong>{t?.route || "—"}</strong></div>
                  )}

                  <div className="transaction-row"><span>Fees</span><strong>{t?.fees || "—"}</strong></div>

                  <div className={`transaction-row risk-row risk-${t?.riskLevel}`}>
                    <span>Risk level</span><strong>{t?.riskLevel || "unknown"}</strong>
                  </div>

                  {t?.riskReason && <div className="ticket-note">{t.riskReason}</div>}
                  {step.amountIsEstimate && (
                    <div className="ticket-note">Amount carried over from the previous step's real result once it executes.</div>
                  )}
                </>
              )}

            </motion.div>
          )}
          </AnimatePresence>
        </div>
      );
    })}

    <div className="warning" style={{ marginTop: 14 }}>
      Steps run one after another. If a later step depends on an earlier one's
      output, Lyra uses the real amount received, not an estimate before
      signing it.
    </div>

      </div>
    </div>

    {multiTicketDone ? (
    <TicketDoneRecap
      steps={multiTicket.steps.map((step, i) => ({
        text: completedSummaryLine(step),
        txUrl: stepTxHashes[i] ? explorerTx(stepTxHashes[i], activeNetwork) : null
      }))}
      onDone={clearActiveTicket}
    />
    ) : executionSteps.length > 0 ? (
    <div className="ticket-checklist-enter" key={planStepIndex}>
      <ExecutionChecklist
        label={executionLabel || "Confirm"}
        steps={executionSteps}
        currentIndex={executionStepIndex}
        busy={busy}
        txHash={txHash}
        network={activeNetwork}
        onDone={clearActiveTicket}
        hideDoneRow={planStepIndex === multiTicket.steps.length - 1}
      />
    </div>
) : (
      <button
        className="confirm hold-confirm"
        disabled={busy}
        onMouseDown={handleHoldStart}
        onMouseUp={handleHoldEnd}
        onMouseLeave={handleHoldEnd}
        onTouchStart={handleHoldStart}
        onTouchEnd={handleHoldEnd}
        onTouchCancel={handleHoldEnd}
      >
        <HoldSquares drawRef={holdCanvasDrawRef} />
        <span className="hold-content">Hold to Confirm</span>
      </button>
    )}

  </div>
)}

    </motion.div>
  </div>
)}


        {addressCheck && (
  <div className="backup-overlay">

    <div className="backup-panel">

      <div className="backup-header">
        <div>
          <div className="backup-title">
            ⚠ This address looks suspicious
          </div>

          <div className="backup-subtitle">
            {shortAddress(addressCheck.address)}
          </div>
        </div>
      </div>

      <div className="address-warning-reasons">
        {addressCheck.reasons.map((reason, i) => (
          <div className="address-warning-reason" key={i}>
            {reason}
          </div>
        ))}
      </div>

      <div className="address-warning-question">
        Are you sure you want to interact with it?
      </div>

      <div className="address-warning-actions">
        <button
          type="button"
          className="address-warning-no"
          onClick={() => {
            setAddressCheck(null);
            setShowSend(false);
            setPendingTransaction({ amount: null, recipient: null });

            setMessages(m => [
              ...m,
              {
                role: "ai",
                text: "Okay, cancelled. That address looked suspicious."
              }
            ]);
          }}
        >
          No
        </button>

        <button
          type="button"
          className="confirm address-warning-yes"
          onClick={() => {
            const proceed = addressCheck.proceed;
            setAddressCheck(null);
            proceed();
          }}
        >
          Yes, continue
        </button>
      </div>

    </div>

  </div>
)}

        {showUnlock && (
  <div className="backup-overlay">
    <div className="backup-panel unlock-panel">

      <div className="unlock-icon-circle">
        <Lock size={26} strokeWidth={1.8} />
      </div>

      <div className="unlock-title">Locked Wallet</div>
      <div className="unlock-subtitle">Your wallet is locked. Please unlock to continue.</div>

      <div className="unlock-password-field">
        <Lock size={15} strokeWidth={1.8} className="unlock-password-icon" />
        <input
          type={showUnlockPasswordText ? "text" : "password"}
          value={unlockPassword}
          onChange={e => {
            setUnlockPassword(e.target.value);
            setUnlockError("");
          }}
          onKeyDown={e => {
            if (e.key === "Enter") unlockWallet();
          }}
          placeholder="Enter your password"
          autoComplete="current-password"
          autoFocus
        />
        <button
          type="button"
          className="unlock-password-eye"
          onClick={() => setShowUnlockPasswordText(v => !v)}
          aria-label={showUnlockPasswordText ? "Hide password" : "Show password"}
        >
          {showUnlockPasswordText ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {unlockError && (
        <div className="seed-error">
          {unlockError}
        </div>
      )}

      <div className="unlock-actions">
        <button
          type="button"
          className="unlock-btn-gradient"
          onClick={unlockWallet}
        >
          <span>Unlock Wallet</span>
          <ArrowRight size={17} />
        </button>

        {biometricEnabled && (
          <>
            <div className="biometric-divider">or</div>
            <button
              type="button"
              className="biometric-outline-btn"
              onClick={unlockWithBiometric}
              disabled={biometricBusy}
            >
              {biometricBusy ? <Loader2 className="spin" size={16} /> : <Fingerprint size={16} />}
              Use Biometrics
            </button>
            {biometricError && <div className="seed-error">{biometricError}</div>}
          </>
        )}
      </div>

      <button
        type="button"
        className="forgot-password-link"
        onClick={openForgotPassword}
      >
        Forgot password?
      </button>

    </div>
  </div>
)}

        {showForgotPassword && (
  <div className="backup-overlay">

    <div className="backup-panel">

      <div className="backup-header">
        <div>
          <div className="backup-title">
            Recover access
          </div>

          <div className="backup-subtitle">
            Enter your full recovery phrase
          </div>
        </div>

        <button
          type="button"
          className="contacts-close"
          onClick={() => {
            setShowForgotPassword(false);
            setShowUnlock(true);
            setForgotWords({});
            setForgotError("");
          }}
        >
          <X size={18} />
        </button>
      </div>

      <div className="backup-warning">
        For your security, none of this information leaves your
        browser. Lyra never knows your recovery phrase or your
        password.
      </div>

      <div className="seed-length">

        <button
          type="button"
          className={forgotWordCount === 12 ? "active" : ""}
          onClick={() => {
            setForgotWordCount(12);
            setForgotWords({});
            setForgotError("");
          }}
        >
          12 words
        </button>

        <button
          type="button"
          className={forgotWordCount === 24 ? "active" : ""}
          onClick={() => {
            setForgotWordCount(24);
            setForgotWords({});
            setForgotError("");
          }}
        >
          24 words
        </button>

      </div>

      <div className="seed-input-grid">

        {Array.from({ length: forgotWordCount }, (_, i) => i).map(i => (
          <div className="seed-input-cell" key={i}>
            <span>{i + 1}</span>

            <input
              type="text"
              autoComplete="off"
              spellCheck="false"
              value={forgotWords[i] || ""}
              onChange={e => {
                const value = e.target.value.trim().toLowerCase();

                setForgotWords(current => ({
                  ...current,
                  [i]: value
                }));

                setForgotError("");
              }}
            />
          </div>
        ))}

      </div>

      {forgotError && (
        <div className="seed-error">
          {forgotError}
        </div>
      )}

      <button
        type="button"
        className="confirm"
        onClick={verifyForgotPasswordPhrase}
      >
        Verify my phrase
      </button>

    </div>

  </div>
)}

        {showSeedVerification && pendingMnemonic && (
  <div className="backup-overlay">

    <div className="backup-panel">

      <div className="backup-header">
        <div>
          <div className="backup-title">
            Verify your backup
          </div>

          <div className="backup-subtitle">
            Enter the 6 requested words
          </div>
        </div>
      </div>

      <div className="backup-warning">
        For your security, Lyra only asks for
        6 words of your recovery phrase.
      </div>

      <div className="seed-verification-list">

        {seedVerificationPositions.map(position => (
          <div
            className="seed-verification-row"
            key={position}
          >
            <span>
              Word #{position + 1}
            </span>

            <input
              type="text"
              autoComplete="off"
              spellCheck="false"
              placeholder="Enter the word"
              value={
                seedVerificationWords[position] || ""
              }
              onChange={e => {
                const value = e.target.value
                  .trim()
                  .toLowerCase();

                setSeedVerificationWords(current => ({
                  ...current,
                  [position]: value
                }));
              }}
            />
          </div>
        ))}

      </div>

      {seedVerificationError && (
        <div className="seed-error">
          {seedVerificationError}
        </div>
      )}

      <button
        type="button"
        className="confirm"
        onClick={() => {

          const words =
            pendingMnemonic.split(/\s+/);

          const valid =
            seedVerificationPositions.every(position => {

              const entered =
                seedVerificationWords[position]
                  ?.trim()
                  .toLowerCase();

              return entered ===
                words[position].toLowerCase();
            });

          if (!valid) {
            setSeedVerificationError(
              "One or more words are incorrect."
            );
            return;
          }

          setSeedVerificationError("");

          setShowSeedVerification(false);

setPendingPrivateKey(
  ethers.Wallet.fromPhrase(pendingMnemonic).privateKey
);

setNewPassword("");
setConfirmPassword("");
setPasswordSetupError("");

setShowPasswordSetup(true);

        }}
      >
        Verify
      </button>

    </div>

  </div>
)}

{showPasswordSetup && (
  <div className="backup-overlay">

    <div className="backup-panel">

      <div className="backup-header">
        <div>
          <div className="backup-title">
            {passwordSetupMode === "reset"
              ? "Choose a new password"
              : "Secure your wallet"}
          </div>

          <div className="backup-subtitle">
            {passwordSetupMode === "reset"
              ? "Your phrase was successfully verified"
              : passwordSetupMode === "import"
              ? "Create your Lyra password for this imported wallet"
              : "Create your Lyra password"}
          </div>
        </div>
      </div>

      <div className="backup-warning">
        This password will be required to open your wallet.
        Lyra cannot recover it if lost. Only your recovery
        phrase can.
      </div>

      <div className="password-field">
        <label>Password</label>

        <input
          type="password"
          value={newPassword}
          onChange={e => {
            setNewPassword(e.target.value);
            setPasswordSetupError("");
          }}
          placeholder="Your password"
          autoComplete="new-password"
        />
      </div>

      <div className="password-field">
        <label>Confirm password</label>

        <input
          type="password"
          value={confirmPassword}
          onChange={e => {
            setConfirmPassword(e.target.value);
            setPasswordSetupError("");
          }}
          placeholder="Repeat your password"
          autoComplete="new-password"
        />
      </div>

      {passwordSetupMode !== "reset" && (
        <div className="mpc-option-card">
          <span className="mpc-badge">Recommended</span>
          <label className="mpc-option-header">
            <input
              type="checkbox"
              checked={enableMpcOnSetup}
              onChange={e => setEnableMpcOnSetup(e.target.checked)}
            />
            Enable 2-of-2 protection
          </label>
          <div className="seed-import-description">
            Your private key is split into two halves: one stays on this device, the other is held by the backend and only released after you unlock. Neither half alone can move your funds.
          </div>
        </div>
      )}

      {passwordSetupMode !== "reset" && enableMpcOnSetup && (
        <div className="password-field">
          <label>Daily spending limit (USD, optional)</label>
          <input
            type="number"
            min="0"
            className="mpc-limit-input"
            value={mpcSetupLimit}
            onChange={e => setMpcSetupLimit(e.target.value)}
            placeholder="500"
          />
        </div>
      )}

      {passwordSetupError && (
        <div className="seed-error">
          {passwordSetupError}
        </div>
      )}

      <button
        type="button"
        className="confirm"
        onClick={async () => {

          if (newPassword.length < 8) {
            setPasswordSetupError(
              "The password must be at least 8 characters long."
            );
            return;
          }

          if (newPassword !== confirmPassword) {
            setPasswordSetupError(
              "The two passwords don't match."
            );
            return;
          }

          try {

            setPasswordSetupError("");

            const address = new ethers.Wallet(pendingPrivateKey).address;
            const shouldUseMpc = passwordSetupMode === "reset" ? resetMpcEnabled : enableMpcOnSetup;

            // What actually gets password-encrypted and stored locally:
            // fragment1 for an MPC wallet, the full key otherwise.
            let localSecret = pendingPrivateKey;
            let mpcFlag = false;

            if (shouldUseMpc) {
              if (passwordSetupMode === "reset") {
                // This address was already MPC-registered before the
                // password was lost. The recovery phrase just verified
                // (fromPhrase address match, above) is proof of
                // ownership on its own, so the backend releases
                // fragment2 without a biometric/limit gate here -- then
                // fragment1 = privateKey XOR fragment2 (XOR is its own
                // inverse, same combineFragments() does the split too).
                const fragment2 = await recoverFragment2(address);
                if (!fragment2) throw new Error("Couldn't find this wallet's backend key share.");
                localSecret = combineFragments(pendingPrivateKey, fragment2);
                mpcFlag = true;
              } else {
                const split = splitPrivateKey(pendingPrivateKey);
                const limit = Number(mpcSetupLimit);
                await registerMpcWallet(address, split.fragment2, Number.isFinite(limit) && limit > 0 ? limit : null);
                localSecret = split.fragment1;
                mpcFlag = true;
              }
            }

            const encrypted =
              await encryptPrivateKey(
                localSecret,
                newPassword
              );

            const mnemonicEnc = pendingMnemonic
              ? await encryptPrivateKey(pendingMnemonic, newPassword)
              : null;

            const encryptedWallet = {
              address,
              ...encrypted,
              ...(mnemonicEnc ? { mnemonicEnc } : {}),
              mpcEnabled: mpcFlag
            };

            localStorage.setItem(
              "plasma_wallet_v2",
              JSON.stringify(encryptedWallet)
            );

            setWallet({
              address: encryptedWallet.address
            });

            setUnlockedPrivateKey(pendingPrivateKey);
            localSecretRef.current = localSecret;
            sessionKeyCacheRef.current = pendingPrivateKey;
            setMpcEnabled(mpcFlag);

            setLocked(false);
            setShowPasswordSetup(false);
            setPendingPrivateKey(null);
            setEnableMpcOnSetup(false);

            setNewPassword("");
            setConfirmPassword("");

            const successText =
              passwordSetupMode === "reset"
                ? "Password reset successfully. Your wallet is unlocked."
                : passwordSetupMode === "import"
                ? `Wallet imported and secured: ${shortAddress(encryptedWallet.address)}.`
                : mpcFlag
                ? "Wallet secured with 2-of-2 protection: your key is split between this device and the backend."
                : "Wallet secured successfully. Your private key is now encrypted locally.";

            setToast(successText);

            setPasswordSetupMode("create");

            await refreshBalance(
              encryptedWallet.address
            );

          } catch (e) {

            console.error(e);

            setPasswordSetupError(
              e.message || "Couldn't secure the wallet."
            );
          }
        }}
      >
        Secure the wallet
      </button>

    </div>

  </div>
)}

      {showBackup && pendingMnemonic && (
  <div className="backup-overlay">

    <div className="backup-panel">

      <div className="backup-header">
        <div className="backup-title-row">
          <span className="backup-title">
            Back up your wallet
          </span>
          <span className="backup-subtitle">
            Recovery phrase
          </span>
        </div>
      </div>

      <div className="backup-warning">
        ⚠️ Write these words down somewhere safe and offline.
        Never share them with anyone.
      </div>

      <div className="seed-display">
        {pendingMnemonic
          .split(/\s+/)
          .map((word, index) => (
            <div
              className="seed-display-word"
              key={index}
            >
              <span>{index + 1}</span>
              <strong>{word}</strong>
            </div>
          ))}
      </div>

      <button
  type="button"
  className="confirm"
  onClick={() => {
    const words = pendingMnemonic.split(/\s+/);

    const positions = [];

    while (positions.length < 6) {
      const position =
        Math.floor(Math.random() * words.length);

      if (!positions.includes(position)) {
        positions.push(position);
      }
    }

    positions.sort((a, b) => a - b);

    setSeedVerificationPositions(positions);
    setSeedVerificationWords({});
    setSeedVerificationError("");

    setShowBackup(false);
    setShowSeedVerification(true);
  }}
>
  I've saved my phrase
</button>

    </div>

  </div>
)}

{showExportKey && (
  <div className="backup-overlay">
    <div className="backup-panel">
      <div className="backup-header">
        <div>
          <div className="backup-title">⚠ Reveal private key</div>
          <div className="backup-subtitle">{wallet?.address ? shortAddress(wallet.address) : ""}</div>
        </div>
        <button
          type="button"
          className="contacts-close"
          onClick={closeExportKey}
        >
          <X size={18} />
        </button>
      </div>

      <div className="backup-warning">
        ⚠️ Anyone with this key has full, irreversible control of your funds.
        Lyra staff will never ask you for it. Never share it, paste it
        anywhere, or give it to an AI or support agent.
      </div>

      {!exportedKey ? (
        <>
          <div className="password-field">
            <label>Confirm your password</label>
            <input
              type="password"
              value={exportPassword}
              onChange={e => { setExportPassword(e.target.value); setExportError(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleRevealPrivateKey(); }}
              placeholder="Your password"
              autoComplete="current-password"
              autoFocus
            />
          </div>
          {exportError && <div className="seed-error">{exportError}</div>}
          <button type="button" className="confirm" onClick={handleRevealPrivateKey}>
            Reveal private key
          </button>
        </>
      ) : (
        <>
          <div className="export-key-box">
            <span className={revealExportedKey ? "" : "export-key-blurred"}>
              {exportedKey}
            </span>
            <button
              type="button"
              className="export-key-eye"
              onClick={() => setRevealExportedKey(v => !v)}
              aria-label={revealExportedKey ? "Hide" : "Show"}
            >
              {revealExportedKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <button
            type="button"
            className="confirm"
            onClick={() => {
              copy(exportedKey);
              setToast("Private key copied. Paste it somewhere safe, then clear your clipboard.");
            }}
          >
            <Copy size={15} /> Copy to clipboard
          </button>

          <button
            type="button"
            className="forgot-password-link"
            onClick={closeExportKey}
          >
            Done, close
          </button>
        </>
      )}
    </div>
  </div>
)}

{showExportSeed && (
  <div className="backup-overlay">
    <div className="backup-panel">
      <div className="backup-header">
        <div>
          <div className="backup-title">⚠ Reveal seed phrase</div>
          <div className="backup-subtitle">{wallet?.address ? shortAddress(wallet.address) : ""}</div>
        </div>
        <button
          type="button"
          className="contacts-close"
          onClick={closeExportSeed}
        >
          <X size={18} />
        </button>
      </div>

      <div className="backup-warning">
        ⚠️ Anyone with this phrase has full, irreversible control of your funds.
        Lyra staff will never ask you for it. Never share it, paste it
        anywhere, or give it to an AI or support agent.
      </div>

      {!exportedSeed ? (
        <>
          <div className="password-field">
            <label>Confirm your password</label>
            <input
              type="password"
              value={exportSeedPassword}
              onChange={e => { setExportSeedPassword(e.target.value); setExportSeedError(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleRevealSeedPhrase(); }}
              placeholder="Your password"
              autoComplete="current-password"
              autoFocus
            />
          </div>
          {exportSeedError && <div className="seed-error">{exportSeedError}</div>}
          <button type="button" className="confirm" onClick={handleRevealSeedPhrase}>
            Reveal seed phrase
          </button>
        </>
      ) : (
        <>
          <div className={`seed-display ${revealExportedSeed ? "" : "seed-display-blurred"}`}>
            {exportedSeed.split(/\s+/).map((word, index) => (
              <div className="seed-display-word" key={index}>
                <span>{index + 1}</span>
                <strong>{word}</strong>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="export-key-eye seed-reveal-toggle"
            onClick={() => setRevealExportedSeed(v => !v)}
          >
            {revealExportedSeed ? <EyeOff size={15} /> : <Eye size={15} />}
            {revealExportedSeed ? "Hide" : "Show"}
          </button>

          <button
            type="button"
            className="confirm seed-copy-btn"
            onClick={() => {
              copy(exportedSeed);
              setToast("Seed phrase copied. Paste it somewhere safe, then clear your clipboard.");
            }}
          >
            <Copy size={15} /> Copy to clipboard
          </button>
        </>
      )}
    </div>
  </div>
)}

{showResetConfirm && (
  <div className="backup-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowResetConfirm(false); }}>
    <div className="backup-panel">
      <div className="backup-header">
        <div>
          <div className="backup-title">Reset wallet</div>
          <div className="backup-subtitle">This removes the wallet from this device</div>
        </div>
        <button type="button" className="contacts-close" onClick={() => setShowResetConfirm(false)}>
          <X size={18} />
        </button>
      </div>

      <div className="backup-warning">
        ⚠️ This does NOT delete your funds, they stay on-chain. But without
        your recovery phrase, you won't be able to access this wallet again
        on this device.
      </div>

      <div className="address-warning-actions">
        <button type="button" className="address-warning-no" onClick={() => setShowResetConfirm(false)}>
          Cancel
        </button>
        <button type="button" className="confirm confirm-danger" onClick={resetWallet}>
          Reset
        </button>
      </div>
    </div>
  </div>
)}

{showSettings && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
  >
    <div className="contacts-panel">
      <div className="contacts-header">
        <div className="contacts-title">Settings</div>
        <button type="button" className="contacts-close" onClick={() => setShowSettings(false)}>
          <X size={18} />
        </button>
      </div>

      <div className="settings-list">

        <div className="settings-section-label">General</div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Auto-lock</div>
            <div className="settings-row-desc">Lock the wallet after inactivity</div>
          </div>
          <div className="custom-select" ref={autoLockMenuRef}>
            <button
              type="button"
              className={`custom-select-trigger ${autoLockMenuOpen ? "open" : ""}`}
              onClick={() => setAutoLockMenuOpen(o => !o)}
            >
              {AUTO_LOCK_OPTIONS.find(o => o.value === autoLockMinutes)?.label}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <AnimatePresence>
              {autoLockMenuOpen && (
                <motion.div
                  className="custom-select-menu"
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                >
                  {AUTO_LOCK_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`custom-select-option ${autoLockMinutes === opt.value ? "active" : ""}`}
                      onClick={() => { setAutoLockMinutes(opt.value); setAutoLockMenuOpen(false); }}
                    >
                      {opt.label}
                      {autoLockMinutes === opt.value && <Check size={13} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Network</div>
            <div className="settings-row-desc">{activeNetwork.name} · Chain ID {activeNetwork.chainId}</div>
          </div>
        </div>

        <div className="settings-row">
  <div className="settings-row-info">
    <div className="settings-row-title">Biometric unlock</div>
    <div className="settings-row-desc">
      {!biometricSupported
        ? "Not supported on this device"
        : biometricEnabled
        ? "Enabled for this wallet"
        : "Use Touch ID / Windows Hello instead of your password"}
    </div>
  </div>
  {biometricSupported && (
    <label className={`toggle-switch ${biometricBusy ? "busy" : ""}`}>
      <input
        type="checkbox"
        checked={biometricEnabled}
        disabled={biometricBusy}
        onChange={() => biometricEnabled ? disableBiometric() : enableBiometric()}
      />
      <span className="toggle-switch-track">
        <span className="toggle-switch-thumb" />
      </span>
    </label>
  )}
</div>
{biometricError && <div className="seed-error">{biometricError}</div>}

{mpcEnabled && (
  <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
    <div className="settings-row-info">
      <div className="settings-row-title">2-of-2 protection (MPC)</div>
      <div className="settings-row-desc">
        {mpcStatus
          ? `Enabled · $${mpcStatus.spentTodayUsd?.toFixed?.(2) ?? 0} spent today${mpcStatus.dailyLimitUsd != null ? ` of $${mpcStatus.dailyLimitUsd} limit` : " · no limit set"}`
          : "Enabled"}
      </div>
    </div>
    <div className="mpc-limit-row">
      <input
        type="number"
        min="0"
        className="mpc-limit-input"
        value={mpcLimitInput}
        onChange={e => setMpcLimitInput(e.target.value)}
        placeholder={mpcStatus?.dailyLimitUsd != null ? String(mpcStatus.dailyLimitUsd) : "No limit"}
      />
      <button
        type="button"
        className="settings-action-row mpc-limit-btn"
        disabled={mpcBusy || !mpcLimitInput}
        onClick={async () => {
          setMpcBusy(true);
          setMpcError("");
          try {
            const limit = Number(mpcLimitInput);
            if (!Number.isFinite(limit) || limit < 0) throw new Error("Enter a valid daily limit.");
            await setMpcDailyLimit(wallet.address, limit);
            const status = await getMpcStatus(wallet.address);
            setMpcStatus(status);
            setMpcLimitInput("");
            setToast("Daily spending limit updated.");
          } catch (e) {
            setMpcError(e.message || "Couldn't update the limit.");
          } finally {
            setMpcBusy(false);
          }
        }}
      >
        Set limit
      </button>
    </div>
    {mpcError && <div className="seed-error">{mpcError}</div>}
  </div>
)}

        <div className="settings-section-label">Security</div>

        <button
          type="button"
          className="settings-action-row"
          onClick={() => {
            setShowSettings(false);
            setExportPassword("");
            setExportedKey(null);
            setExportError("");
            setRevealExportedKey(false);
            setShowExportKey(true);
          }}
        >
          <KeyRound size={16} strokeWidth={1.8} />
          <span>Export Private Key</span>
        </button>

        <button
          type="button"
          className="settings-action-row"
          onClick={() => {
            setShowSettings(false);
            setExportSeedPassword("");
            setExportedSeed(null);
            setExportSeedError("");
            setRevealExportedSeed(false);
            setShowExportSeed(true);
          }}
        >
          <List size={16} strokeWidth={1.8} />
          <span>Export your seed phrase</span>
        </button>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Require biometric above</div>
            <div className="settings-row-desc">Any signed operation at or above this amount also needs a biometric re-confirmation{!biometricEnabled ? " (enable biometric unlock above first)" : ""}.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <span>$</span>
            <input
              type="number"
              min="0"
              className="contact-input"
              style={{ width: 70, textAlign: "right" }}
              value={biometricThresholdUSD}
              onChange={(e) => setBiometricThresholdUSD(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        <div className="settings-section-label">x402</div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Spending limit</div>
            <div className="settings-row-desc">Blocks any single x402 payment or ACP checkout above this amount, before it's ever signed.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <span>$</span>
            <input
              type="number"
              min="0"
              className="contact-input"
              style={{ width: 70, textAlign: "right" }}
              value={x402SpendLimitUSD}
              onChange={(e) => setX402SpendLimitUSD(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        <button
          type="button"
          className="settings-action-row"
          onClick={() => {
            setAuditLogEntries(loadAuditLog());
            setShowSettings(false);
            setShowAuditLog(true);
          }}
        >
          <History size={16} strokeWidth={1.8} />
          <span>Audit Trail</span>
        </button>

        <div className="settings-section-label">Multisig</div>

        {multisigSafes.length > 0 && multisigSafes.map(safe => (
          <button
            type="button"
            key={safe.address}
            className="settings-action-row"
            onClick={() => { setShowSettings(false); openMultisigManage(safe); }}
          >
            <ShieldCheck size={16} strokeWidth={1.8} />
            <span>
              {getNetworkByKey(safe.network).name} · {shortAddress(safe.address)}
              <span className="settings-row-desc" style={{ display: "block", marginTop: 2 }}>
                {safe.owners.length} owners · {safe.threshold}-of-{safe.owners.length} to send
              </span>
            </span>
          </button>
        ))}

        {isSafeSupportedNetwork(activeNetworkKey) ? (
          <button
            type="button"
            className="settings-action-row"
            onClick={() => { setShowSettings(false); setMultisigSetupError(""); setShowMultisigSetup(true); }}
          >
            <Users size={16} strokeWidth={1.8} />
            <span>Set up a multisig on {activeNetwork.name}</span>
          </button>
        ) : (
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Multisig</div>
              <div className="settings-row-desc">
                Not available on {activeNetwork.name} yet. Switch to {SAFE_SUPPORTED_NETWORK_KEYS.map(k => getNetworkByKey(k).name).join(", ")}.
              </div>
            </div>
          </div>
        )}

        <div className="settings-section-label danger">Danger Zone</div>

        <button
          type="button"
          className="settings-action-row danger"
          onClick={() => { setShowSettings(false); setShowResetConfirm(true); }}
        >
          <Trash2 size={16} strokeWidth={1.8} />
          <span>Reset Wallet</span>
        </button>

      </div>
    </div>
  </div>
)}

       {showContacts && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) {
        setShowContacts(false);
        setShowAddContact(false);
        setEditingContact(null);
        setContactSearch("");
      }
    }}
  >
    <div className="contacts-panel">

      <div className="contacts-header">
        <div>
          <div className="contacts-title">Contacts</div>
          <div className="contacts-subtitle">
            Saved addresses
          </div>
        </div>

        <div className="contacts-header-actions">
          <div className="contacts-search">
            <Search size={13} />
            <input
              type="text"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Search by name"
              aria-label="Search contacts by name"
            />
          </div>

          <button
            type="button"
            className="contacts-close"
            onClick={() => {
              setShowContacts(false);
              setShowAddContact(false);
              setEditingContact(null);
              setContactSearch("");
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="contacts-io-row">
        <button
          type="button"
          className="contacts-io-button"
          disabled={contacts.length === 0}
          onClick={() => {
            const blob = new Blob([JSON.stringify(loadContacts(), null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "lyra-contacts.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={13} />
          Export
        </button>

        <button
          type="button"
          className="contacts-io-button"
          onClick={() => importContactsInputRef.current?.click()}
        >
          <Upload size={13} />
          Import
        </button>

        <input
          type="file"
          accept="application/json"
          ref={importContactsInputRef}
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const text = await file.text();
              const { contacts: updated, added, skipped } = importContactsData(text);
              setContacts(updated);
              setToast(
                added > 0
                  ? `${added} contact${added === 1 ? "" : "s"} imported${skipped ? ` (${skipped} skipped)` : ""}.`
                  : "No new contacts to import."
              );
            } catch (err) {
              console.error("Contact import failed:", err);
              setToast("Couldn't import that file, make sure it's a contacts export from Lyra.");
            }
          }}
        />
      </div>

      <div className="contacts-list">

        {contacts.length === 0 ? (
          <div className="contacts-empty">
            No saved contacts.
          </div>
        ) : contacts.filter(c => c.name.toLowerCase().includes(contactSearch.trim().toLowerCase())).length === 0 ? (
          <div className="contacts-empty">
            No contacts match "{contactSearch.trim()}".
          </div>
        ) : (
          contacts
            .map((contact, index) => ({ contact, index }))
            .filter(({ contact }) => contact.name.toLowerCase().includes(contactSearch.trim().toLowerCase()))
            .map(({ contact, index }) => (
            <div className="contact-item" key={index}>

              {editingContact === index ? (

                <div className="contact-edit">

                  <input
                    type="text"
                    value={contact.name}
                    onChange={(e) => {
                      const updated = [...contacts];
                      updated[index] = {
                        ...updated[index],
                        name: e.target.value
                      };
                      setContacts(updated);
                    }}
                    placeholder="Name"
                    className="contact-input"
                  />

                  <input
                    type="text"
                    value={contact.address}
                    onChange={(e) => {
                      const updated = [...contacts];
                      updated[index] = {
                        ...updated[index],
                        address: e.target.value
                      };
                      setContacts(updated);
                    }}
                    placeholder="Address"
                    className="contact-input"
                  />

                  <div className="contact-edit-actions">

                    <button
                      type="button"
                      className="contact-save"
                      onClick={() => {
                        saveContacts(contacts);
                        setEditingContact(null);
                      }}
                    >
                      <Check size={15} />
                      Save
                    </button>

                    <button
                      type="button"
                      className="contact-cancel"
                      onClick={() => setEditingContact(null)}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className="contact-delete"
                      onClick={() => {
                        const updated = contacts.filter((_, i) => i !== index);
                        setContacts(updated);
                        saveContacts(updated);
                        setEditingContact(null);
                      }}
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>

                  </div>

                </div>

              ) : (

                <>
                  <div className="contact-info">

                    <div className="contact-name">
                      {contact.name}
                    </div>

                    <div className="contact-address">
                      {contact.address}
                    </div>

                  </div>

                  <button
                    type="button"
                    className="contact-edit-button"
                    onClick={() => setEditingContact(index)}
                    aria-label={`Edit ${contact.name}`}
                    title="Edit"
                  >
                    <Pencil size={15} strokeWidth={1.8} />
                  </button>
                </>

              )}

            </div>
          ))
        )}

      </div>

      {!showAddContact ? (

        <button
          type="button"
          className="add-contact-button"
          onClick={() => setShowAddContact(true)}
        >
          <Plus size={16} />
          Add contact
        </button>

      ) : (

        <div className="add-contact-form">

          <div className="add-contact-title">
            New contact
          </div>

          <input
            type="text"
            value={newContactName}
            onChange={(e) => setNewContactName(e.target.value)}
            placeholder="Contact name"
            className="contact-input"
            autoFocus
          />

          <input
            type="text"
            value={newContactAddress}
            onChange={(e) => setNewContactAddress(e.target.value)}
            placeholder="Wallet address"
            className="contact-input"
          />

          <div className="add-contact-actions">

            <button
              type="button"
              className="contact-save"
              onClick={() => {
  const name = newContactName.trim();
  const address = newContactAddress.trim();

  if (!name) {
    alert("Please enter a name.");
    return;
  }

  if (!ethers.isAddress(address)) {
    alert("Invalid wallet address.");
    return;
  }

  const updatedContacts = [
    ...contacts,
    {
      name,
      address
    }
  ];

  setContacts(updatedContacts);
  saveContacts(updatedContacts);

  setNewContactName("");
  setNewContactAddress("");
  setShowAddContact(false);
}}
            >
              <Check size={15} />
              Save
            </button>

            <button
              type="button"
              className="contact-cancel"
              onClick={() => {
                setShowAddContact(false);
                setNewContactName("");
                setNewContactAddress("");
              }}
            >
              Cancel
            </button>

          </div>

        </div>

      )}

    </div>
  </div>
)}

{showAuditLog && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAuditLog(false); }}
  >
    <motion.div className="contacts-panel" layout="size" transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}>
      <div className="contacts-header">
        <div className="contacts-title">Audit Trail</div>
        <button type="button" className="contacts-close" onClick={() => setShowAuditLog(false)} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="contacts-list">
        {auditLogEntries.length === 0 && (
          <div className="contacts-empty">Nothing logged yet. Every send, swap, bridge, stake, prediction, x402 payment, ACP checkout, and agent delegation (A2A) will show up here.</div>
        )}
        {auditLogEntries.map(entry => {
          const date = new Date(entry.timestamp);
          const statusColor = { success: "#4ade80", blocked: "#facc15", failed: "#f87171" }[entry.status] || "#c9c9d9";
          return (
            <div className="tx-item" key={entry.id} style={{ width: "100%" }}>
              <div className="tx-item-main">
                <div className="tx-item-direction">
                  {entry.category} · {entry.action}
                  <span style={{ color: statusColor, marginLeft: 6, fontSize: 11 }}>{entry.status}</span>
                </div>
                <div className="tx-item-date">
                  {date.toLocaleDateString("en-US")} · {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  {entry.networkKey ? ` · ${getNetworkByKey(entry.networkKey).name}` : ""}
                  {entry.reason ? ` · ${entry.reason.replace(/_/g, " ")}` : ""}
                </div>
              </div>
              {(entry.amount || entry.amountUSD != null) && (
                <div className="tx-item-amount">
                  {entry.amount ? `${entry.amount} ${entry.asset || ""}` : `$${entry.amountUSD}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {auditLogEntries.length > 0 && (
        <button
          type="button"
          className="settings-action-row danger"
          onClick={() => { clearAuditLog(); setAuditLogEntries([]); }}
        >
          <Trash2 size={16} strokeWidth={1.8} />
          <span>Clear log</span>
        </button>
      )}
    </motion.div>
  </div>
)}

{showMultisigSetup && !multisigReviewing && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => { if (e.target === e.currentTarget) closeMultisigSetup(); }}
  >
    <div className="contacts-panel multisig-setup-panel">
      <div className="contacts-header">
        <div className="contacts-title">Set up a multisig</div>
        <button type="button" className="contacts-close" onClick={closeMultisigSetup}>
          <X size={18} />
        </button>
      </div>

      <div className="multisig-setup-body">

      <div className="multisig-intro">
        <div className="multisig-intro-title">
          <ShieldCheck size={15} strokeWidth={2} />
          What is a multisig?
        </div>
        <p className="multisig-intro-text">
          A multisig wallet needs approval from several trusted people before any transaction goes through, never just one. You pick a small group of co-owners and how many of them have to approve a transfer before it's sent. Until enough people say yes, the funds don't move, not even for you alone.
        </p>
        <p className="multisig-intro-text">
          This creates a brand new wallet address on {activeNetwork.name}, separate from the one you use now. You'll need to send funds to it before it holds anything.
        </p>
        {activeNetworkKey === "plasma" && (
          <p className="multisig-intro-text">
            One difference here on Plasma: sending stablecoins normally has zero fees, but that only covers a plain transfer. A multisig transaction is a contract call, so it pays a small real {activeNetwork.nativeSymbol} network fee like on any other chain.
          </p>
        )}
      </div>

      <div className="multisig-field-label">
        Owners <span className="multisig-field-count">{multisigTotalOwners} of {MULTISIG_MAX_OWNERS} max</span>
      </div>

      <div className="multisig-owner-list">
        <div className="multisig-owner-row">
          <div className="multisig-owner-info">
            <div className="multisig-owner-name">You</div>
            <div className="multisig-owner-address">{wallet ? shortAddress(wallet.address) : "…"}</div>
          </div>
          <span className="multisig-owner-tag">Owner #1</span>
        </div>

        {multisigOwners.map((o, i) => (
          <div className="multisig-owner-row" key={o.address}>
            <div className="multisig-owner-info">
              <div className="multisig-owner-name">{o.name || `Owner #${i + 2}`}</div>
              <div className="multisig-owner-address">{shortAddress(o.address)}</div>
            </div>
            <button
              type="button"
              className="multisig-owner-remove"
              onClick={() => removeMultisigOwner(o.address)}
              aria-label="Remove owner"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {multisigTotalOwners >= MULTISIG_MAX_OWNERS ? (
        <div className="settings-row-desc">Maximum of {MULTISIG_MAX_OWNERS} owners reached.</div>
      ) : multisigAddMode === null ? (
        <div className="multisig-add-buttons">
          <button type="button" className="contacts-io-button" onClick={() => setMultisigAddMode("contact")}>
            <UserRound size={14} strokeWidth={1.8} />
            Add contact
          </button>
          <button type="button" className="contacts-io-button" onClick={() => setMultisigAddMode("address")}>
            <Plus size={14} strokeWidth={1.8} />
            Add address
          </button>
        </div>
      ) : multisigAddMode === "contact" ? (
        <div className="multisig-contact-picker">
          {(() => {
            const available = contacts.filter(c =>
              c.address.toLowerCase() !== wallet?.address?.toLowerCase() &&
              !multisigOwners.some(o => o.address.toLowerCase() === c.address.toLowerCase())
            );
            return available.length === 0 ? (
              <div className="settings-row-desc">No saved contacts to add. Try "Add address" instead.</div>
            ) : (
              available.map(c => (
                <button
                  type="button"
                  key={c.address}
                  className="multisig-contact-option"
                  onClick={() => { if (addMultisigOwner(c.address, c.name)) setMultisigAddMode(null); }}
                >
                  <span>{c.name}</span>
                  <span className="multisig-owner-address">{shortAddress(c.address)}</span>
                </button>
              ))
            );
          })()}
          <button type="button" className="contacts-io-button" onClick={() => setMultisigAddMode(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="multisig-add-address">
          <input
            type="text"
            value={multisigAddressDraft}
            onChange={(e) => setMultisigAddressDraft(e.target.value)}
            placeholder="0x..."
            className="contact-input"
            autoFocus
          />
          <div className="add-contact-actions">
            <button
              type="button"
              className="contact-save"
              onClick={() => {
                if (addMultisigOwner(multisigAddressDraft)) {
                  setMultisigAddressDraft("");
                  setMultisigAddMode(null);
                }
              }}
            >
              Add
            </button>
            <button
              type="button"
              className="contacts-io-button"
              onClick={() => { setMultisigAddMode(null); setMultisigAddressDraft(""); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="multisig-field-label" style={{ marginTop: 18 }}>Signatures required</div>
      <div className="settings-row-desc">
        How many of the owners above must say yes before a transaction can send funds? Tap a number below.
      </div>

      <div className="multisig-threshold-row">
        {/* Always all 5 possible slots, not just up to the current
            owner count: showing only 1 or 2 buttons early on reads
            as "that's the max", the greyed-out remaining slots
            make the real ceiling (5) obvious from the very first
            owner added. */}
        {Array.from({ length: MULTISIG_MAX_OWNERS }, (_, i) => i + 1).map(n => {
          const unavailable = n > multisigTotalOwners;
          return (
            <button
              type="button"
              key={n}
              className={`multisig-threshold-btn ${multisigThreshold === n ? "active" : ""}`}
              disabled={unavailable}
              title={unavailable ? `Add ${n - multisigTotalOwners} more owner${n - multisigTotalOwners > 1 ? "s" : ""} to require ${n} signatures` : undefined}
              onClick={() => setMultisigThreshold(n)}
            >
              {n}
            </button>
          );
        })}
        <span className="multisig-threshold-of">of {multisigTotalOwners}</span>
      </div>

      <div className="multisig-threshold-summary">
        Any <strong>{multisigThreshold}</strong> of your <strong>{multisigTotalOwners}</strong> owner{multisigTotalOwners > 1 ? "s" : ""} will need to approve before funds move
        {multisigThreshold === multisigTotalOwners && multisigTotalOwners > 1
          ? " — every single owner must agree."
          : multisigThreshold === 1 && multisigTotalOwners > 1
            ? ", any one of them alone is enough."
            : "."}
      </div>

      {multisigSetupError && <div className="seed-error">{multisigSetupError}</div>}

      <div className="multisig-actions">
        <button
          type="button"
          className="multisig-btn-primary"
          disabled={multisigOwners.length === 0}
          onClick={goToMultisigReview}
        >
          Review
        </button>
        <button
          type="button"
          className="multisig-btn-secondary"
          onClick={closeMultisigSetup}
        >
          Cancel
        </button>
      </div>

      </div>
    </div>
  </div>
)}

{/* A genuinely separate page, not a swapped section of the setup
    modal above: its own overlay/panel/header, mounted fresh when
    "Review" is pressed (and unmounted on "Back"), so it reads as
    navigating somewhere else rather than the form silently changing
    underneath you right before the money-moving action. */}
{showMultisigSetup && multisigReviewing && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => { if (e.target === e.currentTarget) closeMultisigSetup(); }}
  >
    <div className="contacts-panel multisig-setup-panel">
      <div className="contacts-header">
        <div className="contacts-title">Review & deploy</div>
        <button type="button" className="contacts-close" onClick={closeMultisigSetup}>
          <X size={18} />
        </button>
      </div>

      <div className="multisig-setup-body">

      <div className="multisig-field-label">Owners</div>

      <div className="multisig-owner-list">
        <div className="multisig-owner-row">
          <div className="multisig-owner-info">
            <div className="multisig-owner-name">You</div>
            <div className="multisig-owner-address">{wallet ? shortAddress(wallet.address) : "…"}</div>
          </div>
          <span className="multisig-owner-tag">Owner #1</span>
        </div>
        {multisigOwners.map((o, i) => (
          <div className="multisig-owner-row" key={o.address}>
            <div className="multisig-owner-info">
              <div className="multisig-owner-name">{o.name || `Owner #${i + 2}`}</div>
              <div className="multisig-owner-address">{shortAddress(o.address)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="multisig-review-summary">
        On <strong>{activeNetwork.name}</strong>, any <strong>{multisigThreshold}</strong> of these <strong>{multisigTotalOwners}</strong> owners will need to approve before any funds can be sent
        {multisigThreshold === multisigTotalOwners && multisigTotalOwners > 1
          ? " — every single owner must agree, no exceptions."
          : multisigThreshold === 1 && multisigTotalOwners > 1
            ? ", any one of them alone is enough."
            : "."}
      </div>

      <div className="settings-row-desc" style={{ marginTop: 8 }}>
        This can't be undone from here: once deployed, removing or adding owners later needs its own approved transaction.
      </div>

      {multisigSetupError && <div className="seed-error">{multisigSetupError}</div>}

      <div className="multisig-actions">
        <button
          type="button"
          className="multisig-btn-primary"
          disabled={multisigDeploying}
          onClick={deployMultisigSafe}
        >
          {multisigDeploying ? "Deploying…" : "Confirm & Deploy"}
        </button>
        <button
          type="button"
          className="multisig-btn-secondary"
          disabled={multisigDeploying}
          onClick={() => setMultisigReviewing(false)}
        >
          Back
        </button>
      </div>

      </div>
    </div>
  </div>
)}

{activeMultisigSafe && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => { if (e.target === e.currentTarget) setActiveMultisigSafe(null); }}
  >
    <div className="contacts-panel">
      <div className="contacts-header">
        <div className="contacts-title">
          {getNetworkByKey(activeMultisigSafe.network).name} multisig
        </div>
        <button type="button" className="contacts-close" onClick={() => setActiveMultisigSafe(null)}>
          <X size={18} />
        </button>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">{shortAddress(activeMultisigSafe.address)}</div>
          <div className="settings-row-desc">
            {activeMultisigSafe.threshold}-of-{activeMultisigSafe.owners.length} owners ·{" "}
            {multisigBalance === null ? "Loading balance…" : `${ethers.formatEther(multisigBalance)} ${getNetworkByKey(activeMultisigSafe.network).nativeSymbol}`}
          </div>
        </div>
      </div>

      {multisigActionError && <div className="seed-error">{multisigActionError}</div>}

      <div className="add-contact-form">
        <div className="add-contact-title">Propose a transfer</div>

        <input
          type="text"
          value={multisigProposeTo}
          onChange={(e) => setMultisigProposeTo(e.target.value)}
          placeholder="Recipient address"
          className="contact-input"
        />
        <input
          type="text"
          value={multisigProposeAmount}
          onChange={(e) => setMultisigProposeAmount(e.target.value)}
          placeholder={`Amount (${getNetworkByKey(activeMultisigSafe.network).nativeSymbol})`}
          className="contact-input"
        />

        <div className="add-contact-actions">
          <button
            type="button"
            className="contact-save"
            disabled={multisigActionBusy}
            onClick={handleMultisigPropose}
          >
            {multisigActionBusy ? "Working…" : "Propose"}
          </button>
        </div>
      </div>

      <div className="settings-section-label">
        {multisigLoading ? "Loading pending approvals…" : `Pending approvals (${multisigPending.length})`}
      </div>

      {!multisigLoading && multisigPending.length === 0 && (
        <div className="settings-row-desc">Nothing waiting on a signature right now.</div>
      )}

      {multisigPending.map(p => {
        const confirmed = (p.confirmations || []).length;
        const required = p.confirmationsRequired;
        const alreadySigned = (p.confirmations || []).some(
          c => c.owner?.toLowerCase() === wallet?.address?.toLowerCase()
        );
        return (
          <div className="settings-row" key={p.safeTxHash}>
            <div className="settings-row-info">
              <div className="settings-row-title">
                Send {ethers.formatEther(p.value || "0")} {getNetworkByKey(activeMultisigSafe.network).nativeSymbol} to {shortAddress(p.to)}
              </div>
              <div className="settings-row-desc">{confirmed}/{required} signatures</div>
            </div>
            <button
              type="button"
              className="contacts-io-button"
              disabled={multisigActionBusy || alreadySigned}
              onClick={() => handleMultisigConfirm(p.safeTxHash)}
            >
              {alreadySigned ? "Signed" : "Approve"}
            </button>
          </div>
        );
      })}
    </div>
  </div>
)}

{showTxHistory && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) {
        setShowTxHistory(false);
        setTxHistoryTab(null);
      }
    }}
  >
    <motion.div className="contacts-panel" layout="size" transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}>

      <div className="contacts-header tx-history-header">
        <div className="contacts-title">
          Transactions history
          {wallet?.address && <span className="usd-dot"> · </span>}
          {wallet?.address && <span className="tx-history-address">{shortAddress(wallet.address)}</span>}
        </div>

        <button
          type="button"
          className="contacts-close"
          onClick={() => { setShowTxHistory(false); setTxHistoryTab(null); }}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="tx-history-grid">
        {[
          { key: "send", label: "Send/Receive" },
          { key: "swap", label: "Swap" },
          { key: "stake", label: "Stake" },
          { key: "bridge", label: "Bridge" },
          { key: "predictions", label: "Predictions" },
          { key: "x402", label: "x402" },
          { key: "a2a", label: "A2A" },
          { key: "acp", label: "ACP" }
        ].map(tab => (
          <motion.button
            key={tab.key}
            type="button"
            className="tx-history-tile"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => {
              setTxHistoryTab(tab.key);
              if (tab.key === "predictions") loadPredictions();
            }}
          >
            {tab.label}
          </motion.button>
        ))}
      </div>

    </motion.div>

    {/* The picked category's own transactions, opens on top of the
        grid above (its own backdrop, its own close X), rather than
        swapping the grid out in place. */}
    <AnimatePresence>
      {txHistoryTab && (
        <motion.div
          className="tx-history-detail-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setTxHistoryTab(null);
          }}
        >
          <motion.div
            className="contacts-panel"
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 14 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
          >
            <div className="contacts-header">
              <div className="contacts-title">
                {{ send: "Send/Receive", swap: "Swap", stake: "Stake", bridge: "Bridge", predictions: "Predictions", x402: "x402", a2a: "A2A", acp: "ACP" }[txHistoryTab]}
              </div>
              <button
                type="button"
                className="contacts-close"
                onClick={() => setTxHistoryTab(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

      <div className="contacts-list">
      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={txHistoryTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        style={{ display: "flex", flexDirection: "column", gap: "8px" }}
      >

        {txHistoryTab === "predictions" ? (
          <>
            {predictionsLoading && (
              <div className="contacts-empty">
                <Loader2 size={16} className="spin" /> Loading…
              </div>
            )}

            {!predictionsLoading && predictionsError && (
              <div className="contacts-empty">{predictionsError}</div>
            )}

            {!predictionsLoading && !predictionsError && predictionsList.length === 0 && (
              <div className="contacts-empty">
                No Polymarket bets found.
              </div>
            )}

            {!predictionsLoading && !predictionsError && predictionsList.map((item) => {
              const badge = {
                opened: { label: "Opened", bg: "#0b3d1f", fg: "#4ade80" },
                live: { label: "Live", bg: "#7c4a03", fg: "#ffb84d" },
                closed: { label: "Completed", bg: "#4a0f0f", fg: "#f87171" },
                "cashed-out": { label: "Cashed Out", bg: "#1e2f5c", fg: "#7ba7ff" }
              }[item.status];

              return (
                <button
                  type="button"
                  className="tx-item"
                  key={item.key}
                  onClick={() => openPredictionDetail(item)}
                  style={{ width: "100%", textAlign: "left", cursor: "pointer", position: "relative" }}
                >
                  <div className="tx-item-main">
                    <div className="tx-item-direction">{item.title || item.outcome || "Polymarket bet"}</div>
                    <div className="tx-item-date">
                      {item.outcome} · {item.size} shares @ ${item.price}
                    </div>
                  </div>

                  <span style={{
                    position: "absolute",
                    bottom: "6px",
                    right: "10px",
                    background: badge.bg,
                    color: badge.fg,
                    borderRadius: "999px",
                    padding: "2px 7px",
                    fontSize: "9.5px",
                    fontWeight: 600,
                    whiteSpace: "nowrap"
                  }}>
                    {badge.label}
                  </span>
                </button>
              );
            })}
          </>
        ) : txHistoryTab === "x402" ? (
          <>
            {loadAuditLogByCategory("x402").length === 0 && (
              <div className="contacts-empty">No x402 payments yet.</div>
            )}
            {loadAuditLogByCategory("x402").map((entry) => {
              const badge = {
                success: { label: "Paid", bg: "#0b3d1f", fg: "#4ade80" },
                blocked: { label: "Blocked", bg: "#4a3b0f", fg: "#facc15" },
                failed: { label: "Failed", bg: "#4a0f0f", fg: "#f87171" }
              }[entry.status] || { label: entry.status, bg: "#2a2a3a", fg: "#c9c9d9" };
              const date = new Date(entry.timestamp);

              return (
                <div className="tx-item" key={entry.id} style={{ width: "100%", position: "relative" }}>
                  <div className="tx-item-main">
                    <div className="tx-item-direction" style={{ wordBreak: "break-all" }}>{entry.url || "x402 payment"}</div>
                    <div className="tx-item-date">
                      {date.toLocaleDateString("en-US")} · {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      {entry.reason ? ` · ${entry.reason.replace(/_/g, " ")}` : ""}
                    </div>
                  </div>
                  {entry.amountUSD != null && (
                    <div className="tx-item-amount negative">-${Number(entry.amountUSD).toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
                  )}
                  <span style={{
                    position: "absolute", bottom: "6px", right: "10px", background: badge.bg, color: badge.fg,
                    borderRadius: "999px", padding: "2px 7px", fontSize: "9.5px", fontWeight: 600, whiteSpace: "nowrap"
                  }}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </>
        ) : txHistoryTab === "a2a" ? (
          <>
            {loadAuditLogByCategory("a2a").length === 0 && (
              <div className="contacts-empty">No agent delegations yet.</div>
            )}
            {loadAuditLogByCategory("a2a").map((entry) => {
              const badge = entry.status === "success"
                ? { label: "Replied", bg: "#0b3d1f", fg: "#4ade80" }
                : { label: "Failed", bg: "#4a0f0f", fg: "#f87171" };
              const date = new Date(entry.timestamp);
              return (
                <div className="tx-item" key={entry.id} style={{ width: "100%", position: "relative" }}>
                  <div className="tx-item-main">
                    <div className="tx-item-direction">{entry.task || "Agent task"}</div>
                    <div className="tx-item-date">
                      {date.toLocaleDateString("en-US")} · {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <span style={{
                    position: "absolute", bottom: "6px", right: "10px", background: badge.bg, color: badge.fg,
                    borderRadius: "999px", padding: "2px 7px", fontSize: "9.5px", fontWeight: 600, whiteSpace: "nowrap"
                  }}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </>
        ) : txHistoryTab === "acp" ? (
          <>
            {loadAuditLogByCategory("acp").length === 0 && (
              <div className="contacts-empty">No ACP checkouts yet.</div>
            )}
            {loadAuditLogByCategory("acp").map((entry) => {
              const badge = {
                success: { label: "Paid", bg: "#0b3d1f", fg: "#4ade80" },
                blocked: { label: "Blocked", bg: "#4a3b0f", fg: "#facc15" },
                failed: { label: "Failed", bg: "#4a0f0f", fg: "#f87171" }
              }[entry.status] || { label: entry.status, bg: "#2a2a3a", fg: "#c9c9d9" };
              const date = new Date(entry.timestamp);
              const itemsLabel = entry.meta?.lineItems?.map(li => `${li.quantity}× ${li.name}`).join(", ") || "Checkout";
              return (
                <div className="tx-item" key={entry.id} style={{ width: "100%", position: "relative" }}>
                  <div className="tx-item-main">
                    <div className="tx-item-direction">{itemsLabel}</div>
                    <div className="tx-item-date">
                      {date.toLocaleDateString("en-US")} · {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      {entry.reason ? ` · ${entry.reason.replace(/_/g, " ")}` : ""}
                    </div>
                  </div>
                  {entry.amountUSD != null && (
                    <div className="tx-item-amount negative">-${Number(entry.amountUSD).toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
                  )}
                  <span style={{
                    position: "absolute", bottom: "6px", right: "10px", background: badge.bg, color: badge.fg,
                    borderRadius: "999px", padding: "2px 7px", fontSize: "9.5px", fontWeight: 600, whiteSpace: "nowrap"
                  }}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </>
        ) : (
          <>
            {txHistoryLoading && (
              <div className="contacts-empty">
                <Loader2 size={16} className="spin" /> Loading…
              </div>
            )}

            {!txHistoryLoading && txHistoryError && (
              <div className="contacts-empty">{txHistoryError}</div>
            )}

            {!txHistoryLoading && !txHistoryError && txHistoryRows.length === 0 && (
              <div className="contacts-empty">
                No transactions found for this category.
              </div>
            )}

            {!txHistoryLoading && !txHistoryError && txHistoryRows.map((row) => {
              const date = new Date(row.timestamp * 1000);

              const direction = row.category === "send"
                ? `${row.isSent ? "↗ Sent to" : "↙ Received from"} ${shortAddress(row.counterparty)}`
                : row.category === "swap"
                ? "⇄ Swap"
                : row.category === "stake"
                ? (row.isSent ? "◆ Staked" : "◆ Withdrawn")
                : "⇢ Bridged";

              return (
                <a
                  className={`tx-item ${row.isSent ? "sent" : "received"}`}
                  key={row.hash}
                  href={explorerTx(row.hash, activeNetwork)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="tx-item-main">
                    <div className="tx-item-direction">{direction}</div>
                    <div className="tx-item-date">
                      {date.toLocaleDateString("en-US")} · {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  <div className={`tx-item-amount ${row.isSent ? "negative" : "positive"}`}>
                    {row.isSent ? "-" : "+"}{Number(row.display.valueXPL).toLocaleString("en-US", { maximumFractionDigits: 6 })} {row.display.symbol || "XPL"}
                  </div>
                </a>
              );
            })}
          </>
        )}

      </motion.div>
      </AnimatePresence>
      </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
)}

      </main>
    </div>
  );
}

// ---------------------------------------------------------------
// TicketDoneRecap, the final "big check + step list" screen shown
// once a ticket's execution is fully done. Originally built for
// MULTI_ACTION tickets only (one line per real chained step); reused
// here for single-action tickets (Send/Swap/Bridge/Stake) too, so
// every ticket ends on the same recap instead of single ones just
// leaving the checklist as their final screen.
// ---------------------------------------------------------------
function TicketDoneRecap({ steps, onDone }) {
  return (
    <div className="ticket-checklist-enter multi-ticket-summary">
      <svg className="multi-summary-icon" viewBox="0 0 64 64" fill="none">
        <circle className="multi-summary-ring" cx="32" cy="32" r="29" />
        <path className="multi-summary-check" d="M19 33 L28 42 L45 22" />
      </svg>

      <div className="multi-summary-title">Transaction executed</div>

      <div className="multi-summary-steps">
        {steps.map((step, i) => (
          <div className="multi-summary-step" key={i}>
            <span className="multi-summary-step-num">{i + 1}.</span>
            <span className="multi-summary-step-text">{step.text}</span>
            {step.txUrl && (
              <a
                className="multi-summary-step-link"
                href={step.txUrl}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        ))}
      </div>

      <button type="button" className="confirm multi-summary-done" onClick={onDone}>
        Go back to Lyra
      </button>
    </div>
  );
}

// ---------------------------------------------------------------
// ExecutionChecklist, the "grouped confirmation" checklist shown
// while a ticket is executing. Real progress: `currentIndex` is the
// number of sub-steps actually completed on-chain so far (-1 = none
// yet), driven by the execute*Ticket functions above via
// advanceExecutionTo(), not a fixed timer.
// ---------------------------------------------------------------
// Only rendered while execution is still in progress now, callers
// swap to TicketDoneRecap once currentIndex >= steps.length instead of
// letting this reach its own done state, so mainDone/hideDoneRow below
// only matter for the brief frame between the last step finishing and
// that swap happening.
function ExecutionChecklist({ label, steps, currentIndex, busy, txHash, network, onDone, hideDoneRow }) {
  const mainDone = currentIndex >= steps.length;

  return (
    <div className="execution-checklist">
      <div className="execution-checklist-title">{label}</div>

      <div className="execution-checklist-card">
        <div className="execution-checklist-header">Lyra's steps</div>

        <div className={`execution-checklist-main ${mainDone ? "done" : ""}`}>
          <span className="execution-checklist-status-icon">
            {mainDone ? <Check size={12} strokeWidth={3} /> : <Loader2 size={12} className="spin" />}
          </span>
          <span className="execution-checklist-main-label">Confirm transaction in wallet</span>
          <span className="execution-checklist-step-count">Step 1 of 1</span>
        </div>

        <div className="execution-checklist-substeps">
          {steps.map((s, i) => {
            const checked = currentIndex >= i;
            return (
              <div key={s} className={`execution-checklist-substep ${checked ? "checked" : ""}`}>
                <span className="execution-checklist-num">{i + 1}.</span>
                <span className="execution-checklist-substep-label">{s}</span>
                <span className="execution-checklist-dot">
                  {checked && <Check size={10} strokeWidth={3} />}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {mainDone ? (
        hideDoneRow ? null : (
          <div className="execution-done-actions">
            {txHash && (
              <a
                className="execution-success-link"
                href={explorerTx(txHash, network)}
                target="_blank"
                rel="noreferrer"
              >
                View on Explorer
                <ExternalLink size={13} />
              </a>
            )}
            {!busy && (
              <button type="button" className="confirm confirm-compact" onClick={onDone}>
                Done
              </button>
            )}
          </div>
        )
      ) : (
        !busy && (
          <button type="button" className="confirm confirm-compact" onClick={onDone}>
            Close
          </button>
        )
      )}
    </div>
  );
}

function renderMessageText(text) {
  const parts = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
        parts.push(
      <a
        key={key++}
        href={match[2]}
        target="_blank"
        rel="noreferrer"
        className="msg-link"
      >
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// One-shot version of the border-light effect (see useBorderPath / .border-light
// in styles.css) for a transition moment, the light does a single lap with a
// fade in/out envelope instead of looping, then the parent unmounts it.
function TicketTransitionWave() {
  const pathRef = useSplitBorderPath();

  return (
    <div className="ticket-transition-wave" ref={pathRef}>
      <span className="border-light border-light-one-shot border-light-split-left" />
      <span className="border-light border-light-one-shot border-light-split-right" />
    </div>
  );
}

function AnimatedBalance({ value, decimals = 2 }) {
  const ref = useRef(null);
  const prevValue = useRef(value);
  const tweenRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const format = (n) => n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    });

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || prevValue.current === value) {
      el.textContent = format(value);
      prevValue.current = value;
      return;
    }

    tweenRef.current?.kill();
    const obj = { val: prevValue.current };
    tweenRef.current = gsap.to(obj, {
      val: value,
      duration: 0.7,
      ease: "power2.out",
      onUpdate: () => { el.textContent = format(obj.val); }
    });
    prevValue.current = value;

    return () => tweenRef.current?.kill();
  }, [value, decimals]);

  return <span ref={ref}>{value.toLocaleString("en-US", { maximumFractionDigits: decimals })}</span>;
}

const ONBOARDING_EXAMPLES = [
  { label: "Send", example: "Send 10 XPL to 0x..." },
  { label: "Bridge", example: "Bridge 5 XPL to Base" },
  { label: "Bet", example: "Bet $10 on Lakers to win" },
  { label: "Transactions", example: "Show my transaction history" }
];

function OnboardingExamples() {
  const [hovered, setHovered] = useState(null);
  const active = ONBOARDING_EXAMPLES.find(e => e.label === hovered);

  return (
    <div className="onboarding-examples">
      <div className="onboarding-pills">
        {ONBOARDING_EXAMPLES.map(e => (
          <span
            key={e.label}
            className={`onboarding-pill${hovered === e.label ? " active" : ""}`}
            onMouseEnter={() => setHovered(e.label)}
            onMouseLeave={() => setHovered(null)}
          >
            {e.label}
          </span>
        ))}
      </div>
      <div className={`onboarding-example-text${active ? " visible" : ""}`}>
        {active ? `"${active.example}"` : " "}
      </div>
    </div>
  );
}

function TypewriterText({ text }) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, 12);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {renderMessageText(shown)}
      {!done && <span className="typewriter-cursor" />}
    </>
  );
}

function PortfolioChart({ history, range, onRangeChange, mode, onModeChange, xplPriceUSD, currentBalance, tokenBalances = {}, stakedBalances = {}, tokens = {}, nativeSymbol = "XPL" }) {
  const points = useMemo(
    () => filterHistoryByRange(history, range).map(p => ({
      t: p.t,
      value: Number(ethers.formatEther(p.balance)) + (p.defi || 0)
    })),
    [history, range]
  );

  const holdings = useMemo(() => {
    const xplAmount = Number(ethers.formatEther(currentBalance || 0n));
    const xplValue = xplPriceUSD ? xplAmount * xplPriceUSD : xplAmount;
    const list = [{ label: nativeSymbol, value: xplValue, color: "var(--accent)" }];

    Object.entries(tokens).forEach(([symbol, token]) => {
      const amount = Number(ethers.formatUnits(tokenBalances[symbol] || 0n, token.decimals));
      if (amount > 0) {
        list.push({ label: symbol, value: amount, color: token.color });
      }
    });

    Object.entries(tokens).forEach(([symbol, token]) => {
      const staked = Number(ethers.formatUnits(stakedBalances[symbol] || 0n, token.decimals));
      if (staked > 0) {
        list.push({ label: `${symbol} (staked)`, value: staked, color: "var(--accent-deep)" });
      }
    });

    return list.filter(h => h.value > 0);
  }, [currentBalance, xplPriceUSD, tokenBalances, stakedBalances]);

  return (
    <div className="portfolio-chart">
      <div className="chart-toolbar">
        <div className="chart-ranges">
          {PORTFOLIO_RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              className={range === r.key ? "active" : ""}
              onClick={() => onRangeChange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="chart-mode-toggle"
          title={mode === "line" ? "Show holdings breakdown" : "Show evolution"}
          onClick={() => onModeChange(mode === "line" ? "pie" : "line")}
        >
          {mode === "line" ? <PieChart size={15} strokeWidth={1.8} /> : <LineChart size={15} strokeWidth={1.8} />}
        </button>
      </div>

      <div className="chart-mode-view" key={`${mode}-${range}`}>
        {mode === "line" ? (
          <LineChartView points={points} nativeSymbol={nativeSymbol} />
        ) : (
          <PieChartView holdings={holdings} />
        )}
      </div>
    </div>
  );
}

function smoothPath(coords, bounds) {
  if (coords.length < 2) return "";
  if (coords.length === 2) {
    return `M ${coords[0].x},${coords[0].y} L ${coords[1].x},${coords[1].y}`;
  }

  const minY = bounds ? bounds.minY : -Infinity;
  const maxY = bounds ? bounds.maxY : Infinity;
  const clampY = (y) => Math.min(maxY, Math.max(minY, y));

  let path = `M ${coords[0].x},${coords[0].y}`;

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? 0 : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);

    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return path;
}

function LineChartView({ points, nativeSymbol = "XPL" }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (points.length < 2) {
    return (
      <div className="chart-empty">
        History is limited for now. The chart will fill in as
        the wallet is used.
      </div>
    );
  }

  function smoothAreaPath(coords, height) {
  const linePath = smoothPath(coords, { minY: 0, maxY: height });
  if (!linePath) return "";

  const last = coords[coords.length - 1];
  const first = coords[0];

  return `${linePath} L ${last.x.toFixed(1)},${height} L ${first.x.toFixed(1)},${height} Z`;
}

  const width = 280;
  const height = 90;
  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * width,
    y: height - ((p.value - min) / span) * height
  }));

  const positive = values[values.length - 1] >= values[0];
  const color = positive ? "var(--success)" : "var(--danger)";
  const path = smoothPath(coords, { minY: 0, maxY: height });

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const index = Math.round(relX * (points.length - 1));
    setHoverIndex(Math.max(0, Math.min(points.length - 1, index)));
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredCoord = hoverIndex !== null ? coords[hoverIndex] : null;

  return (
    <div className="chart-wrap">
      {hovered && (
        <div
          className="chart-tooltip"
          style={{ left: `${(hoveredCoord.x / width) * 100}%` }}
        >
          <div className="chart-tooltip-value">
            {hovered.value.toLocaleString("en-US", { maximumFractionDigits: 4 })} {nativeSymbol}
          </div>
          <div className="chart-tooltip-date">
            {new Date(hovered.t).toLocaleString("en-US", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      )}

      <svg
  className="chart-svg"
  viewBox={`0 0 ${width} ${height}`}
  preserveAspectRatio="none"
  style={{ overflow: "hidden" }}
  onMouseMove={handleMove}
  onMouseLeave={() => setHoverIndex(null)}
>
  <defs>
    <linearGradient id="chart-area-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity="0.28" />
      <stop offset="100%" stopColor={color} stopOpacity="0" />
    </linearGradient>
  </defs>

  <path
    className="chart-area-path"
    d={smoothAreaPath(coords, height)}
    fill="url(#chart-area-fill)"
    stroke="none"
  />

  <path
    className="chart-line-path"
    d={path}
    pathLength="1"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinejoin="round"
    strokeLinecap="round"
  />

  {hoveredCoord && (
    <>
      <line
        x1={hoveredCoord.x} x2={hoveredCoord.x}
        y1={0} y2={height}
        stroke="var(--line)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <circle cx={hoveredCoord.x} cy={hoveredCoord.y} r="3.5" fill={color} />
    </>
  )}
</svg>
    </div>
  );
}

function PieChartView({ holdings }) {
  if (!holdings.length) {
    return <div className="chart-empty">No holdings to display yet.</div>;
  }

  const total = holdings.reduce((sum, h) => sum + h.value, 0);
  const width = 260;
  const height = 150;
  const cx = 78;
  const cy = 75;
  const radius = 46;
  const leaderStart = radius + 6;   // where the leader line begins
  const leaderElbow = radius + 20;  // where it bends toward the label
  const labelOffset = 16;           // horizontal reach after the bend

  let cumulative = 0;

  const slices = holdings.map(h => {
    const fraction = total > 0 ? h.value / total : 0;
    const startAngle = cumulative * 2 * Math.PI;
    cumulative += fraction;
    const endAngle = cumulative * 2 * Math.PI;
    const midAngle = (startAngle + endAngle) / 2;

    const x1 = cx + radius * Math.sin(startAngle);
    const y1 = cy - radius * Math.cos(startAngle);
    const x2 = cx + radius * Math.sin(endAngle);
    const y2 = cy - radius * Math.cos(endAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;

    const path = fraction >= 0.999
      ? `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    const side = Math.sin(midAngle) >= 0 ? 1 : -1;
    const startX = cx + leaderStart * Math.sin(midAngle);
    const startY = cy - leaderStart * Math.cos(midAngle);
    const elbowX = cx + leaderElbow * Math.sin(midAngle);
    const elbowY = cy - leaderElbow * Math.cos(midAngle);
    const labelX = elbowX + side * labelOffset;
    const labelY = elbowY;

    return {
      key: h.label,
      path,
      color: h.color,
      fraction,
      percent: Math.round(fraction * 100),
      leaderPath: `M ${startX.toFixed(1)},${startY.toFixed(1)} L ${elbowX.toFixed(1)},${elbowY.toFixed(1)} L ${labelX.toFixed(1)},${labelY.toFixed(1)}`,
      labelX: labelX + side * 4,
      labelY,
      anchor: side > 0 ? "start" : "end"
    };
  });

  return (
    <div className="pie-chart-wrap">
      <svg className="chart-svg-pie" viewBox={`0 0 ${width} ${height}`}>
        {slices.map(s => (
          <path key={s.key} d={s.path} fill={s.color} />
        ))}

        {slices
          .filter(s => s.fraction >= 0.005)
          .map(s => (
            <g key={`label-${s.key}`}>
              <path
                d={s.leaderPath}
                fill="none"
                stroke={s.color}
                strokeWidth="1.2"
              />
              <text
                x={s.labelX}
                y={s.labelY}
                textAnchor={s.anchor}
                dominantBaseline="middle"
                className="pie-label-text"
                fill={s.color}
              >
                {s.percent}%
              </text>
            </g>
          ))}
      </svg>

      <div className="pie-legend">
        {holdings.map(h => (
          <div className="pie-legend-item" key={h.label}>
            <span className="pie-dot" style={{ background: h.color }} />
            {h.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function WalletPanel({ existing, onClose, onCreate, onImport }) {
  const [mode, setMode] = useState("create");
  const [wordCount, setWordCount] = useState(12);
  const [words, setWords] = useState({});
  const [error, setError] = useState("");

  function handleImport() {
    try {
      setError("");

      const missing = Array.from(
        { length: wordCount },
        (_, i) => i
      ).filter(i => !words[i]?.trim());

      if (missing.length > 0) {
        setError(
          "Please fill in all " + wordCount + " words of your phrase."
        );
        return;
      }

      const phrase = Array.from(
        { length: wordCount },
        (_, i) => words[i].trim().toLowerCase()
      ).join(" ");

      onImport(phrase);

    } catch (e) {
      console.error(e);

      setError(
        e.message || "Error while importing."
      );
    }
  }

  return (
    <div className="modal-card">

      <div className="modal-head">

        <h2>Wallet</h2>

        {existing && (
          <button
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        )}

      </div>

      <div className="tabs">

        <button
          type="button"
          className={mode === "create" ? "active" : ""}
          onClick={() => {
            setMode("create");
            setError("");
          }}
        >
          Create
        </button>

        <button
          type="button"
          className={mode === "import" ? "active" : ""}
          onClick={() => {
            setMode("import");
            setError("");
            setWords({});
          }}
        >
          Import
        </button>

      </div>

      {mode === "create" && (
        <button
          type="button"
          className="confirm"
          onClick={async () => {
            try {
              await onCreate();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Create wallet
        </button>
      )}

      {mode === "import" && (
        <div className="seed-import">

          <div className="seed-import-title">
            Import a wallet
          </div>

          <div className="seed-import-description">
            Enter your full recovery phrase, in
            the exact order.
          </div>

          <div className="seed-length">

            <button
              type="button"
              className={wordCount === 12 ? "active" : ""}
              onClick={() => {
                setWordCount(12);
                setWords({});
                setError("");
              }}
            >
              12 words
            </button>

            <button
              type="button"
              className={wordCount === 24 ? "active" : ""}
              onClick={() => {
                setWordCount(24);
                setWords({});
                setError("");
              }}
            >
              24 words
            </button>

          </div>

          <div className="seed-import-description">
            ⚠️ Never share your recovery phrase
            with anyone else. Lyra will never ask for it
            anywhere else.
          </div>

          <div className="seed-input-grid">

            {Array.from({ length: wordCount }, (_, i) => i).map(i => (
              <div className="seed-input-cell" key={i}>
                <span>{i + 1}</span>

                <input
                  type="text"
                  autoComplete="off"
                  spellCheck="false"
                  value={words[i] || ""}
                  onChange={e => {
                    const value = e.target.value.trim().toLowerCase();

                    setWords(current => ({
                      ...current,
                      [i]: value
                    }));

                    setError("");
                  }}
                />
              </div>
            ))}

          </div>

          <button
            type="button"
            className="confirm"
            onClick={handleImport}
          >
            Import wallet
          </button>

          {error && (
            <div className="seed-error">
              {error}
            </div>
          )}

        </div>
      )}

      <p className="security">
        The private key is encrypted locally
        in this browser. Never share your recovery
        phrase.
      </p>

    </div>
  );
}
