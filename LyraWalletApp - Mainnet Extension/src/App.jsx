import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import Spinner from "./Spinner.jsx";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import { ethers } from "ethers";
import { gsap } from "gsap";
import { Check, Copy, ExternalLink, RefreshCw, Play, MousePointer2, WalletCards, UserRound, Pencil, Plus, X, History, PieChart, LineChart, Coins, Settings, KeyRound, Trash2, Eye, EyeOff, Fingerprint, Lock, ArrowRight, RotateCcw, Info, Link, Search, Download, Upload, List, ShieldCheck, Users, ArrowUpFromDot, ArrowDownToDot, ArrowLeftRight, MoveHorizontal, Vault, ChevronDown, QrCode, Sparkles, HelpCircle, Gift , ArrowDownLeft, UserPlus, Send as SendIcon, ArrowLeft, ChevronRight, Wallet as WalletIcon, AlertTriangle } from "lucide-react";
import { IS_TESTNET, API_BASE_URL, NETWORKS, DEFAULT_NETWORK, getNetworkByKey, TOKENS_BY_NETWORK, getActiveTokens, ERC20_ABI, WNATIVE_BY_NETWORK, WETH9_ABI, getDefiContracts, LIFI_QUOTE_API_URL, AAVE_POOL_ABI, AAVE_DATA_PROVIDER_ABI, DEFAULT_SLIPPAGE, explorerTx, KYBERSWAP_API_BASE, NATIVE_PSEUDO_ADDRESS, KYBERSWAP_CLIENT_ID, POLYMARKET_ORDER_DOMAIN_NAME, POLYMARKET_ORDER_DOMAIN_VERSION, POLYMARKET_ORDER_TYPES, POLYMARKET_ORDER_SIDE_BUY, POLYMARKET_ORDER_SIDE_SELL, POLYMARKET_BYTES32_ZERO, POLYMARKET_SIGNATURE_TYPE_EOA, POLYMARKET_SIGNATURE_TYPE_GNOSIS_SAFE, POLYMARKET_SIGNATURE_TYPE_POLY_1271, POLYMARKET_DEPOSIT_WALLET_DOMAIN_NAME, POLYMARKET_DEPOSIT_WALLET_DOMAIN_VERSION, POLYMARKET_PUSD_COLLATERAL, AAVE_V4_SPOKE_ABI } from "./config";
import QRCode from "qrcode";
import { qrStyledDataUrl } from "./qrStyled.js";
import { LYRA_TREASURY, LYRA_FEE_PERCENT_LABEL, feeOf, splitOnTop, splitIncluded, toRaw, isFeeExempt, assetInfo, usdPerUnit, feeIsWorthCharging, includedFeePreview, collectLyraFee, runWithLyraFee, estimateAfterFee } from "./fees.js";
import { parseUiModeCommand } from "./uiModeCommand.js";
import { parseNetworkCommand } from "./networkCommand.js";
import { isWebAuthnAvailable, registerBiometric, getBiometricAesKey, confirmBiometricPresence, encryptWithKey, decryptWithKey, createDeviceKey, loadDeviceKey, clearDeviceKey } from "./Biometric";
import { splitPrivateKey, combineFragments, registerMpcWallet, getMpcStatus, setMpcDailyLimit, releaseFragment2, recoverFragment2 } from "./mpc";
import { loadSavedWallet, encryptPrivateKey, decryptPrivateKey, reconstructPrivateKey } from "./walletVault.js";
import { syncAddress } from "./providerSync.js";
import { loadAccounts, findAccount, activateAccount, addAccount, clearAccounts, nextDerivedIndex, defaultAccountName, renameAccount } from "./walletAccounts.js";
import { AccountSwitcher } from "./AccountSwitcher.jsx";
import { TxHistoryList, StakeHistory, stakeAssetOf } from "./TxHistoryList.jsx";
import { Approvals } from "./Approvals.jsx";
import { buildPlanCalls } from "./planSimulation.js";
import { FlyingRequest } from "./FlyingRequest.jsx";
import { PlanScene3D, plan3dEnabled, setPlan3d } from "./three-d/PlanScene3D.jsx";
import { HoldSquares } from "./HoldSquares.jsx";
import { ledgerAddress, ledgerSupported, connectLedger, ledgerSettings, LEDGER_DEFAULT_PATH } from "./ledger.js";
import { LedgerSetup } from "./LedgerSetup.jsx";
import { batchSupported, isDelegated, activateBatching, sendLedgerBatch, prepareOwnBatch, sendOwnBatch, delegationOf, removeOwnDelegation, BATCH_DELEGATOR, encodeBatch } from "./ledgerBatch.js";
import { verifyBatch } from "./intentGuard.js";
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
// Circle's chain names (@circle-fin/bridge-kit's Blockchain enum): the testnet
// build uses the testnet ones, the mainnet build the real ones.
const NETWORK_KEY_TO_CIRCLE_CHAIN = IS_TESTNET
  ? { arc: "Arc_Testnet", ethereum: "Ethereum_Sepolia", base: "Base_Sepolia", polygon: "Polygon_Amoy_Testnet", plasma: "Plasma_Testnet", hyperliquid: "HyperEVM_Testnet" }
  : { arc: "Arc", ethereum: "Ethereum", base: "Base", polygon: "Polygon", plasma: "Plasma" };
// The AI may still answer a bridge destination with LI.FI's short code; map it to Lyra's own network key.
const LIFI_KEY_TO_NETWORK_KEY = { pla: "plasma", eth: "ethereum", bas: "base", pol: "polygon", hyp: "hyperliquid" };

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
import { RewardsPanel } from "./Rewards.jsx";
import { createPortal } from "react-dom";
import { AskLyra } from "./AskLyra.jsx";
import { StatusBadge } from "./StatusBadge.jsx";
import { FillButton } from "./FillButton.jsx";
import { buildIdeas } from "./askLyraIdeas.js";
import { loadLyraLanguage, saveLyraLanguage } from "./lyraLanguages.js";
import { looksEnglishText, offlineText, autoLanguage } from "./replyLanguage.js";
import { PlanCard, RequestBox, LyraStar } from "./PlanCard.jsx";
import { parseAskLyra } from "./askLyraParse.js";
import { Box3D } from "./three-d/Box3D.jsx";
import Logo3D from "./three-d/Logo3D.jsx";
import { loadUiMode, saveUiMode, hasSeenTour, markTourSeen } from "./three-d/uiMode.js";
import { InterfaceChooser } from "./three-d/InterfaceChooser.jsx";
import { ActivityBlock } from "./three-d/ActivityBlock.jsx";
import { HelpFaq } from "./three-d/HelpFaq.jsx";
import { TokenLogo } from "./tokenLogo.jsx";
import { haptic, Skel, SkeletonRows, EmptyWallet, usePullToRefresh } from "./uiPolish.jsx";
import { PlanDoneSheet } from "./PlanDone.jsx";
import { PanelHead, SettingIcon, Avatar } from "./menuParts.jsx";
import { WelcomeDemo } from "./WelcomeDemo.jsx";
import { IS_CARD, reportCardBusy } from "./cardBridge.js";
import { installState, onInstallChange, installLyra, IS_APP } from "./platform.js";
import { canTopUp, needsNativeGas, topUpNativeGas } from "./gasTopUp.js";

// In the 3D interface the wallet frame lives inside a perspective +
// transform context, which turns every `position: fixed` modal inside
// it into "fixed to the box" instead of the real viewport. Portaling
// the modals to <body> keeps them true full-screen overlays in both
// interfaces.
// One collapsible block of the Settings list (the list had grown into one
// long scroll). Only the first section starts open.
function SettingsSection({ title, defaultOpen = false, danger = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="settings-section">
      <button
        type="button"
        className={`settings-section-toggle${danger ? " danger" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span dangerouslySetInnerHTML={{ __html: title }} />
        <ChevronDown size={15} strokeWidth={2} className={`settings-section-chevron${open ? " open" : ""}`} />
      </button>
      {open && <div className="settings-section-body">{children}</div>}
    </div>
  );
}

// Deferred recovery-phrase backup: set when a wallet is created (not
// imported), cleared once the user has revealed their phrase.
const BACKUP_PENDING_KEY = "lyra_backup_pending_v1";
function readBackupPending() {
  try { return localStorage.getItem(BACKUP_PENDING_KEY) || null; } catch { return null; }
}
function markBackupPending(address) {
  try { localStorage.setItem(BACKUP_PENDING_KEY, address.toLowerCase()); } catch { /* ignore */ }
}
function clearBackupPendingStorage() {
  try { localStorage.removeItem(BACKUP_PENDING_KEY); } catch { /* ignore */ }
}

function OverlayPortal({ active, children }) {
  // In the floating card the overlays cover the wallet area only, not the
  // whole frame with its transparent menu margins (see cardBridge.js).
  return active ? createPortal(children, (IS_CARD && document.getElementById("card-overlays")) || document.body) : <>{children}</>;
}

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
  if (body == null || body === "" || body.nonData) return null;
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
  if (body.nonData) {
    return "\n\nThe service answered with a web page or program code instead of data, so there's nothing readable to show. Check that this URL is a data API.";
  }
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

    // Aave: a withdrawal burns the receipt token (aUSDT0... out) and sends the
    // asset back (in); a deposit sends the asset out and mints the receipt in.
    const isReceipt = (t) => /^a[A-Z]/.test(t.symbol || "");
    const incomingAsset = legs.find(t => t.type === "token" && t.to.toLowerCase() === addr && !isReceipt(t));
    const outgoingAsset = legs.find(t => t.type === "token" && t.from.toLowerCase() === addr && !isReceipt(t));
    const stakeAction = category === "stake" ? (incomingAsset && !outgoingAsset ? "withdraw" : "deposit") : null;

    const display = stakeAction === "withdraw" ? incomingAsset
      : stakeAction === "deposit" ? (outgoingAsset || outgoingToken || native || legs[0])
      : outgoingToken || incomingToken || internalLeg || native || legs[0];
    const isSent = display.from.toLowerCase() === addr;

    return {
      hash: legs[0].hash,
      timestamp: legs[0].timestamp,
      category,
      display,
      isSent,
      stakeAction,
      outgoing: outgoingToken || (native && Number(native.valueXPL) > 0 && native.from.toLowerCase() === addr ? native : null),
      incoming: incomingToken || internalLeg || null,
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
  return { data: address, size, output: qrStyledDataUrl(address) };
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
  hyp: "Hyperliquid",
  ...(IS_TESTNET
    ? { plasma: "Plasma Testnet", ethereum: "Ethereum Sepolia", base: "Base Sepolia", polygon: "Polygon Amoy", arc: "Arc Testnet", hyperliquid: "Hyperliquid Testnet" }
    : { plasma: "Plasma", ethereum: "Ethereum", base: "Base", polygon: "Polygon", arc: "Arc", hyperliquid: "Hyperliquid" }),
};
function lifiChainDisplayName(key) {
  if (!key) return null;
  return LIFI_CHAIN_DISPLAY_NAMES[key.toLowerCase()] || key;
}

// Lyra's own network.key (used throughout the rest of the app, e.g.
// SWITCH_NETWORK's "network" field) to LI.FI's own short chain key
// (used by the bridge quote API's fromChain/toChain params). Only
// needs entries for the five LI.FI-bridged networks Lyra itself
// supports (Arc isn't here: no LI.FI deployment, see executeArcBridgeTicket).
const NETWORK_KEY_TO_LIFI_KEY = { plasma: "pla", ethereum: "eth", base: "bas", polygon: "pol", hyperliquid: "hyp" };

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
    case "bridge": {
      // tokenOutSymbol differing from asset means a swap+bridge combined
      // into one LI.FI route (see executeBridgeTicket) -- worth spelling
      // out ("to USDC on Polygon") rather than just the chain name.
      const crossAsset = step.tokenOutSymbol && step.tokenOutSymbol !== step.asset;
      return `Bridge ${amt} to ${crossAsset ? `${step.tokenOutSymbol} on ` : ""}${lifiChainDisplayName(step.destinationChainKey) || "…"}`;
    }
    case "predict": {
      const t = step.ticket;
      return `Bet $${step.amountUSD ?? t?.amountUSD ?? "…"} → ${t?.outcome || "…"}${t?.marketQuestion ? ` (${t.marketQuestion})` : ""}`;
    }
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
    case "bridge": {
      const crossAsset = step.tokenOutSymbol && step.tokenOutSymbol !== step.asset;
      const dest = step.destinationChainKey
        ? ` to ${crossAsset ? `${step.tokenOutSymbol} on ` : ""}${lifiChainDisplayName(step.destinationChainKey)}`
        : "";
      return `Bridged ${amt}${dest}`;
    }
    case "prediction": {
      const cents = step.price != null ? `${Math.round(Number(step.price) * 100)}¢` : null;
      return `Bet placed: ${step.outcome || "?"}${cents ? ` at ${cents}` : ""}${step.marketQuestion ? `. ${step.marketQuestion}` : ""}`;
    }
    case "predict": {
      // MULTI_ACTION's own step kind (see stepSummaryLine above) -- ticket
      // nested under step.ticket, unlike "prediction" above which reads a
      // flat shape from a different caller.
      const t = step.ticket;
      const cents = t?.price != null ? `${Math.round(Number(t.price) * 100)}¢` : null;
      return `Bet placed: ${t?.outcome || "?"}${cents ? ` at ${cents}` : ""}${t?.marketQuestion ? `. ${t.marketQuestion}` : ""}`;
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

function recordPortfolioSnapshot(xplBalanceWei, defiValueXpl = 0, networkKey, address = null) {
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
      last.address === (address ? address.toLowerCase() : undefined) &&
      now - last.t < 5 * 60 * 1000
    ) {
      return history;
    }

    const next = [
      ...history,
      { t: now, balance: balanceStr, defi: defiValueXpl, network: networkKey, ...(address ? { address: address.toLowerCase() } : {}), priced: true }
    ].slice(-MAX_HISTORY_POINTS);

    localStorage.setItem(PORTFOLIO_HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadPortfolioHistory();
  }
}

const PORTFOLIO_RANGES = [
  { key: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "1W", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "1m", label: "1M", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "6m", label: "6M", ms: 182 * 24 * 60 * 60 * 1000 },
  { key: "1y", label: "1Y", ms: 365 * 24 * 60 * 60 * 1000 },
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
  // A saved wallet opens straight on the lock screen: read it before the
  // first paint, so the wallet never shows for a split second before locking.
  const [hasSavedWallet] = useState(() => {
    const s = loadSavedWallet();
    return !!(s?.address && s?.ciphertext);
  });
  const [wallet, setWallet] = useState(() => (hasSavedWallet ? { address: loadSavedWallet().address } : null));
  const [unlockedPrivateKey, setUnlockedPrivateKey] = useState(null);
  const [locked, setLocked] = useState(hasSavedWallet);
  const [showUnlock, setShowUnlock] = useState(hasSavedWallet);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [showUnlockPasswordText, setShowUnlockPasswordText] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [balance, setBalance] = useState(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // floating card: a click outside closes it, except while Lyra is working
  useEffect(() => { if (IS_CARD) reportCardBusy(busy); }, [busy]);
  const [status, setStatus] = useState("Ready");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [activityRuns, setActivityRuns] = useState([]);

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
  // First-visit welcome screen ("Get started"), shown before the
  // create/import panel when no wallet is saved on this device.
  const [showWelcome, setShowWelcome] = useState(!hasSavedWallet);
  const [walletPanelMode, setWalletPanelMode] = useState("create");
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
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);

  // Websites connected to Lyra see the address of the wallet saved on this
  // device (public/providerBackground.js). Read from storage rather than from
  // `wallet`, which is still empty on the first render and holds a not yet
  // secured wallet during setup; re-checked when the password setup closes.
  useEffect(() => {
    syncAddress(loadSavedWallet()?.address || null);
  }, [wallet?.address, showPasswordSetup]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSetupError, setPasswordSetupError] = useState("");
  const [pendingPrivateKey, setPendingPrivateKey] = useState(null);   
  const [passwordSetupMode, setPasswordSetupMode] = useState("create"); // "create" | "import" | "reset"
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotWordCount, setForgotWordCount] = useState(12);
  const [forgotWords, setForgotWords] = useState({});
  const [forgotError, setForgotError] = useState("");
  const [addressCopied, setAddressCopied] = useState(false);
  // The wallet's other addresses (walletAccounts.js), opened from the
  // chevron next to the address. Their keys stay in memory only while the
  // wallet is unlocked, like the main one.
  // Money that just arrived: a pill at the top right of the wallet
  const [incoming, setIncoming] = useState(null);
  // Settings -> Security -> Token approvals (open inline), and the contracts
  // this wallet called before (from its history), checked too
  const [showApprovals, setShowApprovals] = useState(false);
  const [calledContracts, setCalledContracts] = useState([]);
  // Contracts that could hold an approval: the ones Lyra uses on this network
  // (named), plus the ones this wallet called before (unknown unless named)
  const approvalSpenders = useMemo(() => {
    const NAMES = { oku: "Oku", uniswap: "Uniswap", aave: "Aave", aaveV4: "Aave V4", lifi: "LI.FI", cctp: "Circle CCTP", polymarket: "Polymarket" };
    const out = new Map();
    const add = (address, label, known = true) => {
      if (!/^0x[0-9a-fA-F]{40}$/.test(address || "")) return;
      const k = address.toLowerCase();
      if (out.has(k)) return;
      out.set(k, { address: ethers.getAddress(k), label, known });
    };
    const skip = /factory|quoter|dataprovider|addressesprovider|oracle/i;
    const walk = (obj, top) => {
      for (const [k, v] of Object.entries(obj || {})) {
        if (typeof v === "string") { if (!skip.test(k)) add(v, `${NAMES[top] || top || "Lyra"}${top ? ` ${k}` : ""}`); }
        else if (v && typeof v === "object") walk(v, top || k);
      }
    };
    walk(defi, null);
    add(KYBERSWAP_ROUTER_V2, "KyberSwap router");
    add("0x000000000022D473030F116dDEE9F6B43aC78BA3", "Uniswap Permit2");
    for (const a of calledContracts) add(a, "Contract", false);
    return [...out.values()];
  }, [defi, calledContracts]);
  // A Ledger address in use (walletAccounts kind "ledger"): { address, path }.
  // Its key never leaves the device; plans are sent as one batched
  // transaction (ledgerBatch.js) and everything else that signs is off.
  const [ledgerActive, setLedgerActive] = useState(null);
  // The Ledger settings guide (LedgerSetup.jsx): { model, need, blindOn }
  const [ledgerGuide, setLedgerGuide] = useState(null);
  const [showAccounts, setShowAccounts] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const accountKeysRef = useRef(new Map()); // lowercased address -> { privateKey, localSecret }
  const [, setAccountKeysVersion] = useState(0);
  const rememberAccountKey = (address, privateKey, localSecret = privateKey) => {
    if (!address || !privateKey) return;
    accountKeysRef.current.set(address.toLowerCase(), { privateKey, localSecret });
    setAccountKeysVersion(v => v + 1);
  };
  const accountKeyReady = (address) => accountKeysRef.current.has(String(address).toLowerCase());
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
  // "sent" / "received" only exist for the 3D side menu, where Send and
  // Receive are separate buttons; the classic grid's "send" tab stays
  // the combined Send/Receive list.
  const txHistoryRows = useMemo(
    () => buildTxRows(txHistoryList, wallet?.address, defi).filter(r =>
      txHistoryTab === "sent" ? r.category === "send" && r.isSent
      : txHistoryTab === "received" ? r.category === "send" && !r.isSent
      : r.category === txHistoryTab
    ),
    [txHistoryList, wallet?.address, defi, txHistoryTab]
  );
  // Opened straight onto one category from the 3D side menu (skips the
  // tile grid, hides it behind the detail panel).
  const [txHistoryDirect, setTxHistoryDirect] = useState(false);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  // Classic 2D frame or the 3D depth box, per-device, switchable from
  // Settings -> Interface at any time.
  const [uiMode, setUiModeState] = useState(loadUiMode);
  const [showChart3d, setShowChart3d] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  // Shown once, right after a wallet is created/imported and secured:
  // pick the 2D or 3D interface (changeable later in Settings).
  const [showInterfaceChoice, setShowInterfaceChoice] = useState(false);
  const [backupPendingFor, setBackupPendingFor] = useState(readBackupPending);
  function clearBackupPending() {
    clearBackupPendingStorage();
    setBackupPendingFor(null);
  }
  const [balanceReady, setBalanceReady] = useState(false);
  const [showReceiveQr, setShowReceiveQr] = useState(false);
  const [receiveQrSrc, setReceiveQrSrc] = useState("");
  useEffect(() => {
    if (!showReceiveQr || !wallet?.address) return;
    let cancelled = false;
    try {
      const url = qrStyledDataUrl(wallet.address);
      if (!cancelled) setReceiveQrSrc(url);
    } catch {
      if (!cancelled) setReceiveQrSrc("");
    }
    return () => { cancelled = true; };
  }, [showReceiveQr, wallet?.address]);
  // Guided tour of the 3D menus: starts the first time 3D is active (right
  // after choosing it, or when switching to it later), replayable from
  // Settings. Only once the wallet is actually on screen.
  const [tourOpen, setTourOpen] = useState(false);
  function finishTour() {
    markTourSeen();
    setTourOpen(false);
  }
  function chooseInterface(mode) {
    setUiModeState(mode);
    setPillMode(mode);
    saveUiMode(mode);
    setShowInterfaceChoice(false);
  }
  // The pill's thumb slides first (pillMode), then the interface
  // actually switches and Settings closes so the user lands back on the
  // main interface instead of staying in the modal.
  const [pillMode, setPillMode] = useState(uiMode);
  function changeUiMode(mode) {
    if (mode === uiMode) return;
    setPillMode(mode);
    setTimeout(() => {
      setUiModeState(mode);
      saveUiMode(mode);
      setShowSettings(false);
      setMenuOpen(false);
    }, 320);
  }
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
  // Biometrics are ON by default: the plan card offers them on any device with a
  // built-in reader, and the first confirmation enrolls it. Only an explicit
  // "turn off" in Settings stops that.
  const [platformBiometric, setPlatformBiometric] = useState(false);
  useEffect(() => {
    let alive = true;
    window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()
      .then(ok => { if (alive) setPlatformBiometric(!!ok); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const [biometricEnabled, setBiometricEnabled] = useState(() => !!loadBiometricRecord());
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState("");
  // lock screen: which address unlocks (the last one used, until another is picked)
  const [lockMenuOpen, setLockMenuOpen] = useState(false);
  const [lockPick, setLockPick] = useState(0); // re-reads the address in use after a switch
  const sessionKeyCacheRef = useRef(null);
  // web app: after the password, "unlock with your fingerprint next time?"
  const [bioOffer, setBioOffer] = useState(false);
  const bioOfferedRef = useRef(false);
  const bioAutoRef = useRef(false);

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
    if (Date.now() - biometricPassedAtRef.current < 60000) return; // just confirmed on the plan card
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
  // the last request sent to Lyra was spoken (Ask Lyra's microphone)
  const voiceRequestRef = useRef(false);
  const [stakedApy, setStakedApy] = useState({});
  const [defiTicket, setDefiTicket] = useState(null);

  // The language Lyra answers in (and listens to, for voice), "auto" by default.
  const [lyraLanguage, setLyraLanguage] = useState(loadLyraLanguage);
  // the latest Lyra answer the user closed (see lyraReply)
  const [dismissedReplyAt, setDismissedReplyAt] = useState(-1);
  // Lyra's answer in the chosen language (see the effect next to lyraReply)
  const [translatedReply, setTranslatedReply] = useState(null); // { key, text }
  const replyTranslationsRef = useRef(new Map());
  function changeLyraLanguage(code) { setLyraLanguage(code); saveLyraLanguage(code); }

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
  const [pendingPlan, setPendingPlan] = useState(null); // steps read from the user's sentence, until Lyra answers
  // the 3D scene while Lyra prepares a plan of several steps (computer only):
  // decided when the request is sent, settled once the recap takes over
  const [planScene, setPlanScene] = useState(null);
  const [planSceneSettled, setPlanSceneSettled] = useState(false);
  // One-transaction plans (EIP-7702 batch): on by default, can be turned off.
  // Removing the delegation in Settings turns them off too, or the next plan
  // would delegate the address again.
  const ONE_TX_KEY = "lyra_one_tx_plans_v1";
  const [oneTxPlans, setOneTxPlansState] = useState(() => { try { return localStorage.getItem(ONE_TX_KEY) !== "off"; } catch { return true; } });
  const setOneTxPlans = (on) => { setOneTxPlansState(on); try { localStorage.setItem(ONE_TX_KEY, on ? "on" : "off"); } catch { /* not kept */ } };
  // this address on this network: { status: "none" | "lyra" | "other" | "error", busy, confirm, error }
  const [delegationState, setDelegationState] = useState(null);
  const [plan3dPref, setPlan3dPref] = useState(plan3dEnabled);
  // the web app opened in a browser: Settings can always install it
  const [installMode, setInstallMode] = useState(installState);
  useEffect(() => onInstallChange(() => setInstallMode(installState())), []);
  const [planRequest, setPlanRequest] = useState("");
  // a request held back because it sends to a name that isn't a contact yet:
  // Lyra asked for that address, the request runs again once it is saved
  const [pendingContact, setPendingContact] = useState(null); // { name, text }
  const handleIntentRef = useRef(null);   // the sentence the plan answers, shown at the top of the plan sheet
  const planStartedAtRef = useRef(0);                   // when that request was sent: picks its own work log
  const planMsgStartRef = useRef(0);                    // chat length before that request: what the request box replaces
  // The plan simulated before confirming (planSimulation.js + the server's
  // /api/simulate/plan): { state: "loading" | "ok" | "fail" | "off", ... }
  const [planSim, setPlanSim] = useState(null);
  // Where the Ask Lyra box and its text were when the request was sent: the
  // plan sheet grows out of that box and the request glides from there.
  const askOriginRef = useRef(null);
  const [planError, setPlanError] = useState(null);     // why a confirmed plan stopped (never sends it back to "confirm")
  // A request that just finished: shown as a confirmation under Ask Lyra for
  // a moment, then it becomes the first line of the requests history.
  const [celebratingRequest, setCelebratingRequest] = useState(null); // its n
  const [showAllRequests, setShowAllRequests] = useState(false);
  // The requests list ends at the wallet's bottom edge and scrolls inside it
  const requestsListRef = useRef(null);
  useLayoutEffect(() => {
    const el = requestsListRef.current;
    const frameEl = el?.closest(".frame");
    if (!el || !frameEl) return;
    const fit = () => {
      const f = frameEl.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const k = frameEl.offsetHeight / (f.height || 1); // the 3D view scales the wallet
      el.style.maxHeight = Math.max(120, Math.floor((f.bottom - r.top) * k) - 8) + "px";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(frameEl);
    return () => ro.disconnect();
  });
  const lastRequestCountRef = useRef(0);
  useEffect(() => {
    const reqs = messages.filter(m => m.role === "request");
    const before = lastRequestCountRef.current;
    lastRequestCountRef.current = reqs.length;
    if (reqs.length <= before) return;
    const latest = reqs[reqs.length - 1];
    if (latest.status === "cancelled") return;
    haptic(latest.status === "done" ? "success" : "error");
    if (latest.status === "done") return;
    setCelebratingRequest(latest.n);
    const t = setTimeout(() => setCelebratingRequest(null), 2200);
    return () => clearTimeout(t);
  }, [messages]);
  const [planDone, setPlanDone] = useState(null);   // { steps, txUrl, seconds }: the end-of-plan sheet
  const planConfirmedAtRef = useRef(0);
  const [planBanner, setPlanBanner] = useState(null);   // { title, detail } on the home screen after a plan finished
  const biometricPassedAtRef = useRef(0);               // the plan's own biometric confirm covers the large-amount check
  // the home banner fades away on its own
  useEffect(() => {
    if (!planBanner) return;
    const t = setTimeout(() => setPlanBanner(null), 8000);
    return () => clearTimeout(t);
  }, [planBanner]);
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
  }, [messages.length, busy, defiTicket, multiTicket, showSend, pendingPlan, collapsedTickets.length, activityRuns]);

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

  // the plan card grows as steps land: keep its bottom in view
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [planStepIndex, multiTicketDone, executionStepIndex]);

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
    setPlanError(null);
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

  // The address on screen right now: a balance read for another address (an
  // older read still in flight after a switch) must not land on this one.
  const shownAddressRef = useRef(null);
  shownAddressRef.current = wallet?.address || null;
  const isShown = (address) => !shownAddressRef.current || String(address).toLowerCase() === shownAddressRef.current.toLowerCase();

  async function refreshTokenBalances(address = wallet?.address) {
  if (!address) return {};
  const failed = new Set();
  const entries = await Promise.all(
    Object.entries(tokens).map(async ([symbol, token]) => {
      try {
        const contract = new ethers.Contract(token.address, ERC20_ABI, RPC);
        const raw = await contract.balanceOf(address);
        return [symbol, raw];
      } catch (e) {
        console.error(`${symbol} balance unavailable:`, e);
        failed.add(symbol);
        return [symbol, 0n];
      }
    })
  );
  const result = Object.fromEntries(entries);
  // the ones that couldn't be read (shown as 0): not a real balance
  Object.defineProperty(result, "failed", { value: failed, enumerable: false });
  if (isShown(address)) setTokenBalances(result);
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
  if (isShown(address)) setStakedBalances(result);

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
    () => {
      // points from before addresses were recorded belong to the saved (main) address
      const me = String(wallet?.address || "").toLowerCase();
      const saved = String(loadSavedWallet()?.address || "").toLowerCase();
      return filterHistoryByNetwork(portfolioHistory, activeNetworkKey)
        .filter(p => (p.address ? p.address === me : me === saved));
    },
    [portfolioHistory, activeNetworkKey, wallet?.address]
  );

  const portfolioChangePercent = useMemo(() => {
    const points = filterHistoryByRange(networkPortfolioHistory, chartRange);
    if (points.length < 2) return null;

    const first = Number(ethers.formatEther(points[0].balance)) + (points[0].defi || 0);
    const last = Number(ethers.formatEther(points[points.length - 1].balance)) + (points[points.length - 1].defi || 0);

    if (first <= 0) return null;

    return ((last - first) / first) * 100;
  }, [networkPortfolioHistory, chartRange]);

  const txListRef = useRef(null);
  const txPull = usePullToRefresh(txListRef, () => openTxHistory());
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
    // Polymarket only exists on Polygon mainnet: nothing to list on testnet.
    if (IS_TESTNET) return [];
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
    setShowWelcome(true);
  }
}, []);

useEffect(() => {
  if (showContacts) {
    setContacts(loadContacts());
  }
}, [showContacts]);

useEffect(() => {
  let cancelled = false;
  // Never show the previous network's price on this one (e.g. ETH's price
  // applied to Arc's USDC balance) while the new price loads or if it fails.
  // The last price seen on THIS network shows at once, until a fresh one comes.
  const PRICE_KEY = `lyra_native_price_v1:${activeNetworkKey}`;
  let lastKnown = null;
  try { lastKnown = Number(JSON.parse(localStorage.getItem(PRICE_KEY) || "null")?.priceUSD) || null; } catch { /* none */ }
  setXplPriceUSD(lastKnown);
  // A stablecoin native coin (Arc's USDC) is worth $1: no lookup to fail.
  if (activeNetwork.coingeckoId === "usd-coin") {
    setXplPriceUSD(1);
    return;
  }

  let retry = null;
  const keep = (priceUSD) => {
    setXplPriceUSD(priceUSD);
    try { localStorage.setItem(PRICE_KEY, JSON.stringify({ priceUSD, at: Date.now() })); } catch { /* not kept */ }
  };
  async function fromServer() {
    const response = await fetch(`${API_BASE_URL}/api/price/xpl?network=${activeNetworkKey}`);
    const data = await response.json().catch(() => ({}));
    // logged (429 from CoinGecko, backend down or waking up...), then the fallback
    if (!response.ok || !(Number(data.priceUSD) > 0)) throw new Error(`price endpoint ${response.status} ${data?.error || ""}`);
    return Number(data.priceUSD);
  }
  // Lyra's server can be asleep or redeploying: CoinGecko directly then
  async function fromCoingecko() {
    if (!activeNetwork.coingeckoId) throw new Error("no CoinGecko id");
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${activeNetwork.coingeckoId}&vs_currencies=usd`);
    const d = await r.json();
    const p = Number(d?.[activeNetwork.coingeckoId]?.usd);
    if (!(p > 0)) throw new Error(`CoinGecko ${r.status}`);
    return p;
  }
  async function fetchPrice(attempt = 0) {
    clearTimeout(retry);
    try {
      let p;
      try { p = await fromServer(); }
      catch (e) { console.error("Native price endpoint error:", e.message); p = await fromCoingecko(); }
      if (!cancelled) keep(p);
    } catch (e) {
      console.error("Native price unavailable:", e);
      // soon again (10 s, 20 s, 40 s... up to 2 min), not only at the next refresh
      if (!cancelled) retry = setTimeout(() => fetchPrice(attempt + 1), Math.min(120000, 10000 * 2 ** attempt));
    }
  }

  fetchPrice();
  const interval = setInterval(() => fetchPrice(), 2 * 60 * 1000);

  return () => {
    cancelled = true;
    clearInterval(interval);
    clearTimeout(retry);
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
  accountKeysRef.current.clear();
  setLedgerActive(null);
  setShowAccounts(false);
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
    rememberAccountKey(saved.address, privateKey, localSecret);
    unlockOtherAccounts(unlockPassword);

    setMpcEnabled(!!saved.mpcEnabled);

    setWallet({
      address: saved.address
    });

    haptic("success");
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

// Opens the wallet's other addresses with the password just used to unlock,
// in the background, so switching to them needs no password this session.
function unlockOtherAccounts(password) {
  if (!password) return;
  for (const a of loadAccounts()) {
    if (accountKeyReady(a.address) || a.record?.mpcEnabled || !a.record?.ciphertext) continue;
    decryptPrivateKey(a.record, password)
      .then(pk => {
        if (new ethers.Wallet(pk).address.toLowerCase() === a.address.toLowerCase()) rememberAccountKey(a.address, pk);
      })
      .catch(() => { /* another password (e.g. after a reset): asked when switching */ });
  }
}

async function verifyWalletPassword(password) {
  try {
    await decryptPrivateKey(loadSavedWallet(), password);
  } catch {
    throw new Error("Incorrect password.");
  }
}

async function switchAccount(address, password) {
  const entry = findAccount(address);
  if (!entry) throw new Error("This address isn't in your wallet.");
  if (entry.kind === "ledger") {
    // the Lyra address stays the saved one (it pays the one-time setup);
    // no key is loaded, so nothing but a Ledger plan can sign from here
    setLedgerActive({ address: entry.address, path: entry.path || LEDGER_DEFAULT_PATH });
    setUnlockedPrivateKey(null);
    setMpcEnabled(false);
    setWallet({ address: entry.address });
    setAccounts(loadAccounts());
    setShowAccounts(false);
    setToast(`Switched to ${entry.name}.`);
    refreshBalance(entry.address);
    return;
  }
  setLedgerActive(null);
  let k = accountKeysRef.current.get(address.toLowerCase());
  if (!k) {
    let localSecret;
    try {
      localSecret = await decryptPrivateKey(entry.record, password);
    } catch {
      throw new Error("Incorrect password.");
    }
    const privateKey = await reconstructPrivateKey(localSecret, entry.address, entry.record.mpcEnabled);
    if (new ethers.Wallet(privateKey).address.toLowerCase() !== address.toLowerCase()) throw new Error("Incorrect password.");
    rememberAccountKey(address, privateKey, localSecret);
    k = { privateKey, localSecret };
  }
  const record = activateAccount(address);
  localSecretRef.current = k.localSecret;
  sessionKeyCacheRef.current = k.privateKey;
  setUnlockedPrivateKey(k.privateKey);
  setMpcEnabled(!!record.mpcEnabled);
  setWallet({ address: record.address });
  setAccounts(loadAccounts());
  setShowAccounts(false);
  setToast(`Switched to ${entry.name}.`);
  refreshBalance(record.address);
}

// A new address: the next one on the main recovery phrase (so the same
// phrase backs it up), or a fresh one when the wallet has no phrase.
async function createAccount(password) {
  const list = loadAccounts();
  const main = list.find(a => a.kind === "main" && a.record?.mnemonicEnc);
  let w, mnemonicEnc, kind, index;
  if (main) {
    let phrase;
    try {
      phrase = await decryptPrivateKey(main.record.mnemonicEnc, password);
    } catch {
      throw new Error("Incorrect password.");
    }
    index = nextDerivedIndex(list);
    w = ethers.HDNodeWallet.fromPhrase(phrase, undefined, `m/44'/60'/0'/0/${index}`);
    mnemonicEnc = main.record.mnemonicEnc;
    kind = "derived";
  } else {
    await verifyWalletPassword(password);
    w = ethers.Wallet.createRandom();
    mnemonicEnc = await encryptPrivateKey(w.mnemonic.phrase, password);
    kind = "created";
  }
  const enc = await encryptPrivateKey(w.privateKey, password);
  addAccount({
    address: w.address,
    name: defaultAccountName(list, kind),
    kind,
    ...(index != null ? { index } : {}),
    record: { address: w.address, ...enc, mnemonicEnc, mpcEnabled: false }
  });
  rememberAccountKey(w.address, w.privateKey);
  await switchAccount(w.address);
}

// An address from elsewhere: a private key or a recovery phrase
async function importAccount(secret, password) {
  await verifyWalletPassword(password);
  const s = secret.trim();
  let w;
  let mnemonicEnc = null;
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) {
    w = new ethers.Wallet(s.startsWith("0x") ? s : `0x${s}`);
  } else {
    const words = s.toLowerCase().split(/\s+/).filter(Boolean);
    if (![12, 15, 18, 21, 24].includes(words.length)) throw new Error("That's not a private key or a 12 or 24-word recovery phrase.");
    try {
      w = ethers.Wallet.fromPhrase(words.join(" "));
    } catch {
      throw new Error("This recovery phrase isn't valid.");
    }
    mnemonicEnc = await encryptPrivateKey(words.join(" "), password);
  }
  if (findAccount(w.address)) throw new Error("This address is already in your wallet.");
  const list = loadAccounts();
  const enc = await encryptPrivateKey(w.privateKey, password);
  addAccount({
    address: w.address,
    name: defaultAccountName(list, "imported"),
    kind: "imported",
    record: { address: w.address, ...enc, ...(mnemonicEnc ? { mnemonicEnc } : {}), mpcEnabled: false }
  });
  rememberAccountKey(w.address, w.privateKey);
  await switchAccount(w.address);
}

// Sets one token's allowance for one contract back to zero
async function revokeApproval(tokenAddress, spender) {
  if (!unlockedPrivateKey) throw new Error("Unlock your wallet first.");
  const signer = new ethers.Wallet(unlockedPrivateKey, RPC);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const tx = await token.approve(spender, 0n);
  await tx.wait();
  setToast("Approval revoked.");
}

// Adds the Ledger plugged in (first address of its Ethereum app) and switches to it
async function connectLedgerAccount() {
  if (!ledgerSupported()) throw new Error("This browser can't reach a Ledger over USB. Use Chrome or Edge.");
  const address = await ledgerAddress(LEDGER_DEFAULT_PATH, (p) => p && setToast(p));
  const list = loadAccounts();
  if (!list.some(a => a.address.toLowerCase() === address.toLowerCase())) {
    addAccount({ address, name: `Ledger ${list.filter(a => a.kind === "ledger").length + 1}`, kind: "ledger", path: LEDGER_DEFAULT_PATH, record: null });
  }
  await switchAccount(address);
  const settings = await ledgerSettings().catch(() => null);
  if (settings?.blindSigning === false) setLedgerGuide({ model: settings.model, need: "both", blindOn: false });
}

// A whole plan as ONE Ledger signature (EIP-7702 batch, see ledgerBatch.js).
// The same transactions as the simulation, with Lyra's fee as extra calls.
// A plan's transactions as one batch: every step's calls, then Lyra's fee
// (on top for a send, taken out of the amount otherwise, as a normal run).
async function buildPlanBatch(steps, from) {
  const ctx = lyraFeeCtx();
  // Lyra's fee: on top for a send, taken out of the amount otherwise (as the normal run)
  const feeCalls = [];
  const ERC20 = new ethers.Interface(["function transfer(address to, uint256 amount) returns (bool)"]);
  const feeCall = (info, fee) => (info.isNative
    ? { to: LYRA_TREASURY, value: fee.toString(), data: "0x" }
    : { to: info.address, value: "0", data: ERC20.encodeFunctionData("transfer", [LYRA_TREASURY, fee]) });
  const adjusted = steps.map(st => {
    if (!["send", "swap", "stake", "bridge"].includes(st.kind) || st.amountIsEstimate || !(Number(st.amount) > 0)) return st;
    const info = assetInfo(st.asset, ctx);
    const raw = info ? toRaw(st.amount, info.decimals) : null;
    if (!info || !raw) return st;
    if (st.kind === "send") {
      if (isFeeExempt(from, st.recipient)) return st;
      const fee = feeOf(raw);
      if (feeIsWorthCharging(fee, info.decimals, usdPerUnit(st.asset, ctx))) feeCalls.push(feeCall(info, fee));
      return st;
    }
    const { fee, net } = splitIncluded(raw);
    if (net <= 0n || !feeIsWorthCharging(fee, info.decimals, usdPerUnit(st.asset, ctx))) return st;
    feeCalls.push(feeCall(info, fee));
    return { ...st, amount: ethers.formatUnits(net, info.decimals) };
  });
  const { calls, skipped } = await buildPlanCalls(adjusted, {
    from, network: activeNetwork, networkKey: activeNetworkKey, isTestnet: IS_TESTNET,
    tokens, defi, nativeSymbol: activeNetwork.nativeSymbol, nativePseudo: NATIVE_PSEUDO_ADDRESS,
    slippage: DEFAULT_SLIPPAGE, kyberBase: KYBERSWAP_API_BASE, kyberClientId: KYBERSWAP_CLIENT_ID,
    lifiQuoteUrl: LIFI_QUOTE_API_URL, aaveV4Reserve,
    circleChain: NETWORK_KEY_TO_CIRCLE_CHAIN[activeNetworkKey],
    networkKeyOfLifi: (code) => Object.keys(NETWORK_KEY_TO_LIFI_KEY).find(k => NETWORK_KEY_TO_LIFI_KEY[k] === code),
    suppliedV4: (v4) => new ethers.Contract(defi.aaveV4.spoke, AAVE_V4_SPOKE_ABI, RPC).getUserSuppliedAssets(v4.id, from),
  });
  return { calls: [...calls, ...feeCalls], skipped, adjusted };
}

async function executeLedgerPlan() {
  const steps = planSimSteps;
  if (!steps?.length) throw new Error("No plan pending.");
  // straight away, while the click still counts: the browser may ask which USB device
  await connectLedger();
  const settings = await ledgerSettings().catch(() => null);
  if (settings?.blindSigning === false) {
    throw Object.assign(new Error("Turn on Blind signing on your Ledger."), { ledgerSetup: "blind", ledgerModel: settings.model });
  }
  // any network where the Ledger-approved delegate (Simple7702Account) is deployed
  if (!(await batchSupported(RPC))) {
    throw new Error(`Nothing was sent. Plans with a Ledger aren't available on ${activeNetwork.name} yet (Plasma works).`);
  }
  const prompt = (p) => { if (p) { setStatus(p); setToast(p); } };
  setBusy(true);
  setExecutionLabel("Ledger");
  setExecutionSteps(["Prepare the plan", "Approve on your Ledger", "Confirm on-chain"]);
  setExecutionStepIndex(-1);
  setPlanStepIndex(0);
  beginExecutionTimer();
  try {
    const from = ledgerActive.address;
    const { calls, skipped, adjusted } = await buildPlanBatch(steps, from);
    if (skipped.length) {
      throw new Error(`Nothing was sent. ${skipped.map(i => planStepFrom(adjusted[i].kind, {}).label).join(", ")} can't be signed with a Ledger yet (Polymarket bets, or a token Circle doesn't bridge).`);
    }
    {
      const g = await guardBatch(steps, calls, from, await isDelegated(RPC, from));
      if (!g.ok) throw new Error(`Nothing was sent. ${g.problems[0]}`);
    }
    advanceExecutionTo(0);

    if (!(await isDelegated(RPC, from))) {
      // one time per network: the Lyra address sends the Ledger's delegation and pays its fee
      const saved = loadSavedWallet();
      const relayerKey = saved?.address ? accountKeysRef.current.get(saved.address.toLowerCase())?.privateKey : null;
      if (!relayerKey) throw new Error("Nothing was sent. Unlock your Lyra address once: it pays the one-time setup of Ledger plans.");
      prompt("One-time setup: approve on your Ledger");
      await activateBatching({ provider: RPC, ledgerAddress: from, path: ledgerActive.path, relayer: new ethers.Wallet(relayerKey, RPC), onPrompt: prompt });
    }

    prompt("Review and approve the plan on your Ledger");
    const tx = await sendLedgerBatch({ provider: RPC, ledgerAddress: from, path: ledgerActive.path, calls, onPrompt: prompt });
    advanceExecutionTo(1);
    setTxHash(tx.hash);
    if (multiTicket) setStepTxHashes(steps.map(() => tx.hash));
    setStatus("Confirming…");
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error("The plan was rejected on-chain. Nothing moved.");
    setPlanStepIndex(steps.length);
    advanceExecutionTo(2);
    await new Promise(resolve => setTimeout(resolve, DONE_TRANSITION_BEAT_MS));
    advanceExecutionTo(3);
    if (multiTicket) setMultiTicketDone(true);
    setMessages(m => [...m, { role: "ai", text: `✅ ${steps.length > 1 ? `All ${steps.length} steps` : "Done"}, in one Ledger signature.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);
    refreshBalance(from);
  } finally {
    await finishExecution();
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
    clearBackupPending();
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
  clearAccounts();
  accountKeysRef.current.clear();
  setShowAccounts(false);
  setWallet(null);
  setUnlockedPrivateKey(null);
  setLocked(false);
  setShowSettings(false);
  setShowResetConfirm(false);
  setShowWelcome(true);
  setBalance(0n);
  setMessages([]);
  setActivityRuns([]);
  sessionKeyCacheRef.current = null;
  clearBiometricRecord();
  clearDeviceKey();
  setBiometricEnabled(false);
}

// The record kept for biometric unlock, from a fresh registration:
// - "prf": the fingerprint itself derives the key (best, no password again);
// - "device" (web app only): when the phone's passkey provider has no PRF, a
//   non-extractable key kept by this browser, used once the fingerprint is
//   confirmed (no password again either);
// - "gate": the extension without PRF, the password once per session.
// PRF is tried once more at sign-in when creation didn't report it (some
// authenticators only answer then).
async function biometricRecordFor(reg, secretToEncrypt) {
  const { credentialId, prfSalt } = reg;
  let aesKey = reg.aesKey || null;
  // (the extension only when creation reported PRF: no needless second prompt)
  if (!aesKey && (reg.supportsPrf || IS_APP)) {
    try { aesKey = await getBiometricAesKey(credentialId, prfSalt); } catch (e) { if (e?.name === "NotAllowedError") throw e; aesKey = null; }
  }
  if (aesKey) {
    const { iv, ciphertext } = await encryptWithKey(aesKey, secretToEncrypt);
    return { tier: "prf", credentialId, prfSalt, iv, ciphertext, address: wallet.address };
  }
  if (IS_APP) {
    const deviceKey = await createDeviceKey();
    const { iv, ciphertext } = await encryptWithKey(deviceKey, secretToEncrypt);
    return { tier: "device", credentialId, iv, ciphertext, address: wallet.address };
  }
  return { tier: "gate", credentialId, address: wallet.address };
}
const biometricToast = (tier) => (tier === "gate"
  ? "Biometric shortcut enabled. Still needs your password after the extension fully closes."
  : "Biometric unlock enabled. No password needed on this device.");

// Registers this device's biometrics for the wallet (one OS prompt) and
// stores the record. Throws if cancelled. `quiet` skips the toast.
async function enrollBiometric({ quiet = false } = {}) {
  if (!unlockedPrivateKey) throw new Error("Unlock your wallet with your password first.");
  const secretToEncrypt = localSecretRef.current || unlockedPrivateKey;
  const record = await biometricRecordFor(await registerBiometric(wallet.address), secretToEncrypt);
  saveBiometricRecord(record);
  try { localStorage.removeItem("lyra_biometric_optout_v1"); } catch {}
  setBiometricEnabled(true);
  if (!quiet) setToast(biometricToast(record.tier));
  return record;
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

    const record = await biometricRecordFor(await registerBiometric(wallet.address), secretToEncrypt);
    saveBiometricRecord(record);
    try { localStorage.removeItem("lyra_biometric_optout_v1"); } catch {}
    setToast(biometricToast(record.tier));
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
  clearDeviceKey();
  try { localStorage.setItem("lyra_biometric_optout_v1", "1"); } catch {}
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

    if (record.tier === "prf" || record.tier === "device") {
      let aesKey;
      if (record.tier === "prf") {
        aesKey = await getBiometricAesKey(record.credentialId, record.prfSalt);
      } else {
        await confirmBiometricPresence(record.credentialId);
        aesKey = await loadDeviceKey();
      }
      if (!aesKey) throw new Error("Biometric key unavailable. Use your password once: fingerprint unlock is then set up again.");
      const localSecret = await decryptWithKey(aesKey, record.iv, record.ciphertext);
      privateKey = await reconstructPrivateKey(localSecret, record.address, saved?.mpcEnabled);
      localSecretRef.current = localSecret;
    } else {
      if (!sessionKeyCacheRef.current) {
        throw new Error(IS_APP
          ? "Enter your password once: Lyra then sets up fingerprint unlock that works every time."
          : "Your session expired. Enter your password once to continue.");
      }
      await confirmBiometricPresence(record.credentialId);
      privateKey = sessionKeyCacheRef.current;
    }

    const w = new ethers.Wallet(privateKey);
    // biometrics were set up on one address; if another one is in use now, go back to it
    let mpcFlag = !!saved?.mpcEnabled;
    if (saved?.address && w.address.toLowerCase() !== saved.address.toLowerCase() && findAccount(w.address)) {
      mpcFlag = !!activateAccount(w.address).mpcEnabled;
    }
    sessionKeyCacheRef.current = privateKey;
    rememberAccountKey(w.address, privateKey, localSecretRef.current || privateKey);
    setUnlockedPrivateKey(privateKey);
    setMpcEnabled(mpcFlag);
    setWallet({ address: w.address });
    haptic("success");
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

  // silent: the background poll below. No spinner, no status line, no toast,
  // just the numbers updating when something arrives.
  async function refreshBalance(address = wallet?.address, { silent = false } = {}) {
  if (!address) return;
  if (!silent) setBalanceLoading(true);
  try {
    if (!silent) setStatus("Reading the network…");
    const b = await RPC.getBalance(address);
    if (!isShown(address)) return;
    setBalance(b);
    setBalanceReady(true);
    if (!silent) setStatus(`Connected to ${activeNetwork.name}`);

    const [walletTokens, staked] = await Promise.all([
      refreshTokenBalances(address),
      refreshStakedBalances(address)
    ]);
    if (isShown(address)) noteSeenBalances(address, b, walletTokens);

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
      setPortfolioHistory(recordPortfolioSnapshot(b, defiValueXpl, activeNetworkKey, address));
    }
  } catch (e) {
    console.error(e);
    if (silent) return;
    setStatus("RPC unavailable");
    setToast("Network unavailable, couldn't refresh the balance.");
  } finally {
    if (!silent) setBalanceLoading(false);
  }
}

// Anything received (native coin, any listed token, staked position) shows
// up on its own: re-read the balances every 15s while the wallet is
// unlocked and Lyra is on screen.
useEffect(() => {
  if (!wallet?.address || locked) return;
  const t = setInterval(() => {
    if (document.visibilityState === "visible") refreshBalance(wallet.address, { silent: true });
  }, 15000);
  return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [wallet?.address, locked, activeNetworkKey]);

  // Money that arrives: the balances are re-read every 15 s (and after every
  // action); a rise the wallet didn't cause itself is a receipt. The explorer's
  // history can take minutes to index it, so it is only used afterwards, to
  // name the sender. The last balances seen are also kept on this device: money
  // that came in while the wallet was closed shows when it opens again.
  const SEEN_BALANCES_KEY = "lyra_seen_balances_v1";
  const lastBalancesRef = useRef(null); // { key, since, native, tokens }
  const ownActivityAtRef = useRef(0);
  useEffect(() => {
    if (busy || executionSteps.length > 0 || multiTicket || defiTicket || showSend) ownActivityAtRef.current = Date.now();
  });

  // one rise: the pill, with the sender when it can be found
  function announceReceipt(r, key) {
    const amount = Number(ethers.formatUnits(r.raw, r.decimals));
    if (!(amount > 0)) return;
    const id = `${key}:${Date.now()}`;
    // A token's sender is read on-chain right away (its Transfer log); the
    // native coin's comes from the history, checked every 4 s until the
    // explorer has indexed it. After ~12 s the pill shows without a name.
    const address = wallet.address;
    let shown = false;
    const show = (from) => {
      if (shown) return;
      shown = true;
      const contact = from ? loadContacts().find(c => c.address?.toLowerCase() === String(from).toLowerCase()) : null;
      setIncoming({ id, amount, symbol: r.symbol, from: from ? contact?.name || shortAddress(from) : null });
    };
    const fromLogs = async () => {
      const token = tokens[r.symbol];
      if (!token?.address) return null;
      const latest = await RPC.getBlockNumber();
      const logs = await RPC.getLogs({
        address: token.address,
        topics: [ethers.id("Transfer(address,address,uint256)"), null, ethers.zeroPadValue(address, 32)],
        fromBlock: Math.max(0, latest - 1000),
        toBlock: latest,
      });
      const last = logs[logs.length - 1];
      return last ? ethers.getAddress("0x" + last.topics[1].slice(26)) : null;
    };
    const fromHistory = async () => {
      const res = await fetch(`${API_BASE_URL}/api/transactions/${address}?network=${activeNetworkKey}`);
      const { transactions = [] } = res.ok ? await res.json() : {};
      const row = buildTxRows(transactions, address, defi)
        .filter(x => x.category === "send" && !x.isSent && (x.display?.symbol || activeNetwork.nativeSymbol) === r.symbol)
        .sort((x, y) => y.timestamp - x.timestamp)[0];
      return row && Date.now() / 1000 - row.timestamp < 86400 ? row.counterparty : null;
    };
    const findSender = async (tries) => {
      if (shown) return;
      try {
        const from = (await fromLogs().catch(() => null)) || (await fromHistory().catch(() => null));
        if (from) { show(from); return; }
      } catch { /* try again below */ }
      if (tries > 0) setTimeout(() => findSender(tries - 1), 4000);
    };
    findSender(3);
    setTimeout(() => show(null), 12000);
  }

  function balanceRises(prevNative, prevTokens, native = balance, walletTokens = tokenBalances) {
    const rises = [];
    if (prevNative !== undefined && native > prevNative) rises.push({ symbol: activeNetwork.nativeSymbol, raw: native - prevNative, decimals: 18 });
    for (const [sym, v] of Object.entries(walletTokens)) {
      const before = prevTokens?.[sym];
      if (before !== undefined && v > before) rises.push({ symbol: sym, raw: v - before, decimals: tokens[sym]?.decimals ?? 18 });
    }
    return rises;
  }

  // Called with balances just read for one address on this network. The
  // first read after opening is compared with the last one kept here (money
  // that came in while the wallet was closed), then kept in its place.
  const awayCheckedRef = useRef(new Set()); // network:address compared since opening
  function noteSeenBalances(address, native, walletTokens) {
    const key = `${activeNetworkKey}:${address.toLowerCase()}`;
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(SEEN_BALANCES_KEY) || "{}"); } catch { /* starts empty */ }
    const stored = seen[key];
    const failed = walletTokens.failed || new Set(); // unread this time: neither compared nor kept
    const toBig = (v) => { try { return BigInt(v); } catch { return undefined; } };
    if (stored && !awayCheckedRef.current.has(key)) {
      // the wallet's own action just before it was closed also raises a balance
      if (Date.now() - (stored.ownAt || 0) > 90000) {
        const before = Object.fromEntries(Object.entries(stored.tokens || {}).filter(([k]) => !failed.has(k)).map(([k, v]) => [k, toBig(v)]));
        const away = balanceRises(toBig(stored.native), before, native, walletTokens);
        if (away.length) announceReceipt(away[0], key);
      }
    }
    awayCheckedRef.current.add(key);
    const kept = { ...(stored?.tokens || {}) };
    for (const [k, v] of Object.entries(walletTokens)) if (!failed.has(k)) kept[k] = v.toString();
    seen[key] = { native: native.toString(), tokens: kept, ownAt: ownActivityAtRef.current };
    try { localStorage.setItem(SEEN_BALANCES_KEY, JSON.stringify(seen)); } catch { /* not kept */ }
  }

  useEffect(() => {
    if (!wallet?.address || locked || !balanceReady) return;
    const key = `${activeNetworkKey}:${wallet.address.toLowerCase()}`;
    const prev = lastBalancesRef.current;
    const since = prev && prev.key === key ? prev.since : Date.now();
    lastBalancesRef.current = { key, since, native: balance, tokens: { ...tokenBalances } };

    if (!prev || prev.key !== key) return;
    // just switched network or address: the first reads are still settling
    if (Date.now() - since < 20000) return;
    // the wallet's own swap, withdrawal, bridge... also raise a balance
    if (Date.now() - ownActivityAtRef.current < 90000) return;
    const rises = balanceRises(prev.native, prev.tokens);
    if (rises.length) announceReceipt(rises[0], key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance, tokenBalances]);
  useEffect(() => {
    if (!incoming) return;
    // 6 s on screen
    const t = setTimeout(() => setIncoming(null), 6000);
    return () => clearTimeout(t);
  }, [incoming?.id]);

  async function createWallet() {
  const w = ethers.Wallet.createRandom();

  const mnemonic = w.mnemonic?.phrase;

  if (!mnemonic) {
    throw new Error(
      "Couldn't generate the recovery phrase."
    );
  }

  // Backup is deferred: straight to the password step so the wallet is
  // usable right away. The recovery phrase is still stored (encrypted
  // with the password) and a persistent nudge asks to back it up once
  // the wallet actually holds funds.
  setPendingMnemonic(mnemonic);
  setPendingPrivateKey(w.privateKey);
  markBackupPending(w.address);

  setWallet({
    address: w.address
  });

  setPasswordSetupMode("create");
  setNewPassword("");
  setConfirmPassword("");
  setPasswordSetupError("");
  setShowWallet(false);
  setShowPasswordSetup(true);
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

  // One address from its private key (no recovery phrase): straight to the password step.
  function importPrivateKey(raw) {
    const hex = String(raw || "").trim().replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("A private key is 64 hexadecimal characters (with or without 0x).");
    const w = new ethers.Wallet("0x" + hex);
    setPendingPrivateKey(w.privateKey);
    setPendingMnemonic(null);
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
    // Re-store the phrase under the new password too, otherwise "Show
    // recovery phrase" stops working after a reset.
    setPendingMnemonic(phrase);
    setResetMpcEnabled(!!saved.mpcEnabled);
    setPasswordSetupMode("reset");
    setShowForgotPassword(false);
    setShowPasswordSetup(true);

  } catch (e) {
    console.error(e);
    setForgotError("Invalid recovery phrase.");
  }
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
    const crossAsset = ticket.tokenOutSymbol && ticket.tokenOutSymbol !== ticket.asset;
    const steps = ["Get bridge quote"];
    if (!isNative) steps.push(`Approve ${ticket.asset}`);
    const dest = lifiChainDisplayName(ticket.destinationChainKey) || "destination chain";
    steps.push(crossAsset
      ? `Bridge ${ticket.asset} to ${ticket.tokenOutSymbol} on ${dest}`
      : `Bridge ${ticket.asset} to ${dest}`);
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
      return buildBridgeSteps({ asset: step.asset, destinationChainKey: step.destinationChainKey, tokenOutSymbol: step.tokenOutSymbol });
    }
    if (step.kind === "predict") return buildPredictionSteps();
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
  let result;
  try {
    result = await kit.swap({
      from: { adapter, chain: NETWORK_KEY_TO_CIRCLE_CHAIN.arc },
      tokenIn: assetInSymbol,
      tokenOut: assetOutSymbol,
      amountIn: String(ticket.amount),
      config: { slippageBps },
    });
  } catch (e) {
    // Circle returns "No route available" when it can't fill this amount
    // on Arc right now (thin pools, especially on testnet).
    if (/UNSUPPORTED_ROUTE|No route/i.test(String(e?.code || "") + " " + String(e?.message || ""))) {
      throw new Error(`Circle found no route for ${ticket.amount} ${assetInSymbol} -> ${assetOutSymbol} on ${activeNetwork.name} right now${IS_TESTNET ? " (testnet liquidity is thin)" : ""}. Try a smaller amount or retry in a few minutes.`);
    }
    throw e;
  }

  const tx = await fetchBroadcastTx(signer.provider, result.txHash);
  await advanceToDoneWithBeat(steps.length);
  return tx;
}

 // Lyra's 0.25% fee on swaps, bridges and staking deposits: taken out of the
 // amount, sent to the treasury only AFTER the action succeeded (src/fees.js).
 // The *Core functions below are the original executors.
 function lyraFeeCtx() {
  return { nativeSymbol: activeNetwork.nativeSymbol, tokens, xplPriceUSD, erc20Abi: ERC20_ABI, onFee: reportLyraFee };
 }
 function reportLyraFee(result) {
  if (result.collected) {
    logAuditEvent({ category: "fee", action: "lyra-fee", networkKey: activeNetworkKey, asset: result.asset, amount: result.amount, counterparty: LYRA_TREASURY, txHash: result.hash });
  } else {
    console.warn("Lyra fee not collected:", result.reason);
  }
 }
 async function executeSwapTicket(signer, ticket) {
  return runWithLyraFee({ signer, ticket, core: executeSwapTicketCore, ctx: lyraFeeCtx() });
 }
 async function executeStakeTicket(signer, ticket) {
  return runWithLyraFee({ signer, ticket, core: executeStakeTicketCore, ctx: lyraFeeCtx() });
 }
 async function executeBridgeTicket(signer, ticket) {
  return runWithLyraFee({ signer, ticket, core: executeBridgeTicketCore, ctx: lyraFeeCtx() });
 }

 async function executeSwapTicketCore(signer, ticket) {
  if (activeNetworkKey === "arc") {
    return executeArcSwapTicket(signer, ticket);
  }
  if (IS_TESTNET) {
    // KyberSwap has no testnets, only Arc's Circle Swap Kit does.
    throw new Error(`Swaps aren't available on ${activeNetwork.name} yet. On testnet only USDC <-> EURC on Arc Testnet can be swapped.`);
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

async function executeStakeTicketCore(signer, ticket) {
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
    const toKey = LIFI_KEY_TO_NETWORK_KEY[String(ticket.destinationChainKey || "").toLowerCase()] || String(ticket.destinationChainKey || "").toLowerCase();
    const fromChain = NETWORK_KEY_TO_CIRCLE_CHAIN[fromKey];
    const toChain = NETWORK_KEY_TO_CIRCLE_CHAIN[toKey];
    if (!fromChain || !toChain) {
      throw new Error(`Bridging between ${getNetworkByKey(fromKey).name} and ${getNetworkByKey(toKey).name} isn't supported yet.`);
    }
    const assetSymbol = ticket.asset === activeNetwork.nativeSymbol ? "USDC" : ticket.asset;
    if (assetSymbol !== "USDC" && assetSymbol !== "EURC") {
      throw new Error(IS_TESTNET ? "Only USDC and EURC can be bridged on testnet, via Circle's own Bridge Kit." : "Only USDC and EURC can be bridged to/from Arc today, via Circle's own Bridge Kit.");
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

  async function executeBridgeTicketCore(signer, ticket) {
  if (IS_TESTNET || activeNetworkKey === "arc" || ticket.destinationChainKey === "arc") {
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
  // tokenOutSymbol lets a bridge step land as a DIFFERENT asset than it
  // left as (a real swap+bridge combined into one LI.FI route) --
  // e.g. bridging ETH on Base into USDC on Polygon in one step, for a
  // platform that requires a specific chain+token (Polymarket: USDC.e
  // on Polygon) or a small native-gas top-up on the destination chain
  // (tokenOutSymbol = that chain's own native symbol). Defaults to the
  // same asset, i.e. today's plain same-token bridge, unchanged.
  url.searchParams.set("toToken", ticket.tokenOutSymbol || ticket.asset);
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
  const EXTRA_LIFI_CHAINS = IS_TESTNET ? [] : [
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
    if (!wallet?.address || IS_TESTNET) return []; // consolidation runs through LI.FI, which has no testnets
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
      // A candidate with a stablecoin balance but ~0 native gas can't
      // actually send the bridge tx this routing needs from it -- checked
      // once per network (not once per token) and cached here, so a
      // network with no stablecoin balance at all never pays for it.
      let hasGas = null;
      async function checkGas() {
        if (hasGas !== null) return hasGas;
        try {
          const [nativeBal, feeData] = await Promise.all([provider.getBalance(wallet.address), provider.getFeeData()]);
          const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
          // 300k gas units is a generous upper bound for an ERC-20
          // approve + LI.FI swap/bridge call together, real costs are
          // typically well under it -- this only needs to catch the
          // "effectively zero gas" case, not be gas-estimate-exact.
          hasGas = gasPrice > 0n ? nativeBal >= gasPrice * 300000n : nativeBal > 0n;
        } catch (e) {
          hasGas = false;
        }
        return hasGas;
      }
      for (const [symbol, token] of Object.entries(tokenList)) {
        if (!token.address) continue;
        try {
          const erc20 = new ethers.Contract(token.address, ERC20_ABI, provider);
          const bal = await erc20.balanceOf(wallet.address);
          if (bal > 0n) {
            found.push({ networkKey: network.key, network, symbol, address: token.address, decimals: token.decimals, balance: bal, hasGas: await checkGas() });
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
    const eligible = candidates.filter(c => c.balance >= shortfall + margin);
    // A candidate with enough stablecoin but no native gas on its own
    // chain can't actually send the bridge tx -- prefer one that can.
    const candidate = eligible.find(c => c.hasGas) || null;
    if (!candidate) {
      if (eligible.length > 0) {
        throw new Error(`Found enough ${eligible[0].symbol} on ${eligible[0].network.name} to cover this, but that network has no gas to send the bridge transaction. Add a small amount of ${eligible[0].network.nativeSymbol} there, or fund ${targetNetwork.name} directly.`);
      }
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


    setStatus("Authenticating with Polymarket…");
    const creds = await getOrDeriveClobCreds(signer);

    setStatus("Placing the bet…");
    const result = await submitClobOrder(creds, signedOrder, "FOK");

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


    setStatus("Authenticating with Polymarket…");
    const creds = await getOrDeriveClobCreds(signer);

    setStatus("Cashing out…");
    const result = await submitClobOrder(creds, signedOrder, "FOK");

    await advanceToDoneWithBeat(2);

    return result;
  }

  // Before anything signed with the wallet's own key runs: enough of the
  // native coin for its fees? If not, and the network allows it (CoW
  // Protocol: Ethereum, Base, Polygon, Plasma), a little is bought with the
  // user's stablecoins, signed only, nothing to advance (src/gasTopUp.js).
  // Arc pays in USDC; plain USDT0 sends on Plasma are free. `steps`:
  // [{ kind, asset }] of what is about to run.
  const GAS_FLOOR = { plasma: "0.2", base: "0.0001", polygon: "0.3", ethereum: "0.0008" };
  async function ensureNativeGas(steps) {
    if (ledgerActive || !unlockedPrivateKey) return;
    if (!needsNativeGas(activeNetworkKey, steps)) return;
    const signer = new ethers.Wallet(unlockedPrivateKey, RPC);
    const [have, feeData] = await Promise.all([RPC.getBalance(signer.address), RPC.getFeeData()]);
    const perGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
    // a plan: its calls, their approvals, Lyra's fee transfers
    const need = perGas * 250000n * BigInt(Math.max(1, steps.length) * 2);
    if (have >= need && have > 0n) return;
    if (!canTopUp(activeNetworkKey)) return; // the usual "a little X for the fees" checks apply
    const floor = ethers.parseEther(GAS_FLOOR[activeNetworkKey] || "0");
    let buy = need * 2n - have;
    if (buy < floor) buy = floor;
    const got = await topUpNativeGas({
      wallet: signer,
      networkKey: activeNetworkKey,
      tokens,
      buyNative: buy,
      nativeSymbol: activeNetwork.nativeSymbol,
      onStatus: setStatus,
    });
    setToast(`Got ${Number(ethers.formatEther(buy)).toPrecision(2)} ${activeNetwork.nativeSymbol} for the network fees, paid with ${got.paid}.`);
  }

  async function executeDefiTicket() {
    if (!unlockedPrivateKey) {
      throw new Error("Wallet locked.");
    }
    if (defiTicket) await ensureNativeGas([{ kind: defiTicket.feature === "staking" ? (defiTicket.intent === "UNSTAKE_XPL" ? "unstake" : "stake") : defiTicket.feature, asset: defiTicket.asset || activeNetwork.nativeSymbol }]);
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
    await ensureNativeGas(multiTicket.steps.map(st => ({ kind: st.kind, asset: st.asset })));
    // in one transaction, prepared while the plan was on screen
    if (await runOwnBatch()) return;

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

      // All or nothing: check every step BEFORE the first signature, with
      // fresh balances, so a plan never stops after sending only part of it.
      {
        const blocker = planBlocker(multiTicket.steps);
        if (blocker) throw new Error(`Nothing was sent. ${blocker}`);
        const need = {};
        const made = {}; // what a swap earlier in the plan brings (its quote, 1% under)
        for (const st of multiTicket.steps) {
          if (st.kind === "swap" && st.tokenOutSymbol) {
            const out = Number(String(st.ticket?.estimatedReceive || "").replace(/[^d.]/g, ""));
            if (out > 0) made[st.tokenOutSymbol] = (made[st.tokenOutSymbol] || 0) + out * 0.99;
          }
          if (!["send", "swap", "bridge", "stake"].includes(st.kind) || st.amountIsEstimate || !st.asset) continue;
          const amt = Number(st.amount);
          if (Number.isFinite(amt) && amt > 0) need[st.asset] = (need[st.asset] || 0) + amt;
        }
        for (const [asset, total] of Object.entries(need)) {
          const amt = Math.max(0, total - (made[asset] || 0));
          if (amt === 0) continue;
          const have = await balanceOfAsset(asset);
          if (have < ethers.parseUnits(amt.toFixed(decimalsOfAsset(asset) > 6 ? 6 : decimalsOfAsset(asset)), decimalsOfAsset(asset))) {
            throw new Error(`Nothing was sent. You have ${ethers.formatUnits(have, decimalsOfAsset(asset))} ${asset}, this plan needs ${amt} ${asset}.`);
          }
        }
        if (needsNativeGas(activeNetworkKey, multiTicket.steps.map(st => ({ kind: st.kind, asset: st.asset }))) && (await RPC.getBalance(signer.address)) === 0n) {
          throw new Error(`Nothing was sent. You need a little ${activeNetwork.nativeSymbol} on ${activeNetwork.name} to pay the network fees.`);
        }
      }

            for (let i = 0; i < multiTicket.steps.length; i++) {
        const step = multiTicket.steps[i];
        const stepLabel = `Step ${i + 1}/${multiTicket.steps.length}`;
        // "all of it": the real balance now (what earlier steps brought
        // included); the native coin keeps what the fees need
        let allAmount = null;
        if (step.amountAll && step.asset) {
          let live = await balanceOfAsset(step.asset);
          if (step.asset === activeNetwork.nativeSymbol) {
            const fd = await RPC.getFeeData();
            const reserve = (fd.maxFeePerGas ?? fd.gasPrice ?? 0n) * 400000n;
            live = live > reserve ? live - reserve : 0n;
          }
          if (live > 0n) allAmount = ethers.formatUnits(live, decimalsOfAsset(step.asset));
        }
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

          const amountToUse = allAmount ?? ((carriedAmount !== null && step.amountIsEstimate) ? carriedAmount : step.amount);
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
          {
            // Lyra's 0.25% on top, after the transfer confirmed
            const info = assetInfo(step.asset, lyraFeeCtx());
            const rawSent = info ? toRaw(amountToUse, info.decimals) : null;
            if (info && rawSent && !isFeeExempt(signer.address, recipient)) {
              const feeRaw = feeOf(rawSent);
              if (feeIsWorthCharging(feeRaw, info.decimals, usdPerUnit(step.asset, lyraFeeCtx()))) {
                reportLyraFee(await collectLyraFee({ signer, asset: step.asset, feeRaw, ctx: lyraFeeCtx() }));
              }
            }
          }
          advanceExecutionTo(1);
          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} confirmed.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

          carriedAmount = null;

        } else if (step.kind === "swap") {
          const stepTicket = { ...step.ticket, amount: allAmount ?? ((carriedAmount !== null && step.amountIsEstimate) ? carriedAmount : step.amount), asset: step.asset, tokenOutSymbol: step.tokenOutSymbol };
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
          const stepTicket = { ...step.ticket, amount: allAmount ?? ((carriedAmount !== null && step.amountIsEstimate) ? carriedAmount : step.amount), asset: step.asset, intent: step.intent };
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
          const stepTicket = { ...step.ticket, amount: allAmount ?? ((carriedAmount !== null && step.amountIsEstimate) ? carriedAmount : step.amount), asset: step.asset, destinationChainKey: step.destinationChainKey, tokenOutSymbol: step.tokenOutSymbol };
          const tx = await executeBridgeTicket(signer, stepTicket);

          setTxHash(tx.hash);
          setStepTxHashes(prev => { const next = [...prev]; next[i] = tx.hash; return next; });
          setMessages(m => [...m, { role: "ai", text: `${stepLabel} sent (bridge). Hash: ${shortAddress(tx.hash)}` }]);
          await tx.wait();
          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} confirmed.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

          // A bridge lands on a DIFFERENT chain than this signer/provider
          // is connected to (the destination chain's funds aren't
          // readable from here, and arrival isn't instant even once this
          // send-side tx confirms), so unlike swap/unstake above there's
          // no real received amount to carry forward. A step placed after
          // a bridge must use its own explicit amount, not an estimate.
          carriedAmount = null;

          // If another step follows (e.g. SMART FUNDING's bridge-then-
          // predict), it needs these funds to have actually landed, not
          // just this send-side tx to be confirmed -- bridging takes a
          // few minutes. Same polling approach as x402's own Smart
          // Liquidity Routing (ensureFundsForX402 above): poll the
          // destination chain's real balance until it clears the quoted
          // amount (5% slack for ordinary quote-vs-actual slippage), or
          // time out after 5 minutes rather than hang forever.
          if (i < multiTicket.steps.length - 1 && step.destinationChainKey) {
            const destKey = Object.keys(NETWORK_KEY_TO_LIFI_KEY).find(k => NETWORK_KEY_TO_LIFI_KEY[k] === step.destinationChainKey);
            const destNetwork = destKey ? getNetworkByKey(destKey) : null;
            const outAsset = step.tokenOutSymbol || step.asset;
            const expectedMatch = String(step.ticket?.estimatedReceive || "").match(/[\d.]+/);
            const expected = expectedMatch ? Number(expectedMatch[0]) : null;

            if (destNetwork && expected) {
              setStatus(`Waiting for the bridged funds to arrive on ${destNetwork.name}…`);
              const destProvider = new ethers.JsonRpcProvider(destNetwork.rpcUrl, destNetwork.chainId);
              const destAddress = await signer.getAddress();
              const isNativeOut = outAsset === destNetwork.nativeSymbol;
              const outToken = !isNativeOut ? (TOKENS_BY_NETWORK[destKey] || {})[outAsset] : null;
              const outDecimals = isNativeOut ? 18 : (outToken?.decimals ?? 6);
              const target = ethers.parseUnits((expected * 0.95).toFixed(outDecimals), outDecimals);

              const deadline = Date.now() + 5 * 60 * 1000;
              let arrived = false;
              while (Date.now() < deadline) {
                const bal = isNativeOut
                  ? await destProvider.getBalance(destAddress)
                  : (outToken?.address ? await new ethers.Contract(outToken.address, ERC20_ABI, destProvider).balanceOf(destAddress) : 0n);
                if (bal >= target) { arrived = true; break; }
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
              if (!arrived) {
                throw new Error(`${stepLabel}'s bridge was sent but the funds hadn't arrived on ${destNetwork.name} within 5 minutes. Try the plan's next step again once they land.`);
              }
            }
          }

        } else if (step.kind === "predict") {
          // Always Polygon, regardless of activeNetwork -- same reasoning
          // as the standalone PREDICT_MARKET flow (Polymarket has no
          // presence on any other chain). Off-chain order (CLOB matching),
          // so there's no tx hash/receipt to wait on, unlike every other
          // step kind here.
          const polygonNetwork = getNetworkByKey("polygon");
          const polygonProvider = new ethers.JsonRpcProvider(polygonNetwork.rpcUrl, polygonNetwork.chainId);
          const polygonSigner = new ethers.Wallet(unlockedPrivateKey, polygonProvider);
          const orderResult = await executePredictionTicket(polygonSigner, step.ticket);

          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} placed (bet) on Polymarket.${orderResult?.orderId ? ` Order ID: ${shortAddress(orderResult.orderId)}` : ""}` }]);
          logAuditEvent({ category: "predictions", action: "bet", networkKey: "polygon", amountUSD: step.ticket?.amountUSD, meta: { orderId: orderResult?.orderId } });

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
    // with Lyra's fee there are two transfers to pay gas for
    const reserveAll = isFeeExempt(wallet.address, recipient) ? reserve : reserve * 2n;

    if (rawBalance <= reserveAll) {
      throw new Error(`Your ${activeNetwork.nativeSymbol} balance is too low to cover the network fee, there's nothing left to send.`);
    }

    if (isFeeExempt(wallet.address, recipient)) return ethers.formatEther(rawBalance - reserve);
    const split = splitOnTop(rawBalance - reserveAll);
    return ethers.formatEther(feeIsWorthCharging(feeOf(split.amount), 18, usdPerUnit(activeNetwork.nativeSymbol, { nativeSymbol: activeNetwork.nativeSymbol, xplPriceUSD })) ? split.amount : rawBalance - reserve);
  }

  async function signAndSend() {
  if (ledgerActive) {
    return executeLedgerPlan();
  }
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

  await ensureNativeGas([{ kind: "send", asset: sendAssetSymbol }]);

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

    // Lyra's 0.25% on top of the amount (the recipient always gets the exact
    // amount). Skipped for sends to yourself or to the treasury, for dust, and
    // when the balance can't cover it. It is sent only after the main transfer
    // confirmed, so a failed send never costs a fee.
    const feeExempt = isFeeExempt(signer.address, sendTo);
    const sendFeeDecimals = isTokenSend ? sendToken.decimals : 18;
    const sendFeeWorth = (raw) => feeIsWorthCharging(feeOf(raw), sendFeeDecimals, usdPerUnit(sendAssetSymbol, { nativeSymbol: activeNetwork.nativeSymbol, xplPriceUSD }));
    let lyraFeeRaw = 0n;

    if (isTokenSend) {
      const contract = new ethers.Contract(sendToken.address, ERC20_ABI, signer);
      const current = await contract.balanceOf(signer.address);
      // A "send max" token transfer uses the live balance directly
      // (no gas reserve needed, the token amount itself never pays
      // the network fee) rather than round-tripping through the
      // display string, which avoids leaving dust behind from a
      // formatUnits/parseUnits rounding step.
      let value;
      if (sendIsMax) {
        if (feeExempt) {
          value = current;
        } else {
          const split = splitOnTop(current);
          value = sendFeeWorth(split.amount) ? split.amount : current;
          lyraFeeRaw = value === split.amount ? split.fee : 0n;
        }
      } else {
        value = ethers.parseUnits(sendAmount, sendToken.decimals);
        if (!feeExempt && sendFeeWorth(value) && current >= value + feeOf(value)) lyraFeeRaw = feeOf(value);
      }

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
        // two transfers (the send and the Lyra fee) need gas when a fee applies
        const reserveAll = feeExempt ? reserve : reserve * 2n;

        if (current <= reserveAll) {
          throw new Error(`Your ${activeNetwork.nativeSymbol} balance is too low to cover the network fee, there's nothing left to send.`);
        }

        if (feeExempt) {
          value = current - reserve;
        } else {
          const split = splitOnTop(current - reserveAll);
          if (sendFeeWorth(split.amount)) {
            value = split.amount;
            lyraFeeRaw = split.fee;
          } else {
            value = current - reserve;
          }
        }
      } else {
        value = ethers.parseEther(sendAmount);

        if (current < value) {
          throw new Error(`Insufficient ${activeNetwork.nativeSymbol} balance for this transfer.`);
        }
        if (!feeExempt && sendFeeWorth(value) && current >= value + feeOf(value)) lyraFeeRaw = feeOf(value);
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

    if (lyraFeeRaw > 0n) {
      setStatus("Collecting the Lyra fee…");
      reportLyraFee(await collectLyraFee({ signer, asset: sendAssetSymbol, feeRaw: lyraFeeRaw, ctx: lyraFeeCtx() }));
    }

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
    if (e.serverUnreachable) {
      return `❌ Lyra's server isn't answering (${API_BASE_URL}). Check that the backend is running, then try again.`;
    }
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
        // present, prefer it over the full e.message. A raw node or
        // contract dump (hex data, "action=", "code=") says nothing to a
        // person: a plain sentence instead.
        {
          const raw = String(e.shortMessage || e.message || "");
          if (!raw || /0x[0-9a-f]{16,}|action=|code=|reason=|\{"|transaction=/i.test(raw)) {
            return "❌ This didn't go through and nothing was sent. Try again in a moment.";
          }
          return `❌ ${raw}`;
        }
    }
  }

  // What Lyra is doing while a request runs: real steps (reading the
  // request, checking the balance, looking at the recipient...), shown
  // under the user's message like a work log. Never invented: a step
  // only exists if the wallet really did that thing.
  const activityRef = useRef({ id: null, pending: 0, askDone: false });
  const patchRun = (id, fn) => setActivityRuns(rs => rs.map(r => (r.id === id ? fn(r) : r)));
  function activityStart(anchor) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activityRef.current = { id, pending: 0, askDone: false };
    setActivityRuns(rs => [...rs.slice(-4), { id, anchor, t0: Date.now(), t1: null, steps: [] }]);
  }
  // Adds a step; the previous running step is closed first.
  function activityStep(label, detail = "", state = "run") {
    const id = activityRef.current.id;
    if (!id) return;
    patchRun(id, r => ({
      ...r,
      steps: [...r.steps.map(st => (st.state === "run" ? { ...st, state: "done" } : st)), { label, detail, state }]
    }));
  }
  // Closes the running step, optionally with its result.
  function activityDone(detail) {
    const id = activityRef.current.id;
    if (!id) return;
    patchRun(id, r => ({
      ...r,
      steps: r.steps.map((st, i) => (i === r.steps.length - 1 ? { ...st, state: "done", detail: detail ?? st.detail } : st))
    }));
  }
  // Sets the result shown next to one phase in the recap.
  function activitySetDetail(index, detail) {
    const id = activityRef.current.id;
    if (!id || !detail) return;
    patchRun(id, r => ({ ...r, steps: r.steps.map((st, i) => (i === index ? { ...st, detail } : st)) }));
  }
  // A plain conversational answer has nothing worth a work log.
  function activityMarkPlain() {
    const id = activityRef.current.id;
    if (id) patchRun(id, r => ({ ...r, plain: true }));
  }
  function activityEnd(id) {
    if (!id) return;
    setActivityRuns(rs => rs
      .filter(r => r.id !== id || (!r.plain && r.steps.length >= 2))
      .map(r => (r.id === id ? { ...r, t1: Date.now(), steps: r.steps.map(st => ({ ...st, state: "done" })) } : r)));
  }
  const activitySleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Real address check (look-alike of a contact + on-chain), remembered for
  // a couple of minutes so the work done while Lyra reads the request is not
  // repeated when the ticket opens.
  const addressCheckCache = useRef({});
  function runAddressCheck(address) {
    const key = address.toLowerCase();
    const hit = addressCheckCache.current[key];
    if (hit && Date.now() - hit.at < 120000) return hit.promise;
    const promise = (async () => {
      const reasons = [];
      let unavailable = false;
      let badge = null; // what the explorer vouches for ("verified contract · USDT0")
      const lookalike = findLookalikeMatch(address, loadContacts(), wallet?.address);
      if (lookalike) {
        reasons.push(`This address is nearly identical to ${lookalike}, but is not the same address, a common address-poisoning scam.`);
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/address-check/${address}?network=${activeNetworkKey}`);
        const data = await response.json();
        if (data.suspicious && Array.isArray(data.reasons)) reasons.push(...data.reasons);
        badge = Array.isArray(data.badges) && data.badges.length ? data.badges.map(b => b.label).join(", ") : null;
      } catch (e) {
        console.error("On-chain address check unavailable, proceeding without it:", e);
        unavailable = true;
      }
      return { reasons, unavailable, badge };
    })();
    addressCheckCache.current[key] = { at: Date.now(), promise };
    return promise;
  }

  // While the AI reads the request, the wallet does its own real checks, one
  // phase at a time on the single activity line: balance, then the recipient.
  // Each phase stays on screen long enough to be read.
  async function activityPreflight(text, readingStarted, isAiDone, progressId) {
    const MIN_PHASE_MS = 700;
    const hold = async (since) => {
      const left = MIN_PHASE_MS - (Date.now() - since);
      if (left > 0) await activitySleep(left);
    };
    await hold(readingStarted);

    const address = text.match(/0x[a-fA-F0-9]{40}/)?.[0] || null;
    const moneyLike = !!address ||
      /\b(send|swap|bridge|stake|unstake|withdraw|deposit|pay|transfer|cash ?out|top ?up|bet)\b/i.test(text) ||
      parseAskLyra(text, { tokenSymbols: [activeNetwork.nativeSymbol, ...Object.keys(tokens)], contacts, networks: NETWORKS }).steps.length > 0;

    if (moneyLike && wallet?.address && !isAiDone()) {
      const since = Date.now();
      activityStep("Checking your balance");
      let detail = "";
      try {
        const live = await RPC.getBalance(wallet.address);
        detail = `${fmtXpl(live)} ${activeNetwork.nativeSymbol} available`;
      } catch (_) { /* the detail is optional */ }
      await hold(since);
      activityDone(detail);
    }

    if (address && !isAiDone()) {
      const since = Date.now();
      activityRef.current.preflightAddress = address.toLowerCase();
      const known = loadContacts().find(c => c.address.toLowerCase() === address.toLowerCase());
      if (known) {
        activityStep("Recognizing the recipient", known.name);
        await hold(since);
      } else {
        activityStep("Checking the address is safe");
        const r = await runAddressCheck(address);
        activityDone(r.reasons.length > 0 ? "needs your attention" : r.badge ? r.badge : r.unavailable ? "check unavailable" : "no warnings");
        await hold(since);
      }
    }

    await activityFollowServer(progressId, isAiDone);
  }

  // Replaces the running step (the "Thinking it through" placeholder) with a
  // real one, so the log doesn't show the placeholder as a finished step.
  function activityReplaceRunning(label, detail = "") {
    const id = activityRef.current.id;
    if (!id) return;
    patchRun(id, r => {
      const last = r.steps[r.steps.length - 1];
      if (last && last.state === "run" && last.placeholder) {
        return { ...r, steps: [...r.steps.slice(0, -1), { label, detail, state: "run" }] };
      }
      return { ...r, steps: [...r.steps.map(st => (st.state === "run" ? { ...st, state: "done" } : st)), { label, detail, state: "run" }] };
    });
  }

  // What the server is really doing while the AI request runs (understanding
  // the request, a quote for each step, a rate lookup...), read from
  // /api/ai/progress as it happens. An older server without that route keeps
  // the single "Thinking it through" line.
  async function activityFollowServer(progressId, isAiDone) {
    if (isAiDone()) return;
    const id = activityRef.current.id;
    if (id) {
      patchRun(id, r => ({
        ...r,
        steps: [...r.steps.map(st => (st.state === "run" ? { ...st, state: "done" } : st)), { label: "Thinking it through", detail: "", state: "run", placeholder: true }]
      }));
    }
    if (!progressId) return;
    let shown = 0;
    const pull = async () => {
      const r = await fetch(`${API_BASE_URL}/api/ai/progress/${progressId}`, { cache: "no-store" });
      if (!r.ok) return false;
      const { steps = [] } = await r.json();
      for (; shown < steps.length; shown++) activityReplaceRunning(steps[shown].label, steps[shown].detail);
      return true;
    };
    while (!isAiDone()) {
      try {
        if (!(await pull())) return; // no progress route on this server
      } catch { /* a missed poll is fine, the next one catches up */ }
      await activitySleep(600);
    }
    // the steps that happened between the last poll and the answer
    try { await pull(); } catch { /* optional */ }
  }

  async function askAI(text) {
  const uiModeCmd = parseUiModeCommand(text);
  if (uiModeCmd) {
    const label = uiModeCmd.toUpperCase();
    setMessages(m => [
      ...m,
      { role: "user", text },
      { role: "ai", text: uiModeCmd === uiMode ? `You're already in ${label}.` : `Switching to ${label}. You can change it any time in Settings → Interface.` }
    ]);
    changeUiMode(uiModeCmd);
    return;
  }
  const networkCmd = parseNetworkCommand(text);
  if (networkCmd) {
    const target = getNetworkByKey(networkCmd);
    setMessages(m => [
      ...m,
      { role: "user", text },
      { role: "ai", text: networkCmd === activeNetworkKey ? `You're already on ${target.name}.` : `Switched to ${target.name}.` }
    ]);
    switchNetwork(networkCmd);
    return;
  }
  try {
    setBusy(true);
    setStatus("Lyra redefine...");

    activityStart(messages.length);
    activityStep("Reading your request");
    const readingStarted = Date.now();

    setMessages(m => [
      ...m,
      { role: "user", text }
    ]);

    // The AI call starts at once; the wallet's own checks play out on the
    // activity line while it works.
    let aiDone = false;
    // lets the server report what it is doing, see activityFollowServer
    const progressId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let aiBody = null; // kept to ask again if Lyra plans only part of the request
    // the actions the sentence holds, read here word by word: when there are
    // several, Lyra is told up front so that none of them gets left out
    const localPlan = parseAskLyra(text, { tokenSymbols: [activeNetwork.nativeSymbol, ...Object.keys(tokens)], contacts, networks: NETWORKS }).steps;
    const describeStep = (st) => [st.kind, st.amount, st.asset, st.toAsset ? `to ${st.toAsset}` : "", st.recipient ? `to ${st.recipient}` : "", st.network ? `to ${st.network}` : ""].filter(Boolean).join(" ");
    const planHint = localPlan.length >= 2
      ? `\n\n(This request has ${localPlan.length} separate actions: ${localPlan.map(describeStep).join("; ")}. Plan ALL of them as one MULTI_ACTION, in this order. If a recipient or a detail is unknown, ask about it instead of leaving that action out.)`
      : "";
    const aiRequest = fetch(`${API_BASE_URL}/api/ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(aiBody = {
      message: text + planHint,
      walletAddress: wallet?.address || null,
      balance: fmtXpl(balance),
      // a finished plan's box goes back to Lyra as the request it was
      history: messages.flatMap(m => (m.role === "request"
        ? [
            { role: "user", text: m.text },
            { role: "ai", text: m.status === "done" ? "Done, it went through." : m.status === "cancelled" ? "The user cancelled this. Nothing was sent. Don't redo it unless asked again." : `It stopped${m.error ? ` (${m.error})` : ""}. Nothing more will be done for it unless the user asks again.` },
          ]
        : [m])),
      pendingTransaction,
      contacts: loadContacts(),
      // what the wallet holds right now on this network (updated as funds
      // arrive), so "send my 100 USDT to Brian" is read against the real balance
      holdings: [
        { symbol: activeNetwork.nativeSymbol, amount: ethers.formatEther(balance || 0n) },
        ...Object.keys(tokens).map(sym => ({
          symbol: sym,
          amount: ethers.formatUnits(tokenBalances[sym] || 0n, tokens[sym].decimals),
          ...(stakedBalances[sym] ? { staked: ethers.formatUnits(stakedBalances[sym], tokens[sym].decimals) } : {}),
        })),
      ],
      // spoken, not typed: tickers and names may be misheard
      voice: voiceRequestRef.current,
      network: activeNetworkKey,
      language: lyraLanguage,
      progressId
    })
    })
      .catch(() => {
        // fetch() itself failed: Lyra's server didn't answer at all.
        throw Object.assign(new Error("Failed to fetch"), { serverUnreachable: true });
      })
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .finally(() => { aiDone = true; });
    aiRequest.catch(() => { /* handled where it is awaited below */ });

    await activityPreflight(text, readingStarted, () => aiDone, progressId);

    let { ok: aiOk, data } = await aiRequest;

    if (!aiOk) {
      throw new Error(data.error || "AI error.");
    }

    // Never half a request: when the sentence holds several actions (read
    // here, word by word) but Lyra answers with a single one, ask once more
    // for the whole plan; if it still drops a part, nothing is prepared and
    // the user is told, instead of a ticket that silently skips an action.
    {
      const SINGLE = ["SEND_XPL", "SWAP_XPL", "BRIDGE_XPL", "STAKE_XPL", "UNSTAKE_XPL"];
      const local = localPlan;
      const describe = describeStep;
      if (local.length >= 2 && SINGLE.includes(data.intent)) {
        activityStep("Planning every step", `${local.length} actions`);
        const hint = `${text}${planHint} Your previous answer planned only one of them: plan them all.`;
        try {
          const again = await fetch(`${API_BASE_URL}/api/ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...aiBody, message: hint, progressId: undefined }),
          }).then(async (r) => ({ ok: r.ok, data: await r.json() }));
          if (again.ok) data = again.data;
        } catch { /* the check below decides */ }
        if (SINGLE.includes(data.intent)) {
          data = {
            intent: "CHAT",
            message: `I could only work out part of this (${local.length} actions: ${local.map(describe).join("; ")}), so I didn't prepare anything. Try again with each action spelled out, or send them one at a time.`,
          };
        }
      }
    }

    {
      // What was understood goes next to the first phase in the recap.
      const intentName = String(data.intent || "").replace(/_/g, " ").toLowerCase();
      const verb = intentName.split(" ")[0];
      const amountText = data.amount === "MAX" ? " max" : data.amount ? ` ${data.amount}` : "";
      const assetText = data.asset ? ` ${data.asset}` : (data.amount && /send/.test(verb) ? ` ${activeNetwork.nativeSymbol}` : "");
      activitySetDetail(
        0,
        /^(chat|ask crypto)$/.test(intentName) ? ""
          : data.amount ? `${verb}${amountText}${assetText}`
          : intentName
      );
      if (String(data.intent || "") === "CHAT") activityMarkPlain();
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

    // A request that opens the plan sheet doesn't also get a chat line
    // ("I'll send…, check the details, then hold the button"): the sheet says it all.
    const opensPlan =
      (data.intent === "MULTI_ACTION" && Array.isArray(data.steps) && data.steps.length > 0) ||
      (/^(SWAP|BRIDGE|STAKE|UNSTAKE)_XPL$/.test(String(data.intent)) && !!data.defiTicket &&
        !/(not specified|is required|required to complete|missing|unknown (token|network|chain))/i.test(`${data.defiTicket.riskReason || ""} ${data.defiTicket.summary || ""}`)) ||
      (data.intent === "SEND_XPL" && !!data.recipient && Number(data.amount) > 0);
    if (data.message && data.intent !== "GET_TRANSACTIONS" && !opensPlan) {
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

{
  const i = String(data.intent || "");
  // Send: the recipient check below adds its own closing step.
  const prep = /SEND/.test(i) ? null
    : /SWAP/.test(i) ? "Preparing the swap"
    : /BRIDGE/.test(i) ? "Preparing the bridge"
    : /STAKE|DEPOSIT/.test(i) ? "Preparing the deposit"
    : /RECEIVE|OFFRAMP|CONSOLIDATE/.test(i) ? "Getting things ready"
    : null;
  if (prep) activityStep(prep);
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
    const act = activityRef.current;
    act.askDone = true;
    // A recipient check may still be running (it isn't awaited by the
    // intent handler); it closes the log itself when it finishes.
    if (act.pending === 0) activityEnd(act.id);
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
  const act = activityRef.current;
  act.pending += 1;
  try {
  const key = address.toLowerCase();
  // True when Lyra already showed this check as its own phase while reading the request.
  const shown = act.preflightAddress === key;
  const currentContacts = loadContacts();

  const knownContact = currentContacts.find(c => c.address.toLowerCase() === key);
  if (knownContact) {
    if (!shown) activityStep("Recognizing the recipient", knownContact.name, "done");
    activityStep("Preparing the transaction");
    proceed();
    return;
  }

  if (!shown) activityStep("Checking the address is safe");
  const { reasons, unavailable, badge } = await runAddressCheck(address);
  if (!shown) activityDone(reasons.length > 0 ? "needs your attention" : badge ? badge : unavailable ? "check unavailable" : "no warnings");

  if (reasons.length > 0) {
    setAddressCheck({ address, reasons, proceed });
  } else {
    activityStep("Preparing the transaction");
    proceed();
  }
  } finally {
    act.pending -= 1;
    if (act.askDone && act.pending === 0) activityEnd(act.id);
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

      // Real provider: Onramper (aggregates 30+ onramps), see
      // tools/onramper.js on the server. It signs a widget link
      // server-side (the private key never reaches this client) that
      // opens Onramper's own hosted page — card/bank details are
      // typed there, never inside Lyra. Falls back to the old
      // demo-only simulation below if the server has no
      // ONRAMPER_API_KEY configured yet.
      let onramperUrl = null;
      let onramperConfigured = false;
      try {
        const onramperRes = await fetch(
          `${API_BASE_URL}/api/onramper/buy-url?address=${encodeURIComponent(wallet.address)}&amountUSD=${encodeURIComponent(amountUSD)}`
        );
        const onramperData = await onramperRes.json();
        onramperConfigured = !!onramperData.configured;
        onramperUrl = onramperData.url || null;
      } catch (e) {
        console.warn("Onramper buy-url fetch failed, falling back to demo:", e);
      }

      if (onramperConfigured && onramperUrl) {
        setDefiTicket({
          feature: "onramp-buy",
          intent: "RECEIVE_FIAT",
          executable: false,
          amountUSD,
          onramperUrl,
          platform: "Onramper (30+ onramps aggregated)",
          riskLevel: "low"
        });
        break;
      }

      // Demo fallback: no ONRAMPER_API_KEY set on this server yet.
      // This reference is a demo-only payment link, never fetched,
      // just encoded into the QR for the ticket to display.
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

    case "OFFRAMP_FUNDS": {
      if (!wallet?.address) {
        setMessages(m => [
          ...m,
          { role: "ai", text: "You need to create or import a wallet first." }
        ]);
        return;
      }

      const offrampAmountUSD = action.amountUSD || null;

      if (!offrampAmountUSD) {
        setMessages(m => [
          ...m,
          { role: "ai", text: action.message || "How much would you like to withdraw?" }
        ]);
        return;
      }

      pushActiveToCollapsedIfAny();

      // Real provider: Onramper's sell widget, same signed-link
      // pattern as RECEIVE_FIAT above (see tools/onramper.js). Unlike
      // the buy side, Lyra doesn't auto-sign the crypto-out leg yet:
      // Onramper's page shows the deposit address once payout is set
      // up, and the user sends to it with a normal Send afterwards —
      // the redirect payload Onramper would need to hand that address
      // straight to a ticket isn't in their public docs yet.
      let offrampUrl = null;
      let offrampConfigured = false;
      try {
        const offrampRes = await fetch(
          `${API_BASE_URL}/api/onramper/sell-url?address=${encodeURIComponent(wallet.address)}&amountUSD=${encodeURIComponent(offrampAmountUSD)}`
        );
        const offrampData = await offrampRes.json();
        offrampConfigured = !!offrampData.configured;
        offrampUrl = offrampData.url || null;
      } catch (e) {
        console.warn("Onramper sell-url fetch failed:", e);
      }

      setDefiTicket({
        feature: "offramp-sell",
        intent: "OFFRAMP_FUNDS",
        executable: false,
        amountUSD: offrampAmountUSD,
        onramperUrl: offrampUrl,
        configured: offrampConfigured,
        platform: "Onramper (30+ offramps aggregated)",
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
            // leave room for Lyra's 0.25% on top of the amount
            const room = isFeeExempt(wallet.address, recipient) ? raw : splitOnTop(raw).amount;
            setSendAmount(ethers.formatUnits(room, resolvedToken.decimals));
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

      // A ticket that says it is missing something (e.g. "Destination chain not
      // specified") is not a ticket: ask for the missing part instead, and
      // prepare it once the answer arrives.
      if (action.defiTicket && /(not specified|is required|required to complete|missing|unknown (token|network|chain))/i.test(`${action.defiTicket.riskReason || ""} ${action.defiTicket.summary || ""}`)) {
        setMessages(m => [...m, { role: "ai", text: action.message || "I need a bit more information before I can prepare this. What is missing?" }]);
        break;
      }

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

  // a contact saved from Ask Lyra (the "Save as" chip, or the address Lyra
  // asked for): when a request was waiting for it, it runs now
  function saveContactFromChat(name, address) {
    const clean = ethers.getAddress(address.trim());
    addContact(name, clean);
    setContacts(loadContacts());
    const waiting = pendingContact && pendingContact.name.toLowerCase() === name.toLowerCase() ? pendingContact : null;
    setMessages(m => [...m, { role: "ai", text: `Saved ${name} as a contact (${clean.slice(0, 6)}…${clean.slice(-4)}).${waiting ? " Preparing your request now." : ""}` }]);
    if (waiting) {
      setPendingContact(null);
      // the latest handleIntent (this one sees the state from before the save)
      setTimeout(() => handleIntentRef.current?.(waiting.text), 60);
    }
  }

  handleIntentRef.current = handleIntent;
  async function handleIntent(text) {
  if (!text.trim()) return;
  // the address Lyra asked for, pasted on its own: save it, then go on
  if (pendingContact && /^\s*0x[0-9a-fA-F]{40}\s*$/.test(text)) {
    setMessages(m => [...m, { role: "user", text: text.trim() }]);
    saveContactFromChat(pendingContact.name, text);
    return;
  }
  try {
    const box = document.querySelector(".frame .ask-box");
    const frameEl = box?.closest(".frame");
    const input = box?.querySelector(".ask-input");
    if (box && frameEl) {
      const f = frameEl.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const k = frameEl.offsetWidth / (f.width || 1); // 3D view: screen -> wallet pixels
      const t = input?.getBoundingClientRect();
      const inputStyle = input ? getComputedStyle(input) : null;
      askOriginRef.current = {
        at: Date.now(),
        clip: [b.top - f.top, f.right - b.right, f.bottom - b.bottom, b.left - f.left].map(v => Math.max(0, Math.round(v * k))),
        radius: getComputedStyle(box).borderTopLeftRadius || "18px",
        frameRadius: getComputedStyle(frameEl).borderTopLeftRadius || "0px",
        text: t ? { x: t.left + (parseFloat(inputStyle.paddingLeft) || 0) / k, y: t.top + (parseFloat(inputStyle.paddingTop) || 0) / k } : null,
        fontScale: inputStyle ? (parseFloat(inputStyle.fontSize) || 15) / 13.5 : 1,
        width: frameEl.offsetWidth,
        height: frameEl.offsetHeight,
      };
    }
  } catch { askOriginRef.current = null; }

  const savedContacts = loadContacts(); // fresh: a contact may have just been added
  const { steps } = parseAskLyra(text, {
    tokenSymbols: [activeNetwork.nativeSymbol, ...Object.keys(tokens)],
    contacts: savedContacts,
    networks: NETWORKS,
  });
  // Sending to a name that isn't a contact ("to mom", "to P1"): nothing is
  // prepared; Lyra asks for the address, saves the contact, then runs this again.
  {
    const unknown = steps.find(st => st.kind === "send" && st.recipient && !ethers.isAddress(st.recipient)
      && !/\./.test(st.recipient) // name services (alice.eth) are resolved elsewhere
      && !savedContacts.some(c => c.name.toLowerCase() === st.recipient.toLowerCase()));
    if (unknown) {
      const name = unknown.recipient;
      setPendingContact({ name, text: text.trim() });
      setMessages(m => [...m,
        { role: "user", text: text.trim() },
        { role: "ai", text: `I don't know "${name}" yet, so I haven't prepared anything. Paste ${name}'s address in Ask Lyra: I'll save ${name} as a contact and send to that address.` },
      ]);
      return;
    }
  }
  setPendingContact(null);
  setPlanBanner(null);
  setPendingPlan(steps.length ? { steps } : null);
  setPlanScene(steps.length >= 2 && plan3dEnabled() ? { id: Date.now() } : null);
  setPlanSceneSettled(false);
  setPlanRequest(text.trim());
  planStartedAtRef.current = Date.now();
  planMsgStartRef.current = messages.length;
  try {
    await askAI(text.trim());
  } finally {
    setPendingPlan(null);
  }
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

  useEffect(() => {
    if (uiMode !== "3d" || tourOpen || hasSeenTour()) return;
    if (!wallet || locked || showUnlock || showInterfaceChoice || showWallet || showPasswordSetup) return;
    const t = setTimeout(() => setTourOpen(true), 700);
    return () => clearTimeout(t);
  }, [uiMode, tourOpen, wallet, locked, showUnlock, showInterfaceChoice, showWallet, showPasswordSetup]);

  // Leaving 3D mid-tour just ends it.
  useEffect(() => {
    if (uiMode !== "3d" && tourOpen) finishTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiMode]);

  const walletHasFunds =
    (balance || 0n) > 0n ||
    Object.keys(tokens).some(sym => (tokenBalances[sym] || 0n) > 0n || (stakedBalances[sym] || 0n) > 0n);
  const showBackupNudge =
    !!wallet?.address && backupPendingFor === wallet.address.toLowerCase() && walletHasFunds;
  const showAddFunds = !!wallet?.address && balanceReady && !walletHasFunds;

  function openBackupFromNudge() {
    setExportSeedPassword("");
    setExportedSeed(null);
    setExportSeedError("");
    setRevealExportedSeed(false);
    setShowExportSeed(true);
  }

  function closeTxDetail() {
    setTxHistoryTab(null);
    if (txHistoryDirect) {
      setShowTxHistory(false);
      setTxHistoryDirect(false);
    }
  }

  // ---- 3D interface wiring: side menus drive the SAME modals the 2D
  // header menu opens, the top menu shows the real balances. ----
  function openTxCategory(tab) {
    setTxHistoryDirect(true);
    openTxHistory();
    setTxHistoryTab(tab);
  }

  const leftMenu3d = [
    { label: "Contacts", icon: <UserRound size={17} strokeWidth={1.8} />, onClick: () => { setContacts(loadContacts()); setShowContacts(true); } },
    { label: activeNetwork.name, icon: <Link size={17} strokeWidth={1.8} />, onClick: () => setShowNetworkMenu(true) },
    { label: "Chart", icon: <LineChart size={17} strokeWidth={1.8} />, onClick: () => setShowChart3d(true) },
    { label: "Help", icon: <HelpCircle size={17} strokeWidth={1.8} />, onClick: () => setShowHelp(true) },
    { label: "Settings", icon: <Settings size={17} strokeWidth={1.8} />, onClick: () => setShowSettings(true) },
    { label: "Rewards", icon: <Gift size={17} strokeWidth={1.8} />, onClick: () => setShowRewards(true) },
  ];

  const rightMenu3d = [
    { label: "Send", icon: <ArrowUpFromDot size={17} strokeWidth={1.8} style={{ transform: "rotate(45deg)" }} />, onClick: () => openTxCategory("sent") },
    { label: "Receive", icon: <ArrowDownToDot size={17} strokeWidth={1.8} style={{ transform: "rotate(45deg)" }} />, onClick: () => openTxCategory("received") },
    { label: "Swap", icon: <ArrowLeftRight size={17} strokeWidth={1.8} />, onClick: () => openTxCategory("swap") },
    { label: "Bridge", icon: <MoveHorizontal size={17} strokeWidth={1.8} />, onClick: () => openTxCategory("bridge") },
    { label: "Stake", icon: <Vault size={17} strokeWidth={1.8} />, onClick: () => openTxCategory("stake") },
  ];

  const assets3d = [
    {
      symbol: activeNetwork.nativeSymbol,
      name: activeNetwork.name,
      color: activeNetwork.color || "#A78BFA",
      balance: Number(ethers.formatEther(balance || 0n)),
      usdPrice: xplPriceUSD || 0,
    },
    ...Object.entries(tokens)
      .map(([symbol, token]) => ({
        symbol,
        name: token.name || symbol,
        color: token.color || "#999999",
        balance:
          Number(ethers.formatUnits(tokenBalances[symbol] || 0n, token.decimals)) +
          Number(ethers.formatUnits(stakedBalances[symbol] || 0n, token.decimals)),
        usdPrice: 1,
      }))
      .filter(a => a.balance > 0),
  ];

  const anyOverlayOpen =
    showSettings || showContacts || showNetworkMenu || showChart3d || showHelp || showRewards || showReceiveQr || showTxHistory || showUnlock || showWallet || showWelcome ||
    showPasswordSetup || showSend || !!defiTicket || !!multiTicket;

  // ---- Plan card (send / swap / bridge / stake / multi-step) ----
  const planEligible = !!(showSend || multiTicket || (defiTicket && ["swap", "bridge", "staking"].includes(defiTicket.feature)));

  function networkLabel(key) {
    return NETWORKS.find(x => x.key === key)?.name || key || "another network";
  }
  function personLabel(address, name) {
    if (name) return name;
    const c = contacts.find(x => x.address?.toLowerCase() === String(address || "").toLowerCase());
    return c?.name || shortAddress(address || "");
  }
  function heldAmount(symbol) {
    if (!symbol) return null;
    if (symbol === activeNetwork.nativeSymbol) return Number(ethers.formatEther(balance || 0n));
    const t = tokens[symbol];
    return t ? Number(ethers.formatUnits(tokenBalances[symbol] || 0n, t.decimals)) : null;
  }
  const fmtAmt = x => Number(x).toLocaleString("en-US", { maximumFractionDigits: 4 });

  // One row per step, from a send / defi ticket / multi-step plan.
  // The protocol that really holds or moves the funds for a step: the same
  // choice the executors make (executeSwapTicketCore, executeBridgeTicketCore,
  // executeStakeTicketCore, executeUnstakeTicket), not the AI's guess.
  function protocolFor(kind, { asset, network } = {}) {
    if (kind === "swap") return activeNetworkKey === "arc" ? "Circle Swap Kit" : IS_TESTNET ? null : "KyberSwap";
    if (kind === "bridge") return IS_TESTNET || activeNetworkKey === "arc" || network === "arc" ? "Circle CCTP" : "LI.FI";
    if (kind === "stake" || kind === "unstake") return aaveV4Reserve(asset) ? "Aave V4" : "Aave V3";
    return null;
  }
  function protocolLabel(kind, row) {
    return protocolFor(kind, row);
  }

  function planStepFrom(kind, { amount, asset, estimate, toAsset, receive, recipient, contactName, network, platform, sub }) {
    const from = amount ? `${estimate ? "≈ " : ""}${fmtAmt(amount)} ${asset || ""}`.trim() : asset || null;
    const via = protocolLabel(kind, { asset, network });
    if (kind === "send") return { kind, label: "Send", sub, from, to: recipient || contactName ? personLabel(recipient, contactName) : null, avatar: true };
    // always two amounts: the quote when it is one ("≈ 0.086 EURC"); for
    // Circle's kit on Arc (it answers "Live quote at swap confirmation") the
    // kit's own estimate, fetched below, "… EURC" until it arrives
    if (kind === "swap") {
      const quoted = receive && /\d/.test(String(receive)) ? receive : null;
      const est = swapEstimates[`${asset}>${toAsset}:${amount}`];
      const to = quoted || (toAsset ? (est ? `≈ ${fmtAmt(est)} ${toAsset}` : `… ${toAsset}`) : null);
      return { kind, label: "Swap", sub, via, from, to };
    }
    if (kind === "bridge") return { kind, label: "Bridge", sub, via, from, to: network ? networkLabel(network) : null };
    if (kind === "unstake") return { kind, label: "Withdraw", sub, via, from, to: "Wallet" };
    if (kind === "stake") return { kind, label: "Stake", sub, via, from, to: "Staking" };
    return { kind, label: kind, sub, from, to: null };
  }

  function buildPlanAfter(rows) {
    const after = [];
    const spent = {};
    let exact = true;
    for (const r of rows) {
      const amt = Number(r.amount);
      if (["send", "swap", "bridge", "stake"].includes(r.kind) && r.asset) {
        if (!Number.isFinite(amt) || r.estimate) exact = false;
        else spent[r.asset] = (spent[r.asset] || 0) + amt;
      }
      if (r.kind === "send" && r.amount) after.push({ label: `${personLabel(r.recipient, r.contactName)} gets`, value: `${r.estimate ? "≈ " : ""}${fmtAmt(r.amount)} ${r.asset}` });
      if (r.kind === "stake" && r.amount) after.push({ label: `Staked on ${protocolFor("stake", r)}`, value: `+ ${r.estimate ? "≈ " : ""}${fmtAmt(r.amount)} ${r.asset}` });
      if (r.kind === "unstake" && r.amount) after.push({ label: "Back in your wallet", value: `+ ${fmtAmt(r.amount)} ${r.asset}` });
      if (r.kind === "swap" && r.receive) after.push({ label: "You get", value: `≈ ${r.receive}` });
      if (r.kind === "bridge" && r.amount) after.push({ label: `On ${networkLabel(r.network)}`, value: `+ ${r.estimate ? "≈ " : ""}${fmtAmt(r.amount)} ${r.asset}` });
    }
    // the main asset's balance, before -> after, only when every amount is exact
    const main = Object.keys(spent)[0];
    const held = heldAmount(main);
    if (exact && main && held !== null && held >= spent[main]) {
      after.unshift({ label: `Your ${main}`, before: fmtAmt(held), value: fmtAmt(Math.max(0, held - spent[main])) });
    }
    return after;
  }

  // All or nothing: the first step of a plan that this wallet can't run on this
  // network, checked BEFORE anything is signed (a plan must never stop halfway
  // with only its first steps sent). Same rules as the executors below.
  function planBlocker(steps) {
    const net = activeNetwork.name;
    for (let i = 0; i < (steps || []).length; i++) {
      const st = steps[i];
      const n = steps.length > 1 ? `Step ${i + 1} (${st.kind}): ` : "";
      const asset = st.asset;
      const isNative = asset === activeNetwork.nativeSymbol;
      const known = isNative || !!tokens[asset]?.address;
      if (st.ticket && (st.ticket.dataFound === false || st.ticket.executable === false)) {
        return `${n}${st.ticket.summary || st.ticket.riskReason || "Lyra can't run this step here yet."}`;
      }
      if (st.kind === "send") {
        if (!st.recipient || !ethers.isAddress(st.recipient)) {
          return st.contactName && !st.recipient
            ? `${n}"${st.contactName}" isn't in your contacts: add them, or use their address.`
            : `${n}the recipient isn't a valid address.`;
        }
        if (!known) return `${n}${asset} isn't supported on ${net}.`;
      } else if (st.kind === "swap") {
        if (activeNetworkKey === "arc") {
          if (!ARC_SWAP_TOKENS.includes(asset) || !ARC_SWAP_TOKENS.includes(st.tokenOutSymbol)) return `${n}only USDC and EURC can be swapped on Arc.`;
        } else if (IS_TESTNET) {
          return `${n}swaps aren't available on ${net} yet.`;
        } else if (!known) return `${n}${asset} isn't supported for swaps on ${net}.`;
      } else if (st.kind === "stake" || st.kind === "unstake") {
        const v4 = aaveV4Reserve(asset);
        if (!v4 && !(tokens[asset]?.address && defi.aave?.pool)) return `${n}staking ${asset} isn't available on ${net} yet.`;
      } else if (st.kind === "bridge") {
        if (IS_TESTNET || activeNetworkKey === "arc" || st.destinationChainKey === "arc") {
          const sym = isNative ? "USDC" : asset;
          if (sym !== "USDC" && sym !== "EURC") return `${n}only USDC and EURC can be bridged ${IS_TESTNET ? "on testnet" : "to/from Arc"}.`;
          const toKey = LIFI_KEY_TO_NETWORK_KEY[String(st.destinationChainKey || "").toLowerCase()] || String(st.destinationChainKey || "").toLowerCase();
          if (!NETWORK_KEY_TO_CIRCLE_CHAIN[activeNetworkKey] || !NETWORK_KEY_TO_CIRCLE_CHAIN[toKey]) return `${n}that bridge route isn't supported yet.`;
        } else if (!known || !defi.lifi?.diamond) return `${n}bridging ${asset} isn't available on ${net} yet.`;
      }
    }
    return null;
  }

  // "You have 0 USDC, this needs 1 USDC", only when the amounts are exact
  // (in the plan's order: what a swap or a withdrawal earlier in the plan
  // brings counts for the steps after it)
  function planShortfall(rows) {
    const spent = {};
    const made = {}; // what earlier steps of the plan add (a swap: its quote, 1% under)
    for (const r of rows) {
      const amt = Number(r.amount);
      if (["send", "swap", "bridge", "stake"].includes(r.kind) && r.asset) {
        if (!Number.isFinite(amt) || r.estimate) return null;
        spent[r.asset] = (spent[r.asset] || 0) + amt;
        const held = heldAmount(r.asset);
        const coming = made[r.asset] || 0;
        if (held !== null && held + coming + 1e-9 < spent[r.asset]) {
          return `You have ${fmtAmt(held)} ${r.asset}${coming ? ` (+ ≈${fmtAmt(coming)} from this plan)` : ""}, this needs ${fmtAmt(spent[r.asset])} ${r.asset}. Add funds first, or lower the amount.`;
        }
      }
      if (r.kind === "swap" && r.toAsset) {
        const out = Number(String(r.receive || "").replace(/[^d.]/g, ""));
        if (!(out > 0)) return null; // no quote yet: nothing to judge
        made[r.toAsset] = (made[r.toAsset] || 0) + out * 0.99;
      } else if (r.kind === "unstake" && r.asset && amt > 0) {
        made[r.asset] = (made[r.asset] || 0) + amt;
      }
    }
    return null;
  }

  // Estimates for swaps without a quote (Circle's Swap Kit on Arc), from the kit itself
  const [swapEstimates, setSwapEstimates] = useState({});
  const swapEstimatesAsked = useRef(new Set());
  // Last resort when a protocol gives no quote: USD prices (stablecoins at $1,
  // the network coin at its live price), so a step never shows "…"
  function priceEstimate(asset, toAsset, amount) {
    const STABLES = ["USDC", "USDC.e", "USDT", "USDT0", "DAI"];
    const usd = (sym) => (sym === activeNetwork.nativeSymbol ? xplPriceUSD || null : STABLES.includes(sym) ? 1 : null);
    const a = usd(asset), b = usd(toAsset);
    return a && b ? (Number(amount) * a) / b : null;
  }
  async function estimateArcSwap(asset, toAsset, amount) {
    const key = `${asset}>${toAsset}:${amount}`;
    if (swapEstimatesAsked.current.has(key)) return;
    swapEstimatesAsked.current.add(key);
    const fallback = () => {
      const p = priceEstimate(asset, toAsset, amount);
      if (p > 0) setSwapEstimates(m => (m[key] ? m : { ...m, [key]: p }));
    };
    // KyberSwap networks: the same route the swap will use, read ahead
    if (activeNetworkKey !== "arc") {
      try {
        const native = activeNetwork.nativeSymbol;
        const tIn = asset === native ? { address: NATIVE_PSEUDO_ADDRESS, decimals: 18 } : tokens[asset];
        const tOut = toAsset === native ? { address: NATIVE_PSEUDO_ADDRESS, decimals: 18 } : tokens[toAsset];
        if (!tIn?.address || !tOut?.address || !activeNetwork.kyberSlug) { fallback(); return; }
        const url = new URL(`${KYBERSWAP_API_BASE(activeNetwork.kyberSlug)}/routes`);
        url.searchParams.set("tokenIn", tIn.address);
        url.searchParams.set("tokenOut", tOut.address);
        url.searchParams.set("amountIn", ethers.parseUnits(Number(amount).toFixed(Math.min(tIn.decimals, 8)), tIn.decimals).toString());
        const route = await (await fetch(url, { headers: { "X-Client-Id": KYBERSWAP_CLIENT_ID } })).json();
        const out = route?.data?.routeSummary?.amountOut;
        if (out) setSwapEstimates(m => ({ ...m, [key]: Number(ethers.formatUnits(out, tOut.decimals)) }));
        else fallback();
      } catch (e) {
        console.error("Swap estimate unavailable:", e);
        fallback();
      }
      return;
    }
    try {
      // only a quote: any key will do, nothing is signed
      const adapter = createEthersAdapterFromPrivateKey({ privateKey: unlockedPrivateKey || ethers.Wallet.createRandom().privateKey });
      const q = await new SwapKit().estimate({
        from: { adapter, chain: NETWORK_KEY_TO_CIRCLE_CHAIN.arc },
        tokenIn: asset,
        tokenOut: toAsset,
        amountIn: String(amount),
        config: { slippageBps: Math.round(DEFAULT_SLIPPAGE * 10000) },
      });
      const out = Number(q?.estimatedOutput?.amount);
      if (out > 0) setSwapEstimates(m => ({ ...m, [key]: out }));
      else fallback();
    } catch (e) {
      console.error("Swap estimate unavailable:", e);
      fallback();
    }
  }

  const planRows = (() => {
    if (multiTicket) {
      // what the previous step hands over: a swap's quote or estimate, a withdrawal's amount
      let handed = null;
      return multiTicket.steps.map((st, i) => {
        let amount = st.amount;
        if (st.amountIsEstimate && handed && handed.symbol === st.asset && handed.amount > 0 && !(Number(amount) > 0)) {
          amount = String(Number(handed.amount.toFixed(6)));
        }
        if (st.kind === "swap") {
          const quoted = Number(String(st.ticket?.estimatedReceive || "").replace(/[^d.]/g, ""));
          const est = swapEstimates[`${st.asset}>${st.tokenOutSymbol}:${amount}`];
          handed = { symbol: st.tokenOutSymbol, amount: quoted > 0 ? quoted : est || 0 };
        } else if (st.kind === "unstake") {
          handed = { symbol: st.asset, amount: Number(st.amount) || 0 };
        } else {
          handed = null;
        }
        return {
        kind: st.kind === "predict" ? "send" : st.kind,
        amount, asset: st.asset, estimate: !!st.amountIsEstimate,
        toAsset: st.tokenOutSymbol, receive: st.ticket?.estimatedReceive,
        recipient: st.recipient, contactName: st.contactName,
        network: st.destinationChainKey, platform: st.ticket?.platform,
        sub: st.amountIsEstimate && i > 0 ? "From the previous step" : st.auto ? "Required" : null,
        fees: st.ticket?.fees,
        };
      });
    }
    if (defiTicket && planEligible) {
      const kind = defiTicket.feature === "swap" ? "swap"
        : defiTicket.feature === "bridge" ? "bridge"
        : defiTicket.intent === "UNSTAKE_XPL" ? "unstake" : "stake";
      return [{
        kind, amount: defiTicket.amount, asset: defiTicket.asset || activeNetwork.nativeSymbol,
        toAsset: defiTicket.tokenOutSymbol, receive: defiTicket.estimatedReceive,
        network: defiTicket.destinationChainKey, platform: defiTicket.platform,
        sub: kind === "swap" ? defiTicket.rate : null, fees: defiTicket.fees,
      }];
    }
    if (showSend) {
      return [{ kind: "send", amount: sendAmount, asset: sendAssetSymbol, recipient: sendTo, contactName: suggestedContact?.name }];
    }
    return null;
  })();

  // The steps as the executors see them, for the simulation
  const planSimSteps = multiTicket ? multiTicket.steps
    : defiTicket && planEligible ? [{
        kind: defiTicket.feature === "swap" ? "swap" : defiTicket.feature === "bridge" ? "bridge" : defiTicket.intent === "UNSTAKE_XPL" ? "unstake" : "stake",
        amount: defiTicket.amount, asset: defiTicket.asset || activeNetwork.nativeSymbol,
        tokenOutSymbol: defiTicket.tokenOutSymbol, destinationChainKey: defiTicket.destinationChainKey, ticket: defiTicket,
      }]
    : showSend ? [{ kind: "send", amount: sendAmount, asset: sendAssetSymbol, recipient: sendTo }]
    : null;
  const planSimKey = planSimSteps && !busy && executionSteps.length === 0 && !planError && wallet?.address
    ? JSON.stringify([activeNetworkKey, wallet.address, planSimSteps.map(s => [s.kind, s.amount, s.asset, s.recipient, s.tokenOutSymbol, s.destinationChainKey, !!s.amountIsEstimate])])
    : null;
  useEffect(() => {
    if (!planSimKey) { setPlanSim(null); return; }
    let cancelled = false;
    setPlanSim({ state: "loading" });
    const t = setTimeout(async () => {
      try {
        const { calls, skipped } = await buildPlanCalls(planSimSteps, {
          from: wallet.address, network: activeNetwork, networkKey: activeNetworkKey, isTestnet: IS_TESTNET,
          tokens, defi, nativeSymbol: activeNetwork.nativeSymbol, nativePseudo: NATIVE_PSEUDO_ADDRESS,
          slippage: DEFAULT_SLIPPAGE, kyberBase: KYBERSWAP_API_BASE, kyberClientId: KYBERSWAP_CLIENT_ID,
          lifiQuoteUrl: LIFI_QUOTE_API_URL, aaveV4Reserve,
          circleChain: NETWORK_KEY_TO_CIRCLE_CHAIN[activeNetworkKey],
          networkKeyOfLifi: (code) => Object.keys(NETWORK_KEY_TO_LIFI_KEY).find(k => NETWORK_KEY_TO_LIFI_KEY[k] === code),
          suppliedV4: (v4) => new ethers.Contract(defi.aaveV4.spoke, AAVE_V4_SPOKE_ABI, RPC).getUserSuppliedAssets(v4.id, wallet.address),
        });
        if (!calls.length) { if (!cancelled) setPlanSim({ state: "off", reason: "skipped" }); return; }
        const r = await fetch(`${API_BASE_URL}/api/simulate/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ network: activeNetworkKey, from: wallet.address, calls }),
        });
        const sim = await r.json();
        if (cancelled) return;
        if (!r.ok || !sim.available) { setPlanSim({ state: "off", reason: sim.reason || sim.error }); return; }
        if (sim.reverted) { setPlanSim({ state: "fail", step: sim.step, error: sim.error, multi: planSimSteps.length > 1 }); return; }
        // receipt tokens (aUSDT0...) read as "staked USDT0"
        const known = [activeNetwork.nativeSymbol, ...Object.keys(tokens)];
        const rows = [];
        for (const c of sim.changes || []) {
          const sym = c.symbol || "?";
          const base = /^a[A-Z]/.test(sym) ? known.find(k => sym.endsWith(k)) : null;
          const amount = Number(c.amount).toLocaleString("en-US", { maximumFractionDigits: 6 });
          if (base) {
            // the receipt minted also counts interest already earned: show what the plan stakes
            const stakes = planSimSteps.filter(st => st.kind === "stake" && st.asset === base);
            const exact = stakes.length > 0 && stakes.every(st => !st.amountIsEstimate && Number(st.amount) > 0);
            const staked = exact ? stakes.reduce((sum, st) => sum + Number(st.amount), 0).toLocaleString("en-US", { maximumFractionDigits: 6 }) : `≈ ${amount}`;
            if (c.direction === "in") rows.push({ kind: "stake", text: `${staked} ${base} staked` });
            continue;
          }
          rows.push({ kind: c.direction, text: `${c.direction === "in" ? "+" : "−"} ${amount} ${sym}` });
        }
        rows.sort((a, b) => ({ out: 0, in: 1, stake: 2 }[a.kind] - { out: 0, in: 1, stake: 2 }[b.kind]));
        setPlanSim({
          state: "ok",
          rows,
          fee: sim.fee ? `${Number(sim.fee).toLocaleString("en-US", { maximumSignificantDigits: 2 })} ${sim.feeSymbol}` : null,
          skipped: skipped.map(i => planStepFrom(planSimSteps[i].kind, {}).label),
        });
      } catch (e) {
        if (!cancelled) setPlanSim({ state: "off", reason: e.message });
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSimKey]);

  useEffect(() => {
    if (!showSettings || !wallet?.address) return;
    let alive = true;
    setDelegationState(null);
    delegationOf(RPC, wallet.address)
      .then(status => { if (alive) setDelegationState({ status }); })
      .catch(() => { if (alive) setDelegationState({ status: "error" }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings, wallet?.address, activeNetworkKey]);

  // A plan signed with the wallet's own key runs as ONE transaction (an
  // EIP-7702 batch, the same delegate as Ledger plans): all or nothing. Routes,
  // quotes, nonce and gas are read while the plan is on screen (again every
  // 20 s), so confirming only signs and broadcasts. Step by step instead when
  // the network has no delegate, a step can't be built ahead (a Polymarket
  // bet, a step after a bridge), or something fails before broadcasting.
  const preparedPlanRef = useRef(null);
  // "Intention vs reality" (src/intentGuard.js): what the batch really does,
  // checked against the plan's steps, while the plan is on screen and again
  // right before signing. A failed check blocks the signature, no way around it.
  const [planGuard, setPlanGuard] = useState(null); // { key, ok, problems }
  const guardLang = () => (lyraLanguage === "fr" || (lyraLanguage === "auto" && /^fr/i.test(navigator.language || "")) ? "fr" : "en");
  const guardCtx = (from) => ({ from, nativeSymbol: activeNetwork.nativeSymbol, tokens, defi, treasury: LYRA_TREASURY, delegator: BATCH_DELEGATOR, feeBps: 25, slippage: DEFAULT_SLIPPAGE });
  async function guardBatch(steps, calls, from, delegated) {
    return verifyBatch({ provider: RPC, steps, calls, data: encodeBatch(calls), ctx: guardCtx(from), authorization: delegated ? null : BATCH_DELEGATOR, lang: guardLang() });
  }
  async function prepareOwnPlan(steps) {
    const unsupported = { unsupported: true, at: Date.now() };
    if (!oneTxPlans || !unlockedPrivateKey || !steps?.length) return unsupported;
    if (steps.some((st, i) => st.kind === "predict" || (st.kind === "bridge" && i < steps.length - 1))) return unsupported;
    if (!(await batchSupported(RPC))) return unsupported;
    const from = new ethers.Wallet(unlockedPrivateKey).address;
    const { calls, skipped } = await buildPlanBatch(steps, from);
    if (skipped.length || !calls.length) return unsupported;
    const prepared = await prepareOwnBatch({ provider: RPC, address: from, calls });
    // delegated to another wallet's contract: step by step, that delegation is left alone
    if (prepared.foreign) return unsupported;
    prepared.guard = await guardBatch(steps, calls, from, prepared.delegated);
    return prepared;
  }
  const ownBatchKey = oneTxPlans && multiTicket && !ledgerActive && unlockedPrivateKey && planSimKey ? planSimKey : null;
  useEffect(() => {
    if (!ownBatchKey) return;
    let alive = true;
    const steps = multiTicket.steps;
    const run = () => prepareOwnPlan(steps)
      .then(p => {
        if (!alive) return;
        preparedPlanRef.current = { ...p, key: ownBatchKey };
        if (p.guard) setPlanGuard({ key: ownBatchKey, ok: p.guard.ok, problems: p.guard.problems });
      })
      .catch(e => { if (alive) preparedPlanRef.current = { key: ownBatchKey, error: e, at: Date.now() }; });
    run();
    const every = setInterval(run, 20000);
    return () => { alive = false; clearInterval(every); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownBatchKey]);

  // true when the plan was run here (or failed after leaving the wallet)
  async function runOwnBatch() {
    const steps = multiTicket.steps;
    const wouldFail = (e) => ["CALL_EXCEPTION", "INSUFFICIENT_FUNDS"].includes(e?.code);
    const failMessage = (e) => (e?.code === "INSUFFICIENT_FUNDS"
      ? "Nothing was sent. Not enough funds for this plan, including the network fee."
      : "Nothing was sent. This plan would fail on-chain right now (a balance, an allowance or a quote that moved). Try again in a moment.");
    let p = preparedPlanRef.current;
    preparedPlanRef.current = null; // one use
    if (!p || p.key !== planSimKey || p.error || Date.now() - p.at > 30000) {
      try {
        p = await prepareOwnPlan(steps);
      } catch (e) {
        if (wouldFail(e)) throw new Error(failMessage(e));
        console.warn("Plan not prepared in one transaction, step by step instead:", e);
        return false;
      }
    }
    if (p.unsupported) return false;
    if (!p.guard?.ok) {
      const g = p.guard || { problems: ["The plan couldn't be checked before signing."] };
      setPlanGuard({ key: planSimKey, ok: false, problems: g.problems });
      throw new Error(`Nothing was sent. ${g.problems[0]}`);
    }

    setBusy(true);
    setExecutionLabel("Plan");
    setExecutionSteps(["Sign the plan", "Confirm on-chain"]);
    setExecutionStepIndex(-1);
    setPlanStepIndex(0);
    beginExecutionTimer();
    const signer = new ethers.Wallet(unlockedPrivateKey, RPC);
    let tx;
    try {
      try {
        tx = await sendOwnBatch({ wallet: signer, prepared: p });
      } catch (e) {
        if (!/nonce/i.test(`${e?.code} ${e?.shortMessage || e?.message}`)) throw e;
        // something else left this address meanwhile: read again, once
        tx = await sendOwnBatch({ wallet: signer, prepared: await prepareOwnPlan(steps) });
      }
    } catch (e) {
      // nothing left the wallet
      if (wouldFail(e)) { await finishExecution(); throw new Error(failMessage(e)); }
      console.warn("Plan not sent in one transaction, step by step instead:", e);
      resetExecutionProgress();
      return false;
    }
    try {
      advanceExecutionTo(0);
      setTxHash(tx.hash);
      setStepTxHashes(steps.map(() => tx.hash));
      setStatus("Confirming…");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("The plan was rejected on-chain. Nothing moved.");
      // without the delegation in place the transaction runs nothing: never call that "done"
      if (!(await isDelegated(RPC, signer.address))) {
        throw new Error("The plan didn't run: the one-transaction setup didn't take on this network. Nothing moved. Try again, or turn off One-transaction plans in Settings.");
      }
      setPlanStepIndex(steps.length);
      advanceExecutionTo(1);
      setMessages(m => [...m, { role: "ai", text: `✅ ${steps.length > 1 ? `All ${steps.length} steps` : "Done"} on ${activeNetwork.name}, in one transaction.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);
      refreshBalance(signer.address);
      refreshTokenBalances(signer.address);
      // the last check is seen for a moment, then the recap
      await new Promise(resolve => setTimeout(resolve, DONE_TRANSITION_BEAT_MS));
      advanceExecutionTo(2);
      setStepSweepActive(true);
      setTimeout(() => setStepSweepActive(false), 2400);
      setMultiTicketDone(true);
      return true;
    } finally {
      await finishExecution();
    }
  }

  useEffect(() => {
    // the plan's rows, or while Lyra reads the request, the steps read from the sentence
    const rows = planRows || (pendingPlan?.steps || []).map(st => ({ kind: st.kind, asset: st.asset, toAsset: st.toAsset, amount: /^d/.test(st.amount || "") ? st.amount : null }));
    for (const r of rows) {
      if (r.kind === "swap" && r.asset && r.toAsset && Number(r.amount) > 0 && !(r.receive && /\d/.test(String(r.receive)))) {
        estimateArcSwap(r.asset, r.toAsset, r.amount);
      }
    }
  });

  const planView = (() => {
    if (planRows) {
      const single = !multiTicket;
      const done = multiTicket ? multiTicketDone : executionSteps.length > 0 && executionStepIndex >= executionSteps.length && !busy;
      const running = !done && (busy || executionSteps.length > 0);
      const lastHash = multiTicket ? [...stepTxHashes].reverse().find(Boolean) : txHash;
      const fee = showSend
        ? (sendFeeEstimate !== null ? `${fmtXpl(sendFeeEstimate, 6)} ${activeNetwork.nativeSymbol}` : null)
        : planRows.map(r => r.fees).filter(x => x && !/^(n\/?a|unknown|none|—|-)$/i.test(String(x).trim()))[0] || null;
      // anything that would make the plan stop halfway blocks it before confirming
      const guardBlock = multiTicket && planGuard && !planGuard.ok && planGuard.key === planSimKey ? planGuard.problems[0] : null;
      const shortfall = (multiTicket ? planBlocker(multiTicket.steps) : null) || guardBlock || planShortfall(planRows);
      return {
        key: "plan",
        phase: planError ? "failed" : done ? "done" : running ? "running" : "review",
        error: planError,
        // each step with its own transaction on the explorer, once it has one
        steps: planRows.map((r, i) => {
          const hash = multiTicket ? stepTxHashes[i] : i === 0 ? txHash : null;
          return { ...planStepFrom(r.kind, r), txUrl: hash ? explorerTx(hash, activeNetwork) : null };
        }),
        after: buildPlanAfter(planRows),
        // a real amount reads "Network fee ≈ 0.004 USDC"; a sentence from the server stays as written
        note: `${fee ? (/\d/.test(fee) ? `Network fee ≈ ${fee} · ` : `${fee} · `) : ""}Nothing moves until you confirm`,
        warning: defiTicket?.dataFound === false ? (defiTicket.summary || "No reliable data found for this operation.") : shortfall,
        executable: !shortfall && planSim?.state !== "fail" && (defiTicket && planEligible ? !!defiTicket.executable : true),
        simulation: planSim,
        activeIndex: single ? 0 : planStepIndex,
        doneCount: single ? (done ? 1 : 0) : Math.max(0, planStepIndex),
        txUrl: lastHash ? explorerTx(lastHash, activeNetwork) : null,
      };
    }
    if (pendingPlan) {
      // already in the order the backend's planner gives: what produces a
      // token the wallet lacks runs before what uses it, a bridge last
      const held = (sym) => {
        if (!sym) return 0;
        if (sym === activeNetwork.nativeSymbol) return Number(ethers.formatEther(balance || 0n));
        const t = tokens[sym];
        return t ? Number(ethers.formatUnits(tokenBalances[sym] || 0n, t.decimals)) : 0;
      };
      const output = (st) => (st.kind === "swap" ? st.toAsset : st.kind === "unstake" ? st.asset : null);
      const rank = { unstake: 0, swap: 0, send: 1, stake: 1, bridge: 2 };
      const preds = pendingPlan.steps.map((b, j) => {
        if (b.kind === "unstake") return [];
        const lacking = !(Number(b.amount) > 0) || held(b.asset) < Number(b.amount);
        return lacking ? pendingPlan.steps.map((x, i) => (i !== j && output(x) && output(x) === b.asset ? i : -1)).filter(i => i >= 0) : [];
      });
      const order = [];
      while (order.length < pendingPlan.steps.length) {
        const ready = pendingPlan.steps.map((_, i) => i).filter(i => !order.includes(i) && preds[i].every(p => order.includes(p)));
        if (!ready.length) { order.splice(0, order.length, ...pendingPlan.steps.map((_, i) => i)); break; } // a loop: as written
        ready.sort((x, y) => (rank[pendingPlan.steps[x].kind] ?? 1) - (rank[pendingPlan.steps[y].kind] ?? 1) || x - y);
        order.push(ready[0]);
      }
      return {
        key: "plan",
        phase: "thinking",
        steps: order.map(k => pendingPlan.steps[k]).map((st, i) => planStepFrom(st.kind, {
          amount: /^\d/.test(st.amount || "") ? st.amount : null,
          asset: st.asset, toAsset: st.toAsset,
          recipient: ethers.isAddress(st.recipient || "") ? st.recipient : null,
          contactName: ethers.isAddress(st.recipient || "") ? null : st.recipient,
          network: NETWORKS.find(x => x.name === st.network)?.key,
          sub: i > 0 && st.amount === "the rest" ? "The rest" : null,
        })),
      };
    }
    return null;
  })();

  // the plan scene's progress: steps before the one Lyra is on are ready
  const planSceneReady = (() => {
    const run = activityRuns[activityRuns.length - 1];
    if (!run || run.t0 < planStartedAtRef.current - 1000) return 0;
    let ready = 0;
    for (const st of run.steps) {
      const m = /^Step (\d+) of (\d+)/.exec(st.label || "");
      if (m) ready = Math.max(ready, Number(m[1]) - 1); // step k started: the ones before it are ready
    }
    return ready;
  })();

  // Web app: like a phone wallet, the fingerprint is asked as soon as the lock
  // screen shows (once per lock; the button stays for a retry), and after a
  // password unlock Lyra offers to set it up (or to replace a session-only one).
  useEffect(() => {
    if (!showUnlock) { bioAutoRef.current = false; return; }
    if (!IS_APP || !biometricEnabled || bioAutoRef.current) return;
    const record = loadBiometricRecord();
    if (!record || record.tier === "gate") return;
    bioAutoRef.current = true;
    const t = setTimeout(() => { unlockWithBiometric(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUnlock, biometricEnabled]);
  useEffect(() => {
    if (!IS_APP || !unlockedPrivateKey || !platformBiometric || bioOfferedRef.current) return;
    const record = loadBiometricRecord();
    if (record && record.tier !== "gate") return;
    let optedOut = false;
    try { optedOut = localStorage.getItem("lyra_biometric_optout_v1") === "1"; } catch {}
    if (optedOut && !record) return;
    bioOfferedRef.current = true;
    const t = setTimeout(() => setBioOffer(true), 900);
    return () => clearTimeout(t);
  }, [unlockedPrivateKey, platformBiometric]);

  const planBiometric = ledgerActive ? null : (() => {
    const ua = navigator.userAgent || "";
    const label = /Mac|iPhone|iPad/.test(ua) ? "Touch ID" : /Windows/.test(ua) ? "Windows Hello" : "biometrics";
    const record = biometricEnabled ? loadBiometricRecord() : null;
    if (record) return { label, verify: () => confirmBiometricPresence(record.credentialId) };
    // not set up yet: on by default, the first confirmation enrolls this device
    // (the OS asks for the fingerprint / face, which is itself the confirmation)
    let optedOut = false;
    try { optedOut = localStorage.getItem("lyra_biometric_optout_v1") === "1"; } catch {}
    if (platformBiometric && !optedOut && unlockedPrivateKey) {
      return { label, verify: () => enrollBiometric({ quiet: true }) };
    }
    return null;
  })();

  async function confirmPlan() {
    planConfirmedAtRef.current = Date.now();
    if (planBiometric) biometricPassedAtRef.current = Date.now();
    try {
      await signAndSend();
    } catch (e) {
      console.error(e);
      if (e?.ledgerSetup) {
        // nothing was sent: the plan stays as it was, the guide shows what to turn on
        resetExecutionProgress();
        setBusy(false);
        const s = await ledgerSettings().catch(() => null);
        setLedgerGuide({ model: e.ledgerModel || s?.model || null, need: e.ledgerSetup, blindOn: s?.blindSigning ?? (e.ledgerSetup === "blind" ? false : null) });
        return;
      }
      // stays on the card as "stopped": a half-run plan must never be offered again as-is
      setPlanError(String(friendlyErrorText(e)).replace(/^❌\s*/, ""));
    }
  }

  // The plan leaves ONE box in the chat ("LYRA · Request 1 › …", details in a
  // drop-down) in place of the request bubble and the per-step lines.
  function leaveRequestBox(status, reason = null) {
    const start = planMsgStartRef.current;
    const entry = {
      role: "request",
      status,
      text: planRequest,
      steps: planView?.steps || [],
      error: status === "failed" ? (reason || planError) : null,
      txUrl: status === "cancelled" ? null : planView?.txUrl || null,
    };
    setMessages(m => {
      const n = m.filter(x => x.role === "request").length + 1;
      return [...m.slice(0, Math.min(start, m.length)), { ...entry, n }];
    });
  }

  function finishPlan() {
    const steps = planView?.steps || [];
    const detail = steps.map(st => `${st.label} ${st.from || ""}${st.to ? ` → ${st.to}` : ""}`.replace(/\s+/g, " ").trim()).join(" · ");
    setPlanBanner({ title: steps.length > 1 ? `Done, ${steps.length} steps` : "Done", detail });
    const t0 = planConfirmedAtRef.current;
    setPlanDone({ steps, txUrl: planView?.txUrl || null, seconds: t0 ? Math.max(1, Math.round((Date.now() - t0) / 1000)) : null });
    leaveRequestBox("done");
    clearActiveTicket();
    refreshBalance();
  }

  // Cancel (before confirming) or Close (after it stopped)
  function closePlan() {
    // a plan that couldn't run (blocked before confirming) is "Stopped", with its reason
    const blocked = planView?.phase === "review" && planView.executable === false;
    leaveRequestBox(planView?.phase === "failed" || blocked ? "failed" : "cancelled", blocked ? `${planView.warning} Nothing was sent.` : null);
    clearActiveTicket();
  }

  // "Try" examples under Ask Lyra, built from what this network really has.
  // Lyra's answer to the latest request (a question back, an error, a plain
  // answer), shown right under Ask Lyra. The conversation list at the bottom of
  // the wallet is gone; plans have their own sheet. Closed with ×, replaced by
  // the next answer.
  const lyraReply = (() => {
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") { lastUser = i; break; }
    }
    for (let i = messages.length - 1; i > lastUser; i--) {
      const m = messages[i];
      if (m.role !== "ai" || m.variant === "onboarding" || !m.text) continue;
      if (i <= dismissedReplyAt) return null;
      const error = /^\s*(❌|⚠️)/.test(m.text) || m.variant === "warning";
      return { index: i, error, text: m.text.replace(/^\s*(❌|⚠️)\s*/, "") };
    }
    return null;
  })();

  // The wallet's own messages are English: show them in the chosen language.
  // The server translates (it already answers in that language itself); a
  // connection error, when the server can't be reached, uses the built-in table.
  const lastUserText = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].text;
    return "";
  })();
  useEffect(() => {
    if (!lyraReply || lyraLanguage === "en") return;
    const key = lyraLanguage + "|" + lyraReply.text;
    const cache = replyTranslationsRef.current;
    if (cache.has(key)) { setTranslatedReply({ key, text: cache.get(key) }); return; }
    const offline = offlineText(lyraReply.text, lyraLanguage === "auto" ? autoLanguage() : lyraLanguage);
    if (offline) { cache.set(key, offline); setTranslatedReply({ key, text: offline }); return; }
    if (!looksEnglishText(lyraReply.text)) return;
    // "auto" and an English request: nothing to translate
    if (lyraLanguage === "auto" && looksEnglishText(lastUserText)) return;
    let alive = true;
    // nothing in English first: the box waits (5 s at most) for the translation
    setTranslatedReply({ key, text: null });
    const fallback = setTimeout(() => { if (alive) setTranslatedReply({ key, text: lyraReply.text }); }, 5000);
    fetch(`${API_BASE_URL}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lyraReply.text, language: lyraLanguage, userText: lastUserText }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        clearTimeout(fallback);
        const text = d?.text || lyraReply.text;
        if (d?.text) cache.set(key, d.text);
        setTranslatedReply({ key, text });
      })
      .catch(() => { if (alive) { clearTimeout(fallback); setTranslatedReply({ key, text: lyraReply.text }); } });
    return () => { alive = false; clearTimeout(fallback); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyraReply?.text, lyraLanguage]);
  // null while its translation is on the way
  const replyNeedsTranslation = !!lyraReply && lyraLanguage !== "en" && looksEnglishText(lyraReply.text) &&
    !(lyraLanguage === "auto" && looksEnglishText(lastUserText) && !offlineText(lyraReply.text, autoLanguage()));
  const lyraReplyText = !lyraReply ? ""
    : translatedReply?.key === lyraLanguage + "|" + lyraReply.text ? translatedReply.text
    : replyNeedsTranslation ? null
    : lyraReply.text;

  const askLyraSuggestions = (() => {
    const native = activeNetwork.nativeSymbol;
    const syms = Object.keys(tokens);
    const stable = syms.find(x => /USD/.test(x)) || native;
    const other = syms.find(x => x !== stable) || native;
    const who = contacts[0]?.name || "Alice";
    const who2 = contacts[1]?.name || "Bob";
    return buildIdeas({
      stable, native, who, who2,
      other: other === stable ? native : other,
      otherNet: NETWORKS.find(x => x.key !== activeNetwork.key)?.name || "Base",
    });
  })();

  const frame = (
      <main className="frame frame--ask">
        {ledgerGuide && (
          <LedgerSetup
            model={ledgerGuide.model}
            need={ledgerGuide.need}
            blindOn={ledgerGuide.blindOn}
            onCheck={() => ledgerSettings()}
            onClose={() => setLedgerGuide(null)}
          />
        )}
        {/* The plan takes the whole wallet while it is on screen, like a sheet. */}
        <AnimatePresence>
          {planView && (() => {
            // grows out of the Ask Lyra box when the request was just sent from it
            const o = askOriginRef.current && Date.now() - askOriginRef.current.at < 5000 ? askOriginRef.current : null;
            return (
            <motion.div
              className={`plan-sheet${o ? " is-growing" : ""}${planScene ? " has-scene" : ""}${planScene && !planSceneSettled ? " scene-playing" : ""}`}
              initial={o ? false : { y: "100%" }}
              animate={o ? undefined : { y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.25, ease: "easeOut" } }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              {o && (() => {
                const [top, right, bottom, left] = o.clip;
                const sx = Math.max(0.05, (o.width - left - right) / (o.width || 1));
                const sy = Math.max(0.05, (o.height - top - bottom) / (o.height || 1));
                return (
                  <motion.div
                    className="plan-sheet-grow"
                    aria-hidden="true"
                    initial={{ transform: `translate(${left}px, ${top}px) scale(${sx}, ${sy})`, opacity: 0.6 }}
                    animate={{ transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 }}
                    transition={{ duration: 0.62, ease: [0.65, 0, 0.25, 1] }}
                  />
                );
              })()}
              {planScene && (
                <PlanScene3D
                  key={planScene.id}
                  request={planRequest}
                  steps={planView.steps}
                  ready={planSceneReady}
                  settled={planView.phase !== "thinking"}
                  leaving={["running", "done", "failed"].includes(planView.phase)}
                  onSettled={() => setPlanSceneSettled(true)}
                />
              )}
              <div className="plan-sheet-body">
                {/* Lyra's work log for this request, at the top: live phase + seconds, then "Worked for…" */}
                {(() => {
                  const run = activityRuns[activityRuns.length - 1];
                  return run && run.t0 >= planStartedAtRef.current - 1000 ? <ActivityBlock key={run.id} run={run} /> : null;
                })()}
                {planRequest && <FlyingRequest text={planRequest} origin={planScene ? null : o} />}
                <motion.div
                  className="plan-sheet-content"
                  initial={o ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: o ? 0.45 : 0 }}
                >
                <PlanCard
                  key={planView.key}
                  {...planView}
                  biometric={planBiometric}
                  onConfirm={confirmPlan}
                  onCancel={closePlan}
                  onDone={finishPlan}
                />
                </motion.div>
              </div>
            </motion.div>
            );
          })()}
        </AnimatePresence>
        <header className="header">
          <div className="brand">
  <img
    className="mark"
    src={`${import.meta.env.BASE_URL}logo.svg`}
    alt="Lyra"
  />
  <div className="name">Lyra</div>

  <div className="header-actions">
    <AnimatePresence>
      {incoming && wallet && !locked && (
        <motion.button
          key={incoming.id}
          type="button"
          className="incoming-pill"
          initial={{ opacity: 0, y: -8, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          onClick={() => { setIncoming(null); openTxCategory(uiMode === "3d" ? "received" : "send"); }}
          aria-label={`Received ${incoming.amount} ${incoming.symbol}${incoming.from ? ` from ${incoming.from}` : ""}`}
        >
          <span className="incoming-text">
            +{incoming.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} {incoming.symbol}
            {incoming.from && <span className="incoming-from"> from {incoming.from}</span>}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
    {wallet && uiMode !== "3d" && (
      <div className="header-menu" ref={headerMenuRef}>
        <button
          type="button"
          className={`header-rewards${menuOpen ? " is-hidden" : ""}`}
          onClick={() => setShowRewards(true)}
          aria-label="Rewards"
          title="Rewards"
          tabIndex={menuOpen ? -1 : 0}
        >
          <Gift size={17} strokeWidth={1.8} />
        </button>
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
              label: "History",
              icon: <History size={17} strokeWidth={1.8} color="var(--beige)" />,
              onClick: openTxHistory
            },
            {
              label: activeNetwork.name,
              icon: <Link size={17} strokeWidth={1.8} color="var(--beige)" />,
              onClick: () => setShowNetworkMenu(true)
            },
            {
              label: "Help",
              icon: <HelpCircle size={17} strokeWidth={1.8} color="var(--beige)" />,
              onClick: () => setShowHelp(true)
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

<OverlayPortal active={uiMode === "3d"}>
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
</OverlayPortal>

            {false && planBanner && (
              <motion.div
                className="plan-banner"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <span className="plan-banner-dot"><Check size={14} strokeWidth={3} /></span>
                <span className="plan-banner-text">
                  <strong>{planBanner.title}</strong>
                  <span>{planBanner.detail}</span>
                </span>
              </motion.div>
            )}

            <div className="balance-card">
            <div className="balance-label-row">
            <div className="balance-label">Available balance</div>
          </div>
            {/* receive: the address as a QR code, in the card's corner */}
            {wallet && (
              <button type="button" className="balance-qr" onClick={() => setShowReceiveQr(true)} aria-label="Receive: show my QR code" title="Receive">
                <QrCode size={18} strokeWidth={1.7} />
              </button>
            )}
          <div className="balance-row">
            <div className="balance">{balanceReady ? <AnimatedBalance value={Number(ethers.formatEther(balance || 0n))} decimals={2} /> : <Skel w={132} h={34} r={8} />}</div>
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
              <StatusBadge status={portfolioChangePercent >= 0 ? "up" : "down"} className="balance-change-badge">
                {portfolioChangePercent >= 0 ? "+" : ""}{portfolioChangePercent.toFixed(2)}%
              </StatusBadge>
            )}
          </div>
          {(xplPriceUSD || wallet?.address) && (
  <div className="balance-usd-value">
    {xplPriceUSD && (
      <span className="balance-usd-total">
        ≈ <AnimatedBalance currency decimals={2} value={
          Number(ethers.formatEther(balance || 0n)) * xplPriceUSD +
          Object.entries(tokens).reduce((sum, [symbol, token]) => {
            const walletAmt = Number(ethers.formatUnits(tokenBalances[symbol] || 0n, token.decimals));
            const stakedAmt = Number(ethers.formatUnits(stakedBalances[symbol] || 0n, token.decimals));
            return sum + walletAmt + stakedAmt;
          }, 0)
        } />
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
        <button
          type="button"
          className="address-open-btn"
          onClick={() => { setAccounts(loadAccounts()); setShowAccounts(v => !v); }}
          aria-expanded={showAccounts}
          data-tip="Your addresses"
        >
          {shortAddress(wallet.address)}
        </button>
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
        <button
          type="button"
          className={`address-chevron-btn${showAccounts ? " is-open" : ""}`}
          onClick={() => { setAccounts(loadAccounts()); setShowAccounts(v => !v); }}
          aria-expanded={showAccounts}
          aria-label="Your addresses"
          data-tip="Your addresses"
        >
          <ChevronDown size={13} strokeWidth={2.2} />
        </button>
      </span>
    )}
  </div>
)}
            <AnimatePresence initial={false}>
              {showAccounts && wallet && !locked && (
                <motion.div
                  key="accounts"
                  className="acct-wrap"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <AccountSwitcher
                    accounts={accounts}
                    activeAddress={wallet.address}
                    keyReady={(a) => accountKeyReady(a) || accounts.some(x => x.kind === "ledger" && x.address.toLowerCase() === String(a).toLowerCase())}
                    onConnectLedger={ledgerSupported() ? connectLedgerAccount : null}
                    onSwitch={switchAccount}
                    onCreate={createAccount}
                    onImport={importAccount}
                    onRename={(address, name) => setAccounts(renameAccount(address, name))}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            </div>

            {wallet && (
              <AskLyra
                value={input}
                onChange={setInput}
                onSubmit={(text, how) => { voiceRequestRef.current = !!how?.voice; handleIntent(text); setInput(""); }}
                busy={busy}
                // the ones held come first: a misheard ticker goes to what the user owns
                tokenSymbols={[activeNetwork.nativeSymbol, ...Object.keys(tokens)].sort((x, y) => Number((y === activeNetwork.nativeSymbol ? balance : tokenBalances[y] || 0n) > 0n) - Number((x === activeNetwork.nativeSymbol ? balance : tokenBalances[x] || 0n) > 0n))}
                contacts={contacts}
                networks={NETWORKS}
                suggestions={askLyraSuggestions}
                protocolLabel={protocolLabel}
                language={lyraLanguage}
                onLanguageChange={changeLyraLanguage}
                pendingContactName={pendingContact?.name || null}
                onSaveContact={saveContactFromChat}
              />
            )}

            {wallet && lyraReply && !input.trim() && !planView && (
              <div className={`lyra-reply${lyraReply.error ? " is-error" : ""}`} role="status" key={lyraReply.index}>
                <span className="lyra-reply-icon" aria-hidden="true">
                  {lyraReply.error ? <Info size={15} strokeWidth={2} /> : <LyraStar />}
                </span>
                <div className="lyra-reply-text">
                  {lyraReply.error && <span className="lyra-reply-title">{guardLang() === "fr" ? (/^(nothing was sent|rien n)/i.test(lyraReplyText || "") ? "Bloqué avant la signature" : "Ça n'est pas passé") : (/^nothing was sent/i.test(lyraReplyText || "") ? "Blocked before signing" : "That didn't go through")}</span>}
                  {lyraReplyText === null ? <span className="lyra-reply-wait">…</span> : <TypewriterText key={lyraReplyText} text={lyraReplyText} />}
                  {lyraReply.error && lastUserText && !busy && (
                    <button type="button" className="lyra-reply-retry" onClick={() => { haptic("tap"); setDismissedReplyAt(lyraReply.index); askAI(lastUserText); }}>
                      <RotateCcw size={12} strokeWidth={2.2} /> {guardLang() === "fr" ? "Réessayer" : "Try again"}
                    </button>
                  )}
                </div>
                <button type="button" className="lyra-reply-close" onClick={() => setDismissedReplyAt(lyraReply.index)} aria-label="Close" title="Close">
                  <X size={14} />
                </button>
              </div>
            )}

            {wallet && !input.trim() && !planView && (() => {
              const reqs = messages.filter(m => m.role === "request").slice().reverse();
              if (!reqs.length) return null;
              const shown = showAllRequests ? reqs : reqs.slice(0, 3);
              const summary = (e) => (e.steps || []).map(st => `${st.label} ${st.from || ""}${st.to ? ` → ${st.to}` : ""}`.replace(/\s+/g, " ").trim()).join(" · ") || String(e.text || "").replace(/0x[0-9a-fA-F]{40}/g, shortAddress);
              return (
                <div className="requests">
                  <div className="requests-head">
                    <span>Requests</span>
                    {reqs.length > 3 && (
                      <button type="button" className="requests-more" onClick={() => setShowAllRequests(v => !v)}>
                        {showAllRequests ? "Show less" : `See all ${reqs.length}`}
                      </button>
                    )}
                  </div>
                  <div ref={requestsListRef} className={`requests-list${showAllRequests ? " is-all" : ""}`}>
                    {shown.map(e => {
                      const fresh = e.n === celebratingRequest;
                      return (
                        <motion.div
                          key={e.n}
                          layout
                          className="request-slot"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ layout: { duration: 0.45, ease: [0.22, 1, 0.36, 1] }, duration: 0.3 }}
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            {fresh ? (
                              <motion.div
                                key="fresh"
                                className={`request-fresh is-${e.status}`}
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                transition={{ duration: 0.25 }}
                              >
                                <motion.span
                                  className="request-fresh-icon"
                                  initial={{ scale: 0, rotate: -30 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.08 }}
                                >
                                  {e.status === "done" ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
                                </motion.span>
                                <span className="request-fresh-text">
                                  <strong>{e.status === "done" ? ((e.steps || []).length > 1 ? `Done, ${e.steps.length} steps` : "Done") : "Stopped"}</strong>
                                  <span>{summary(e)}</span>
                                </span>
                              </motion.div>
                            ) : (
                              <motion.div
                                key="line"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.25 }}
                              >
                                <RequestBox entry={e} />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {showAddFunds && !input.trim() && !planView && (
              <EmptyWallet networkName={activeNetwork.name} nativeSymbol={activeNetwork.nativeSymbol} onReceive={() => setShowReceiveQr(true)} />
            )}

            {input.trim() || planView || showAddFunds ? null : uiMode !== "3d" && <PortfolioChart
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
/>}

          {!wallet && (
  <button className="connect-wallet" onClick={() => setShowWallet(true)}>
    <WalletCards size={16} />
    Create a wallet
  </button>
)}

        </header>

        {showBackupNudge && (
          <div className="backup-nudge" role="alert">
            <ShieldCheck size={18} strokeWidth={1.8} />
            <div className="backup-nudge-text">
              <strong>Back up your recovery phrase</strong>
              <span>Without it, your funds can't be recovered if you lose this device or forget your password.</span>
            </div>
            <button type="button" onClick={openBackupFromNudge}>Back up now</button>
          </div>
        )}

        <section className="chat" ref={chatScrollRef}>
          {false && (
  <div className="chat-empty-card" ref={chatEmptyPathRef}>
    <span className="border-light" />
    <span className="border-light-mask" />
    <div className="chat-empty-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M21 11.5a8.5 8.5 0 0 1-11.8 7.8L4 21l1.7-5.2A8.5 8.5 0 1 1 21 11.5Z"/>
      </svg>
    </div>
    <div className="chat-empty-title">What should we do?</div>
    <div className="chat-empty-subtitle">Send, receive, swap, bridge or stake tokens.</div>
  </div>
)}

          {/* the conversation is no longer listed here: Lyra's latest answer sits
              under Ask Lyra (lyraReply), plans have their own sheet */}
          {false && messages.map((m, i) => m.role === "request" ? (
            <RequestBox key={i} entry={m} />
          ) : (
            <React.Fragment key={i}>
              <div className={`msg ${m.role}`}>
                {m.role === "ai" && <div className="ai-label">Lyra</div>}
                <div className={`bubble${m.variant === "warning" ? " bubble-warning" : ""}`}>
                  {m.role === "ai" ? <TypewriterText text={m.text} /> : m.text}
                  {m.variant === "onboarding" && <OnboardingExamples />}
                </div>
              </div>
            </React.Fragment>
          ))}

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


        <div className="wallet-modal" style={{display: showWallet ? "flex" : "none"}}>
          <WalletPanel
            key={walletPanelMode}
            initialMode={walletPanelMode}
            existing={!!wallet}
            onClose={() => setShowWallet(false)}
            onBack={wallet ? null : () => { setShowWallet(false); setShowWelcome(true); }}
            onCreate={createWallet}
            onImport={importWallet}
            onImportKey={importPrivateKey}
          />
        </div>


<OverlayPortal active={uiMode === "3d"}>
{showReceiveQr && (
  <div
    className="backup-overlay"
    onMouseDown={(e) => { if (e.target === e.currentTarget) setShowReceiveQr(false); }}
  >
    <div className="backup-panel receive-panel" style={{ alignItems: "center", textAlign: "center" }}>
      <div className="backup-header" style={{ width: "100%", justifyContent: "center", textAlign: "center" }}>
        <div>
          <div className="backup-title">Receive</div>
          <div className="backup-subtitle">Scan or copy your address</div>
        </div>
        <button type="button" className="contacts-close receive-close" onClick={() => setShowReceiveQr(false)}>
          <X size={18} />
        </button>
      </div>
      {receiveQrSrc ? (
        <img className="receive-qr" src={receiveQrSrc} alt="Your wallet address as a QR code" />
      ) : (
        <Spinner size={20} />
      )}
      <div className="qr-address" style={{ marginTop: 10, wordBreak: "break-all" }}>{wallet?.address}</div>
      <button
        type="button"
        className="confirm"
        onClick={() => { copy(wallet.address); setToast("Address copied."); }}
      >
        <Copy size={15} /> Copy address
      </button>
    </div>
  </div>
)}
{uiMode === "3d" && showChart3d && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => { if (e.target === e.currentTarget) setShowChart3d(false); }}
  >
    <div className="contacts-panel">
      <div className="contacts-header">
        <div className="contacts-title">Portfolio</div>
        <button type="button" className="contacts-close" onClick={() => setShowChart3d(false)}>
          <X size={18} />
        </button>
      </div>
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
    </div>
  </div>
)}
{showHelp && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => { if (e.target === e.currentTarget) setShowHelp(false); }}
  >
    <div className="contacts-panel help-panel">
      <PanelHead icon={HelpCircle} tone="a" title="Help" subtitle="Answers in one tap" onClose={() => setShowHelp(false)} />

      <HelpFaq
        mode={uiMode}
        onAsk={() => {
          setShowHelp(false);
          setTimeout(() => document.querySelector('textarea[aria-label="Ask Lyra"], input[aria-label="Ask Lyra"], .ask-lyra textarea')?.focus(), 250);
        }}
        onReplayTour={() => { setShowHelp(false); setTourOpen(true); }}
        onSwitchMode={(m) => { setShowHelp(false); setMenuOpen(false); changeUiMode(m); }}
      />
    </div>
  </div>
)}
{showRewards && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRewards(false); }}
  >
    <div className="contacts-panel help-panel">
      <PanelHead icon={Gift} tone="p" title="Rewards" subtitle="Your activity with Lyra" onClose={() => setShowRewards(false)} />
      <RewardsPanel />
    </div>
  </div>
)}
{(showSend || defiTicket || multiTicket) && !planEligible && (
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

    <div className="transaction-summary tx-confirm">

      <div className="tx-confirm-k">You send</div>
      <div className="tx-confirm-amount" title={`${sendAmount || "0"} ${sendAssetSymbol}`}>
        {formatTicketAmount(sendAmount)} {sendAssetSymbol}
      </div>
      {sendAmountUSD && sendPriceUSD && (
        <div className="tx-confirm-sub">≈ {Number(sendAmountUSD).toFixed(2)} $</div>
      )}

      {(() => {
        // Contact name first when there is one, then the short address
        // (full one on hover).
        const contactName = contacts.find(c => c.address?.toLowerCase() === String(sendTo).toLowerCase())?.name;
        return (
          <div className="transaction-row recipient-row">
            <span>To</span>
            <strong title={sendTo}>
              {contactName ? `${contactName} · ${shortAddress(sendTo)}` : shortAddress(sendTo)}
            </strong>
          </div>
        );
      })()}

      <div className="transaction-row">
        <span>Network</span>
        <strong>{activeNetwork.name}</strong>
      </div>

      {(() => {
        // Lyra's fee on a send: shown before the user holds the button
        const decimals = isTokenSend ? sendToken?.decimals : 18;
        const raw = sendAmount && decimals != null ? toRaw(sendAmount, decimals) : null;
        if (!raw || raw <= 0n || isFeeExempt(wallet?.address, sendTo)) return null;
        const fee = feeOf(raw);
        if (!feeIsWorthCharging(fee, decimals, usdPerUnit(sendAssetSymbol, { nativeSymbol: activeNetwork.nativeSymbol, xplPriceUSD }))) return null;
        return (
          <div className="transaction-row">
            <span>Lyra fee ({LYRA_FEE_PERCENT_LABEL}, on top)</span>
            <strong>{ethers.formatUnits(fee, decimals)} {sendAssetSymbol}</strong>
          </div>
        );
      })()}

      <div className="transaction-row">
        <span>Fee</span>
        <strong>
          {sendFeeEstimate !== null
            ? `${fmtXpl(sendFeeEstimate, 6)} ${activeNetwork.nativeSymbol}`
            : sendFeeEstimateError
              ? "Couldn't estimate"
              : "Calculating…"}
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

        {(defiTicket.feature === "swap" || defiTicket.feature === "bridge" || (defiTicket.feature === "staking" && defiTicket.intent !== "UNSTAKE_XPL")) && (() => {
          const p = includedFeePreview(defiTicket, lyraFeeCtx());
          return p ? (
            <div className="transaction-row">
              <span>Lyra fee ({LYRA_FEE_PERCENT_LABEL}, included)</span>
              <strong>{p.fee} {p.asset}</strong>
            </div>
          ) : null;
        })()}

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
              <strong>{defiTicket.estimatedReceive ? (includedFeePreview(defiTicket, lyraFeeCtx()) ? estimateAfterFee(defiTicket.estimatedReceive) : defiTicket.estimatedReceive) : "—"}</strong>
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

        {defiTicket.feature === "onramp-buy" && (
          <>
            <div className="transaction-row">
              <span>Amount</span>
              <strong>${defiTicket.amountUSD}</strong>
            </div>
            <div className="transaction-row">
              <span>Target</span>
              <strong>ETH on Ethereum</strong>
            </div>
            <div className="transaction-row">
              <span>Provider</span>
              <strong>{defiTicket.platform}</strong>
            </div>
          </>
        )}

        {defiTicket.feature === "offramp-sell" && (
          <>
            <div className="transaction-row">
              <span>Amount</span>
              <strong>${defiTicket.amountUSD}</strong>
            </div>
            <div className="transaction-row">
              <span>Source</span>
              <strong>ETH on Ethereum</strong>
            </div>
            <div className="transaction-row">
              <span>Provider</span>
              <strong>{defiTicket.platform}</strong>
            </div>
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
            : defiTicket.feature === "onramp-buy"
              ? "Opens Onramper's own hosted page in a new tab, pre-filled with this amount and your address. Card or bank details are entered there, never inside Lyra. Once the crypto lands on your address, it shows up like any other deposit."
              : defiTicket.feature === "offramp-sell"
                ? (defiTicket.configured
                    ? "Opens Onramper's own hosted page in a new tab to set up the payout. It shows you a deposit address once ready — send to it from Lyra with a normal Send, the same as sending to anyone else. Bank details are entered on Onramper's page, never inside Lyra."
                    : "Onramper isn't configured on this server yet (ONRAMPER_API_KEY / ONRAMPER_PRIVATE_KEY_PEM missing). Cash-out to a bank account isn't available until it is.")
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
    ) : (defiTicket.feature === "onramp-buy" || defiTicket.feature === "offramp-sell") && defiTicket.onramperUrl ? (
      <a
        className="confirm hold-confirm"
        href={defiTicket.onramperUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setTimeout(() => setDefiTicket(null), 300)}
      >
        Open Onramper
      </a>
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
            {step.auto && <StatusBadge status="pending" title={step.reason || "Required for your request"}>Required</StatusBadge>}
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

              {step.auto && step.reason && (
                <div className="multi-step-auto-reason">Why this step: {step.reason}</div>
              )}

              {step.kind === "send" && (
                <>
                  <div className="transaction-row"><span>Recipient</span><strong>{step.contactName || shortAddress(step.recipient)}</strong></div>
                  <div className="transaction-row"><span>Amount</span><strong>{step.amountIsEstimate ? "≈ " : ""}{step.amount ?? "…"} {step.asset}</strong></div>
                  {!step.amountIsEstimate && (() => {
                    const info = assetInfo(step.asset, lyraFeeCtx());
                    const raw = info ? toRaw(step.amount, info.decimals) : null;
                    if (!info || !raw || raw <= 0n || isFeeExempt(wallet?.address, step.recipient)) return null;
                    const fee = feeOf(raw);
                    if (!feeIsWorthCharging(fee, info.decimals, usdPerUnit(step.asset, lyraFeeCtx()))) return null;
                    return <div className="transaction-row"><span>Lyra fee ({LYRA_FEE_PERCENT_LABEL}, on top)</span><strong>{ethers.formatUnits(fee, info.decimals)} {step.asset}</strong></div>;
                  })()}
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

                  {(step.kind === "swap" || step.kind === "bridge" || step.kind === "stake") && !step.amountIsEstimate && (() => {
                    const p = includedFeePreview({ asset: step.asset, amount: step.amount }, lyraFeeCtx());
                    return p ? (
                      <div className="transaction-row"><span>Lyra fee ({LYRA_FEE_PERCENT_LABEL}, included)</span><strong>{p.fee} {p.asset}</strong></div>
                    ) : null;
                  })()}

                  {step.kind === "swap" && (
                    <>
                      <div className="transaction-row"><span>Rate</span><strong>{t?.rate || "—"}</strong></div>
                      <div className="transaction-row"><span>You'll receive</span><strong>{t?.estimatedReceive ? (!step.amountIsEstimate && includedFeePreview({ asset: step.asset, amount: step.amount }, lyraFeeCtx()) ? estimateAfterFee(t.estimatedReceive) : t.estimatedReceive) : "—"}</strong></div>
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
                    <>
                      <div className="transaction-row"><span>Route</span><strong>{t?.route || "—"}</strong></div>
                      {step.tokenOutSymbol && step.tokenOutSymbol !== step.asset && (
                        <div className="transaction-row"><span>You'll receive</span><strong>{t?.estimatedReceive || "—"}</strong></div>
                      )}
                    </>
                  )}

                  {step.kind === "predict" && (
                    <>
                      <div className="transaction-row"><span>Market</span><strong>{t?.marketQuestion || "—"}</strong></div>
                      <div className="transaction-row"><span>Outcome</span><strong>{t?.outcome || "—"}</strong></div>
                      <div className="transaction-row"><span>Implied odds</span><strong>{t?.price != null ? `${(Number(t.price) * 100).toFixed(1)}%` : "—"}</strong></div>
                      <div className="transaction-row"><span>Potential payout</span><strong>{t?.potentialPayout ? `$${t.potentialPayout}` : "—"}</strong></div>
                      {t?.endDate && (
                        <div className="transaction-row"><span>Resolves</span><strong>{new Date(t.endDate).toLocaleDateString()}</strong></div>
                      )}
                    </>
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

        {showWelcome && (
  <div className="entry-screen">
    <div className="entry-panel">
      <Logo3D className="entry-logo" />
      <div className="entry-wordmark">Lyra</div>
      <div className="entry-tagline">Your AI-powered wallet. Just ask.</div>

      <WelcomeDemo />

      <div className="unlock-actions entry-actions">
        <FillButton
          className="unlock-btn-gradient"
          icon={ArrowRight}
          onClick={() => {
            setWalletPanelMode("choose");
            setShowWelcome(false);
            setShowWallet(true);
          }}
        >
          Get started
        </FillButton>
      </div>

      <button
        type="button"
        className="forgot-password-link"
        onClick={() => {
          setWalletPanelMode("choose");
          setShowWelcome(false);
          setShowWallet(true);
        }}
      >
        I already have a wallet
      </button>
    </div>
  </div>
)}

        {/* The lock screen is opaque from its first frame (only its content
            fades in), and on unlock it fades away to reveal the wallet. */}
        <AnimatePresence>
        {showUnlock && (
  <motion.div
    key="unlock-screen"
    className="entry-screen"
    initial={false}
    exit={{ opacity: 0, scale: 1.015 }}
    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
  >
    {(() => {
      const list = loadAccounts();
      const current = loadSavedWallet()?.address || "";
      const me = list.find(a => a.address?.toLowerCase() === current.toLowerCase());
      if (!current || list.length < 1) return null;
      return (
        <div className="lock-account" key={lockPick}>
          <button type="button" className="lock-account-btn" onClick={() => setLockMenuOpen(o => !o)} aria-expanded={lockMenuOpen} aria-label="Choose the address to unlock">
            <Avatar name={me?.name || "Main account"} size={24} />
            <span>{me?.name || "Main account"}</span>
            {list.length > 1 && <ChevronDown size={14} />}
          </button>
          {lockMenuOpen && list.length > 1 && (
            <div className="lock-account-menu" role="menu">
              {list.map(a => {
                const on = a.address?.toLowerCase() === current.toLowerCase();
                return (
                  <button
                    key={a.address}
                    type="button"
                    role="menuitem"
                    className="lock-account-item"
                    onClick={() => {
                      if (!on) {
                        try { activateAccount(a.address); } catch (e) { setUnlockError(e.message); }
                        setUnlockPassword("");
                        setUnlockError("");
                        setBiometricError("");
                      }
                      setLockMenuOpen(false);
                      setLockPick(n => n + 1);
                    }}
                  >
                    <Avatar name={a.name} size={28} />
                    <span><b>{a.name}</b><span className="mono">{shortAddress(a.address)}</span></span>
                    {on && <Check size={15} className="menu-account-check" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    })()}
    <div className="entry-panel">
      <Logo3D className="entry-logo" />
      <div className="entry-wordmark">Lyra</div>
      <div className="entry-tagline">Welcome back! Enter your password to unlock.</div>

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
          autoFocus={!(IS_APP && biometricEnabled)}
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
        <FillButton className="unlock-btn-gradient" icon={ArrowRight} onClick={unlockWallet}>
          Unlock Wallet
        </FillButton>

        {(biometricEnabled || platformBiometric) && (() => {
          // the fingerprint opens the address it was set up on: offered for that one,
          // and for the others it says how to turn it on
          const rec = loadBiometricRecord();
          const current = (loadSavedWallet()?.address || "").toLowerCase();
          const ready = !!rec && String(rec.address || "").toLowerCase() === current;
          return (
            <>
              <div className="biometric-divider">or</div>
              <FillButton
                className="biometric-outline-btn"
                icon={biometricBusy ? Spinner : Fingerprint}
                iconSide="left"
                iconSpin={biometricBusy}
                onClick={ready ? unlockWithBiometric : () => setBiometricError("Unlock once with your password, then turn on Fingerprint unlock in Settings for this address.")}
                disabled={biometricBusy}
              >
                Use Biometrics
              </FillButton>
              {biometricError && <div className="seed-error">{biometricError}</div>}
            </>
          );
        })()}
      </div>

      <button
        type="button"
        className="forgot-password-link"
        onClick={openForgotPassword}
      >
        Forgot password?
      </button>

    </div>
  </motion.div>
)}
        </AnimatePresence>

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

{showPasswordSetup && (
  <div className="backup-overlay">

    <div className="backup-panel onb-card">

      {passwordSetupMode !== "reset" && <OnboardSteps at={2} />}
      <div className="panel-head">
        <span className="panel-head-icon tone-t" aria-hidden="true"><Lock size={18} strokeWidth={1.9} /></span>
        <div className="panel-head-text">
          <div className="panel-head-title">{passwordSetupMode === "reset" ? "Choose a new password" : "Secure your wallet"}</div>
          <div className="panel-head-sub">
            {passwordSetupMode === "reset"
              ? "Your phrase was successfully verified"
              : passwordSetupMode === "import"
              ? "Your password for this imported wallet"
              : "You'll use it to open Lyra"}
          </div>
        </div>
      </div>

      {passwordSetupMode === "create" && (
        <div className="backup-note">
          Next: your wallet opens right away. We'll remind you to back up your recovery phrase once it holds funds.
        </div>
      )}


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

      {newPassword && (() => {
        const p = newPassword;
        const score = (p.length >= 8) + (p.length >= 12) + (/[a-z]/.test(p) && /[A-Z]/.test(p)) + /\d/.test(p) + /[^A-Za-z0-9]/.test(p);
        const [label, color] = p.length < 8 ? ["Too short (8 characters minimum)", "#F2A0A0"] : score >= 4 ? ["Strong password", "#5DCAA5"] : score >= 3 ? ["Good password", "#FAC775"] : ["Weak password", "#F0997B"];
        return (
          <>
            <div className="onb-strength"><i style={{ width: `${Math.max(12, Math.min(100, score * 20))}%`, background: color }} /></div>
            <div className="onb-strength-label" style={{ color }}>{label}</div>
          </>
        );
      })()}

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

      <div className="onb-warn">
        <AlertTriangle size={15} />
        <span>Lyra can't recover this password. Only your recovery phrase{passwordSetupMode === "import" && !pendingMnemonic ? " or private key" : ""} can.</span>
      </div>

      {passwordSetupMode !== "reset" && (
        <div className={`mpc-option-card${IS_TESTNET ? " is-soon" : ""}`}>
          <StatusBadge status={IS_TESTNET ? "submitted" : "progress"} className="mpc-status-badge">{IS_TESTNET ? "Soon" : "Early access"}</StatusBadge>
          <label className="mpc-option-header">
            <input
              type="checkbox"
              checked={!IS_TESTNET && enableMpcOnSetup}
              disabled={IS_TESTNET}
              onChange={e => setEnableMpcOnSetup(e.target.checked)}
            />
            Extra protection
          </label>
          <div className="seed-import-description">
            Your key is split in two: one half stays on this device, the other is saved in a protected storage and only released when you unlock. Neither half alone can move your funds.
          </div>
        </div>
      )}

      {passwordSetupMode !== "reset" && enableMpcOnSetup && !IS_TESTNET && (
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
            // Extra protection (MPC) is switched off on the testnet build ("Soon").
            const shouldUseMpc = !IS_TESTNET && (passwordSetupMode === "reset" ? resetMpcEnabled : enableMpcOnSetup);

            // What actually gets password-encrypted and stored locally:
            // fragment1 for an MPC wallet, the full key otherwise.
            let localSecret = pendingPrivateKey;
            let mpcFlag = false;

            if (shouldUseMpc) {
              if (passwordSetupMode === "reset") {
                // This address was already MPC-registered before the
                // password was lost. pendingPrivateKey here is the full
                // key just re-derived from the recovery phrase (fromPhrase
                // address match, above) -- signing the server's recovery
                // challenge with it is real proof of possession, not just
                // a claim (see recoverFragment2 in mpc.js), so the backend
                // releases fragment2 without a separate biometric/limit
                // gate here -- then fragment1 = privateKey XOR fragment2
                // (XOR is its own inverse, same combineFragments() does
                // the split too).
                const fragment2 = await recoverFragment2(address, new ethers.Wallet(pendingPrivateKey));
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
            rememberAccountKey(address, pendingPrivateKey, localSecret);
            setMpcEnabled(mpcFlag);

            setLocked(false);
            setShowPasswordSetup(false);
            if (passwordSetupMode !== "reset") setShowInterfaceChoice(true);
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
                ? "Wallet secured with extra protection: your key is split between this device and Lyra."
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
      <PanelHead icon={Settings} tone="p" title="Settings" subtitle="Your wallet, your way" onClose={() => setShowSettings(false)} />
      {wallet?.address && (
        <button type="button" className="menu-account" onClick={() => { setShowSettings(false); setAccounts(loadAccounts()); setShowAccounts(true); }}>
          <Avatar name={(accounts.find(a => a.address?.toLowerCase() === wallet.address.toLowerCase())?.name) || "Main account"} size={38} />
          <span className="menu-account-text">
            <b>{(accounts.find(a => a.address?.toLowerCase() === wallet.address.toLowerCase())?.name) || "Main account"}</b>
            <span>{shortAddress(wallet.address)}</span>
          </span>
          <span className="menu-chip"><span className="menu-chip-dot" />{activeNetwork.name}</span>
        </button>
      )}

      <div className="settings-list">

        <SettingsSection title="General" defaultOpen>

        <div className="settings-row">
          <SettingIcon title="Interface" />
          <div className="settings-row-info">
            <div className="settings-row-title">Interface</div>
            <div className="settings-row-desc">Classic 2D, or the 3D depth view. Switch any time.</div>
          </div>
          <div
            className={`d3-pill-switch${pillMode === "3d" ? " is-3d" : ""}`}
            role="radiogroup"
            aria-label="Interface"
          >
            <span className="d3-pill-thumb" aria-hidden="true" />
            <button type="button" role="radio" aria-checked={pillMode === "2d"} className={pillMode === "2d" ? "active" : ""} onClick={() => changeUiMode("2d")}>2D</button>
            <button type="button" role="radio" aria-checked={pillMode === "3d"} className={pillMode === "3d" ? "active" : ""} onClick={() => changeUiMode("3d")}>3D</button>
          </div>
        </div>

        {installMode && (
          <div className="settings-row">
            <SettingIcon title="Install Lyra on this phone" />
            <div className="settings-row-info">
              <div className="settings-row-title">Install Lyra on this phone</div>
              <div className="settings-row-desc">
                {installMode === "prompt" ? "Opens full screen from your home screen, like any app."
                  : installMode === "ios" ? "In Safari, tap Share, then Add to Home Screen."
                  : "Open the browser menu ⋮, then Install app (or Add to Home screen)."}
              </div>
            </div>
            {installMode === "prompt" && (
              <button type="button" className="contact-save" onClick={() => installLyra()}>Install</button>
            )}
          </div>
        )}

        <div className="settings-row">
          <SettingIcon title="3D plan animation" />
          <div className="settings-row-info">
            <div className="settings-row-title">3D plan animation</div>
            <div className="settings-row-desc">While Lyra prepares a plan of several steps, watch it come together in 3D.</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={plan3dPref}
              onChange={() => { const on = !plan3dPref; setPlan3d(on); setPlan3dPref(on); }}
            />
            <span className="toggle-switch-track">
              <span className="toggle-switch-thumb" />
            </span>
          </label>
        </div>

        {uiMode === "3d" && (
          <div className="settings-row">
            <SettingIcon title="3D guided tour" />
            <div className="settings-row-info">
              <div className="settings-row-title">3D guided tour</div>
              <div className="settings-row-desc">A quick walk through the side menus and the assets box.</div>
            </div>
            <button
              type="button"
              className="d3-replay-btn"
              onClick={() => { setShowSettings(false); setTourOpen(true); }}
            >
              Replay
            </button>
          </div>
        )}

        <div className="settings-row">
          <SettingIcon title="Auto-lock" />
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
          <SettingIcon title="Network" />
          <div className="settings-row-info">
            <div className="settings-row-title">Network</div>
            <div className="settings-row-desc">{activeNetwork.name} · Chain ID {activeNetwork.chainId}</div>
          </div>
        </div>

        <div className="settings-row">
  <SettingIcon title="Biometric unlock" />
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
      <div className="settings-row-title">Extra protection</div>
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

        </SettingsSection>

        <SettingsSection title="Security">

        <div className="settings-row">
          <SettingIcon title="One-transaction plans" />
          <div className="settings-row-info">
            <div className="settings-row-title">One-transaction plans</div>
            <div className="settings-row-desc">A plan of several steps goes out as one transaction, prepared while you read it: faster, and all or nothing. Uses an EIP-7702 delegation of your address (the contract Ledger approves).</div>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={oneTxPlans} onChange={() => setOneTxPlans(!oneTxPlans)} />
            <span className="toggle-switch-track">
              <span className="toggle-switch-thumb" />
            </span>
          </label>
        </div>

        <div className="settings-row">
          <SettingIcon title="Delegation on" />
          <div className="settings-row-info">
            <div className="settings-row-title">Delegation on {activeNetwork.name}</div>
            <div className="settings-row-desc">
              {!delegationState ? "Checking…"
                : delegationState.status === "none" ? "None: your address is a plain address here."
                : delegationState.status === "lyra" ? "Active (Simple7702Account, for one-transaction plans). Removing it costs a small network fee and turns one-transaction plans off."
                : delegationState.status === "other" ? "Your address is delegated to another contract (set by another wallet). Removing it costs a small network fee."
                : "Couldn't read it right now."}
              {delegationState?.error && <span className="seed-error" style={{ display: "block", marginTop: 6 }}>{delegationState.error}</span>}
            </div>
          </div>
          {(delegationState?.status === "lyra" || delegationState?.status === "other") && (
            ledgerActive ? <span className="settings-row-desc">Not from a Ledger yet</span> : (
              <button
                type="button"
                className={delegationState.confirm ? "contact-save" : "contact-cancel"}
                disabled={delegationState.busy || !unlockedPrivateKey}
                onClick={async () => {
                  if (!delegationState.confirm) { setDelegationState(d => ({ ...d, confirm: true, error: null })); return; }
                  setDelegationState(d => ({ ...d, busy: true, error: null }));
                  try {
                    await removeOwnDelegation(new ethers.Wallet(unlockedPrivateKey, RPC));
                    setOneTxPlans(false);
                    preparedPlanRef.current = null;
                    setDelegationState({ status: "none" });
                    setToast("Delegation removed. One-transaction plans are off.");
                  } catch (e) {
                    setDelegationState(d => ({ ...d, busy: false, confirm: false, error: String(friendlyErrorText(e)).replace(/^❌s*/, "") }));
                  }
                }}
              >
                {delegationState.busy ? "Removing…" : delegationState.confirm ? "Confirm removal" : "Remove"}
              </button>
            )
          )}
        </div>

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

        <button
          type="button"
          className={`settings-action-row appr-toggle${showApprovals ? " is-open" : ""}`}
          onClick={() => {
            const next = !showApprovals;
            setShowApprovals(next);
            if (next && wallet?.address) {
              fetch(`${API_BASE_URL}/api/transactions/${wallet.address}?network=${activeNetworkKey}`)
                .then(r => (r.ok ? r.json() : { transactions: [] }))
                .then(({ transactions = [] }) => setCalledContracts(
                  [...new Set(transactions
                    .filter(t => t.type === "native" && t.from?.toLowerCase() === wallet.address.toLowerCase() && t.to)
                    .map(t => t.to.toLowerCase()))].slice(0, 20)
                ))
                .catch(() => {});
            }
          }}
          aria-expanded={showApprovals}
        >
          <ShieldCheck size={16} strokeWidth={1.8} />
          <span>Token approvals</span>
          <ChevronDown size={15} className="appr-chevron" />
        </button>
        <AnimatePresence initial={false}>
          {showApprovals && wallet?.address && (
            <motion.div
              key="approvals"
              style={{ overflow: "hidden" }}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            >
              <Approvals
                owner={wallet.address}
                provider={RPC}
                tokens={tokens}
                spenders={approvalSpenders}
                onRevoke={revokeApproval}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="settings-row">
          <SettingIcon title="Require biometric above" />
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

        </SettingsSection>

        <SettingsSection title="x402 &amp; agents">

        <div className="settings-row">
          <SettingIcon title="Spending limit" />
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

        </SettingsSection>

        <SettingsSection title="Multisig">

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
            <SettingIcon title="Multisig" />
            <div className="settings-row-info">
              <div className="settings-row-title">Multisig</div>
              <div className="settings-row-desc">
                Not available on {activeNetwork.name} yet. Switch to {SAFE_SUPPORTED_NETWORK_KEYS.map(k => getNetworkByKey(k).name).join(", ")}.
              </div>
            </div>
          </div>
        )}

        </SettingsSection>

        <SettingsSection title="Danger zone" danger>

        <button
          type="button"
          className="settings-action-row danger"
          onClick={() => { setShowSettings(false); setShowResetConfirm(true); }}
        >
          <Trash2 size={16} strokeWidth={1.8} />
          <span>Reset Wallet</span>
        </button>

        </SettingsSection>

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

      <PanelHead
        icon={Users}
        tone="b"
        title="Contacts"
        subtitle={contacts.length ? `${contacts.length} ${contacts.length === 1 ? "person" : "people"}` : "Saved addresses"}
        onClose={() => {
          setShowContacts(false);
          setShowAddContact(false);
          setEditingContact(null);
          setContactSearch("");
        }}
      />

      <div className="contacts-searchbar">
        <div className="contacts-search">
          <Search size={13} />
          <input
            type="text"
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            placeholder="Search a name"
            aria-label="Search contacts by name"
          />
        </div>
        <button
          type="button"
          className="contacts-io-mini"
          title="Export contacts"
          aria-label="Export contacts"
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
          <Download size={15} />
        </button>

        <button
          type="button"
          className="contacts-io-mini"
          title="Import contacts"
          aria-label="Import contacts"
          onClick={() => importContactsInputRef.current?.click()}
        >
          <Upload size={15} />
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
          <div className="menu-empty">
            <span className="menu-empty-icon tone-b"><UserPlus size={19} strokeWidth={1.9} /></span>
            <strong>Save the people you pay</strong>
            <span>Then just say "send 10 USDT0 to Papa".</span>
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
                  <Avatar name={contact.name} size={32} />
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
                    className="contact-send"
                    onClick={() => {
                      setShowContacts(false);
                      setContactSearch("");
                      setInput(`Send to ${contact.name} `);
                    }}
                  >
                    Send
                  </button>
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
          return (
            <div className="tx-item" key={entry.id} style={{ width: "100%" }}>
              <div className="tx-item-main">
                <div className="tx-item-direction">
                  {entry.category} · {entry.action}
                  <StatusBadge status={{ success: "success", blocked: "pending", failed: "failed" }[entry.status] || "expired"} className="audit-status-badge">
                    {{ success: "Success", blocked: "Blocked", failed: "Failed" }[entry.status] || entry.status}
                  </StatusBadge>
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
        <SettingIcon title="" />
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
    <motion.div className="contacts-panel" layout="size" transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} style={txHistoryDirect ? { display: "none" } : undefined}>

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
          // opened straight from a menu button: it grows out of it (menuMorph.js) instead
          initial={txHistoryDirect ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeTxDetail();
          }}
        >
          <motion.div
            className="contacts-panel"
            initial={txHistoryDirect ? false : { opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 14 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
          >
            {(() => {
              // the side menus' own icons, one colour per kind (menus.css)
              const head = {
                send: ["Send/Receive", <ArrowLeftRight size={18} strokeWidth={1.8} />, "t"],
                sent: ["Send", <ArrowUpFromDot size={18} strokeWidth={1.8} style={{ transform: "rotate(45deg)" }} />, "c"],
                received: ["Receive", <ArrowDownToDot size={18} strokeWidth={1.8} style={{ transform: "rotate(45deg)" }} />, "t"],
                swap: ["Swap", <ArrowLeftRight size={18} strokeWidth={1.8} />, "p"],
                bridge: ["Bridge", <MoveHorizontal size={18} strokeWidth={1.8} />, "b"],
                stake: ["Stake", <Vault size={18} strokeWidth={1.8} />, "a"],
                predictions: ["Predictions", <LineChart size={18} strokeWidth={1.8} />, "p"],
                x402: ["x402", <Coins size={18} strokeWidth={1.8} />, "a"],
                a2a: ["A2A", <Users size={18} strokeWidth={1.8} />, "b"],
                acp: ["ACP", <Link size={18} strokeWidth={1.8} />, "b"],
              }[txHistoryTab] || ["History", <History size={18} strokeWidth={1.8} />, "p"];
              const sub = txHistoryLoading ? "Loading…"
                : txHistoryTab === "received" ? `Funds that came in on ${activeNetwork.name}`
                : txHistoryTab === "stake" ? "Earn on what you hold"
                : txHistoryTab === "predictions" ? "Your Polymarket bets"
                : txHistoryRows.length ? `${txHistoryRows.length} on ${activeNetwork.name}`
                : activeNetwork.name;
              return <PanelHead icon={head[1]} tone={head[2]} title={head[0]} subtitle={sub} onClose={closeTxDetail} />;
            })()}

      <div className="contacts-list" ref={txListRef}>
      {txPull.indicator}
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
            {predictionsLoading && <SkeletonRows count={3} />}

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
            {txHistoryLoading && <SkeletonRows count={5} />}

            {!txHistoryLoading && txHistoryError && (
              <div className="contacts-empty">{txHistoryError}</div>
            )}

            {!txHistoryLoading && !txHistoryError && (() => {
              const known = Object.keys(tokens);
              const people = loadContacts();
              const rows = txHistoryRows.map(r => {
                const contact = people.find(c => c.address?.toLowerCase() === String(r.counterparty || "").toLowerCase());
                return {
                  ...r,
                  asset: stakeAssetOf(r.display?.symbol, known),
                  counterpartyName: contact?.name || null,
                  counterpartyLabel: contact?.name || shortAddress(r.counterparty),
                };
              });
              const common = { networkName: activeNetwork.name, networkKey: activeNetworkKey, protocolFor, explorerUrl: (h) => explorerTx(h, activeNetwork) };
              if (txHistoryTab === "stake") {
                const positions = Object.entries(tokens)
                  .filter(([sym]) => (stakedBalances[sym] || 0n) > 0n)
                  .map(([sym, t]) => ({ symbol: sym, amount: Number(ethers.formatUnits(stakedBalances[sym], t.decimals)), apy: stakedApy[sym] ?? null }));
                return <StakeHistory rows={rows} positions={positions} networkKey={activeNetworkKey} {...common} />;
              }
              const empty = {
                sent: { icon: SendIcon, tone: "c", title: "Nothing sent yet", text: "Send to an address or a saved contact.", example: "send 10 usdt0 to Papa" },
                received: { icon: QrCode, tone: "t", title: "Nothing received yet", text: "Share your address to receive funds.", example: "show my address" },
                swap: { icon: ArrowLeftRight, tone: "p", title: "Swap with one sentence", text: "Lyra finds the best route for you.", example: "swap 10 xpl to usdc" },
                bridge: { icon: MoveHorizontal, tone: "b", title: "Move funds to another network", text: "Lyra picks the bridge and the fees.", example: "bridge 10 usdc to base" },
              }[txHistoryTab] || null;
              return <TxHistoryList key={txHistoryTab} rows={rows} empty={empty} stats={txHistoryTab === "swap" || txHistoryTab === "bridge"} {...common} />;
            })()}
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
</OverlayPortal>

      </main>
  );

  const toastEl = (
    <>
      {toast ? <div className="toast">{toast}</div> : null}
      <PlanDoneSheet done={planDone} networkName={activeNetwork.name} onClose={() => setPlanDone(null)} />
      {bioOffer && !showUnlock && (
        <div className="bio-offer" role="dialog" aria-label="Fingerprint unlock">
          <span className="bio-offer-icon"><Fingerprint size={22} strokeWidth={1.8} /></span>
          <div className="bio-offer-text">
            <b>Unlock with your fingerprint?</b>
            <span>No password next time, on this phone.</span>
          </div>
          <div className="bio-offer-actions">
            <button
              type="button"
              className="bio-offer-yes"
              disabled={biometricBusy}
              onClick={async () => {
                setBiometricBusy(true);
                try { await enrollBiometric(); setBioOffer(false); }
                catch (e) { console.error(e); setToast(e?.name === "NotAllowedError" ? "Fingerprint not set up. You can turn it on in Settings." : (e.message || "Couldn't set up fingerprint unlock.")); setBioOffer(false); }
                finally { setBiometricBusy(false); }
              }}
            >
              {biometricBusy ? "…" : "Turn on"}
            </button>
            <button
              type="button"
              className="bio-offer-no"
              onClick={() => { try { localStorage.setItem("lyra_biometric_optout_v1", "1"); } catch {} setBioOffer(false); }}
            >
              Not now
            </button>
          </div>
        </div>
      )}
      {showInterfaceChoice && <InterfaceChooser onChoose={chooseInterface} />}
    </>
  );

  if (uiMode === "3d") {
    return (
      <div className="page page--3d">
        {toastEl}
        <Box3D leftItems={leftMenu3d} rightItems={rightMenu3d} assets={assets3d} networkName={activeNetwork.name} networkKey={activeNetworkKey} nativeSymbol={activeNetwork.nativeSymbol} onReceive={() => setShowReceiveQr(true)} paused={anyOverlayOpen} tourActive={tourOpen} onTourDone={finishTour}>
          {frame}
        </Box3D>
      </div>
    );
  }

  return (
    <div className="page">
      {toastEl}
      {frame}
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
            {mainDone ? <Check size={12} strokeWidth={3} /> : <Spinner size={12} />}
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

function AnimatedBalance({ value, decimals = 2, currency = false }) {
  const ref = useRef(null);
  const prevValue = useRef(value);
  const tweenRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const format = (n) => n.toLocaleString("en-US", currency
      ? { style: "currency", currency: "USD", maximumFractionDigits: decimals }
      : { minimumFractionDigits: 0, maximumFractionDigits: decimals });

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
  }, [value, decimals, currency]);

  return <span ref={ref}>{value.toLocaleString("en-US", currency ? { style: "currency", currency: "USD", maximumFractionDigits: decimals } : { maximumFractionDigits: decimals })}</span>;
}

const ONBOARDING_EXAMPLES = [
  { label: "Send", example: "Send 10 XPL to 0x..." },
  { label: "Bridge", example: "Bridge 5 XPL to Base" },
  { label: "Ask", example: "What is a bridge, and is it safe?" },
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

  const rangeBtnRefs = useRef({});
  const [rangeIndicator, setRangeIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const btn = rangeBtnRefs.current[range];
    if (btn) setRangeIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [range]);

  return (
    <div className="portfolio-chart">
      <div className="chart-toolbar">
        <div className="chart-ranges">
          <span
            className="chart-range-indicator"
            style={{ transform: `translateX(${rangeIndicator.left}px)`, width: rangeIndicator.width }}
          />
          {PORTFOLIO_RANGES.map(r => (
            <button
              key={r.key}
              ref={el => { rangeBtnRefs.current[r.key] = el; }}
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
          {mode === "line" ? <PieChart size={11} strokeWidth={1.8} /> : <LineChart size={11} strokeWidth={1.8} />}
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

// Creating or bringing a wallet: step 1 of 3 (then the password, then the
// interface). Three ways in: a new wallet, a recovery phrase, a private key.
function OnboardSteps({ at }) {
  return (
    <div className="onb-steps" aria-label={`Step ${at} of 3`}>
      {[1, 2, 3].map(n => <span key={n} className={n === at ? "on" : n < at ? "done" : ""} />)}
    </div>
  );
}

function WalletPanel({ existing, initialMode = "choose", onClose, onBack, onCreate, onImport, onImportKey }) {
  const [mode, setMode] = useState(initialMode === "create" || initialMode === "import" ? "choose" : initialMode);
  const [wordCount, setWordCount] = useState(12);
  const [words, setWords] = useState({});
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  function handleImport() {
    try {
      setError("");
      const missing = Array.from({ length: wordCount }, (_, i) => i).filter(i => !words[i]?.trim());
      if (missing.length > 0) {
        setError("Please fill in all " + wordCount + " words of your phrase.");
        return;
      }
      const phrase = Array.from({ length: wordCount }, (_, i) => words[i].trim().toLowerCase()).join(" ");
      onImport(phrase);
    } catch (e) {
      console.error(e);
      setError(e.message || "Error while importing.");
    }
  }

  function handleImportKey() {
    try {
      setError("");
      onImportKey(privateKey);
    } catch (e) {
      setError(e.message || "That private key isn't valid.");
    }
  }

  const back = mode === "choose" ? (existing ? onClose : onBack) : () => { setMode("choose"); setError(""); };
  const head = {
    choose: [WalletIcon, "p", "Your wallet", "Start fresh or bring one you have"],
    phrase: [KeyRound, "c", "Recovery phrase", "12 or 24 words, in order"],
    key: [KeyRound, "c", "Private key", "From another wallet"],
  }[mode];
  const HeadIcon = head[0];

  return (
    <div className="modal-card onb-card">
      <OnboardSteps at={1} />
      <div className="panel-head">
        <span className={`panel-head-icon tone-${head[1]}`} aria-hidden="true"><HeadIcon size={18} strokeWidth={1.9} /></span>
        <div className="panel-head-text">
          <div className="panel-head-title">{head[2]}</div>
          <div className="panel-head-sub">{head[3]}</div>
        </div>
        {back && (
          <button type="button" className="contacts-close" onClick={back} aria-label={mode === "choose" ? "Close" : "Back"}>
            {mode === "choose" ? <X size={18} /> : <ArrowLeft size={18} />}
          </button>
        )}
      </div>

      {mode === "choose" && (
        <div className="onb-choices">
          <button
            type="button"
            className="onb-choice is-main"
            onClick={async () => {
              try { setError(""); await onCreate(); } catch (e) { setError(e.message); }
            }}
          >
            <span className="settings-row-icon tone-p"><Sparkles size={16} strokeWidth={1.9} /></span>
            <span className="onb-choice-text"><b>Create a new wallet</b><span>A new address, ready in seconds.</span></span>
            <ChevronRight size={16} className="onb-chev" />
          </button>
          <button type="button" className="onb-choice" onClick={() => { setMode("phrase"); setError(""); setWords({}); }}>
            <span className="settings-row-icon tone-c"><List size={16} strokeWidth={1.9} /></span>
            <span className="onb-choice-text"><b>Import a recovery phrase</b><span>12 or 24 words from another wallet.</span></span>
            <ChevronRight size={16} className="onb-chev" />
          </button>
          <button type="button" className="onb-choice" onClick={() => { setMode("key"); setError(""); setPrivateKey(""); }}>
            <span className="settings-row-icon tone-c"><KeyRound size={16} strokeWidth={1.9} /></span>
            <span className="onb-choice-text"><b>Import a private key</b><span>One address, from its private key.</span></span>
            <ChevronRight size={16} className="onb-chev" />
          </button>
        </div>
      )}

      {mode === "phrase" && (
        <div className="seed-import">
          <div className="seed-length">
            <button type="button" className={wordCount === 12 ? "active" : ""} onClick={() => { setWordCount(12); setWords({}); setError(""); }}>12 words</button>
            <button type="button" className={wordCount === 24 ? "active" : ""} onClick={() => { setWordCount(24); setWords({}); setError(""); }}>24 words</button>
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
                    setWords(current => ({ ...current, [i]: value }));
                    setError("");
                  }}
                />
              </div>
            ))}
          </div>
          <button type="button" className="confirm" onClick={handleImport}>Import wallet</button>
        </div>
      )}

      {mode === "key" && (
        <div className="seed-import">
          <div className="onb-key-field">
            <input
              type={showKey ? "text" : "password"}
              autoComplete="off"
              spellCheck="false"
              value={privateKey}
              onChange={e => { setPrivateKey(e.target.value.trim()); setError(""); }}
              placeholder="0x… (64 hexadecimal characters)"
              aria-label="Private key"
            />
            <button type="button" className="unlock-password-eye" onClick={() => setShowKey(v => !v)} aria-label={showKey ? "Hide the key" : "Show the key"}>
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="onb-note">A private key brings one address, without a recovery phrase. Keep a copy of it: Lyra can't recover it.</div>
          <button type="button" className="confirm" onClick={handleImportKey}>Import wallet</button>
        </div>
      )}

      {error && <div className="seed-error">{error}</div>}

      <div className="onb-safe">
        <span className="settings-row-icon tone-t"><ShieldCheck size={15} strokeWidth={1.9} /></span>
        <span>Your key is encrypted on this device. Never share your recovery phrase or private key: Lyra will never ask for them.</span>
      </div>
    </div>
  );
}
