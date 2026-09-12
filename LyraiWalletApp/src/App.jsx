import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ethers } from "ethers";
import { gsap } from "gsap";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Send, WalletCards, UserRound, Pencil, Plus, X, History, PieChart, LineChart, Coins, Settings, KeyRound, Trash2, Eye, EyeOff, Fingerprint, Lock, ArrowRight, RotateCcw, Info, Link, Search, Download, Upload } from "lucide-react";
import { API_BASE_URL, NETWORKS, DEFAULT_NETWORK, getNetworkByKey, TOKENS_BY_NETWORK, getActiveTokens, ERC20_ABI, WNATIVE_BY_NETWORK, WETH9_ABI, getDefiContracts, LIFI_QUOTE_API_URL, UNISWAP_V3_FEE_TIERS, UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_ROUTER_ABI, UNISWAP_V3_QUOTER_ABI, AAVE_POOL_ABI, AAVE_DATA_PROVIDER_ABI, DEFAULT_SLIPPAGE, explorerTx, KYBERSWAP_API_BASE, NATIVE_PSEUDO_ADDRESS, KYBERSWAP_CLIENT_ID } from "./config";
import QRCode from "qrcode";
import { QRCodeDisplay } from "./QRCodeDisplay";
import { isWebAuthnAvailable, registerBiometric, getBiometricAesKey, confirmBiometricPresence, encryptWithKey, decryptWithKey } from "./Biometric";
import { CircleMenu } from "./CircleMenu";

function shortAddress(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

// Traveling border light (replaces the old conic-gradient border-beam-spin):
// measures the element and exposes its exact pixel outline as a CSS custom
// property so a small glow can ride that path via offset-path/offset-distance.
function useBorderPath() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
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
    return () => ro.disconnect();
  }, []);

  return ref;
}

// Split version of the border path above: instead of one loop starting at
// the top-left corner, this exposes two mirrored halves that both start at
// the top-middle point and race down to the bottom-middle point, one via
// the left edge, one via the right, so two lights can travel outward from
// the middle and meet again at the bottom, like the original hold-to-confirm
// -> ticket reveal.
function useSplitBorderPath() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
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
    return () => ro.disconnect();
  }, []);

  return ref;
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
      { t: now, balance: balanceStr, defi: defiValueXpl, network: networkKey }
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
  return history.filter(p => (p.network || DEFAULT_NETWORK.key) === networkKey);
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

// Renders the center-out dot wipe used by the Hold-to-Confirm button.
// Driven imperatively via drawRef (a plain ref the parent's
// requestAnimationFrame loop calls directly with a 0-100 progress
// value) instead of a `progress` prop, so a hold gesture never runs
// through React state/re-render at all, see handleHoldStart. Passing
// progress as normal render-driven state was forcing the entire
// (huge) App component to re-render on every tick of the hold,
// which is what made the animation look janky instead of fluid.
function HoldSquares({ drawRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const ctx = canvas.getContext("2d");

    function draw(progress, now = 0) {
      const rect = canvas.parentElement.getBoundingClientRect();
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

      if (progress <= 0) return;

      const p = progress / 100;
      const CELL = 4;
      const FRONT = 0.55;
      const cols = Math.ceil(w / CELL);
      const rows = Math.ceil(h / CELL);
      const maxR = CELL * 1.25;
      const half = w / 2;
      const halfH = h / 2;

      ctx.fillStyle = "#6D4FD1"; // --accent-deep, same as on the website

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cx = (col + 0.5) * CELL;
          const cy = (row + 0.5) * CELL;

          // A true 45°-rotated square growing from the center: raw
          // Manhattan distance in actual pixels (not pre-stretched per
          // axis), so it expands at the exact same rate in every
          // diagonal direction, a genuinely regular, symmetric
          // diamond, not an ellipse forced to fit the button's aspect
          // ratio. Normalizing by (halfW + halfH) just makes dist hit
          // 1 exactly at the button's real corners. Since the button
          // is short and wide, the near top/bottom edges are reached
          // early and the far left/right edges late, that's an
          // honest side effect of the button's shape, not something
          // this math tries to correct for.
          const dx = Math.abs(cx - half);
          const dy = Math.abs(cy - halfH);
          const dist = (dx + dy) / (half + halfH);
          const ripple = Math.sin(row * 0.9 + col * 0.35 + now * 0.0035) * 0.055;
          const threshold = Math.max(0, Math.min(1, dist + ripple)) * (1 - FRONT);

          let t = (p - threshold) / FRONT;
          t = Math.max(0, Math.min(1, t));
          t = t * t * (3 - 2 * t);

          if (t <= 0.02) continue;

          // Once a dot has grown in, it keeps a small continuous
          // breathing pulse (scaled by t so it fades in with the dot,
          // never affects still-hidden ones), matches the reference's
          // shimmering halftone feel instead of freezing solid.
          const breathe = 1 + Math.sin(now * 0.005 + col * 0.6 + row * 0.4) * 0.12 * t;
          const radius = maxR * t * breathe;

          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    draw(0);
    drawRef.current = draw;
    return () => {
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
  const RPC = useMemo(() => new ethers.JsonRpcProvider(activeNetwork.rpcUrl, activeNetwork.chainId), [activeNetwork]);
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
  const [showWallet, setShowWallet] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
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
        const [gasEstimate, feeData] = await Promise.all([
          RPC.estimateGas({
            from: wallet?.address,
            to: sendTo,
            value: ethers.parseEther(sendAmount)
          }),
          RPC.getFeeData()
        ]);
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
  }, [showSend, sendTo, sendAmount, activeNetworkKey, wallet?.address]);

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
  const [qrCode, setQrCode] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [waveActive, setWaveActive] = useState(false);
  const holdIntervalRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const headerMenuRef = useRef(null);
  const chatEmptyPathRef = useBorderPath();
  const chatScrollRef = useRef(null);
  const importContactsInputRef = useRef(null);

  // Transaction history (hamburger menu)
  const [showTxHistory, setShowTxHistory] = useState(false);
  const [txHistoryList, setTxHistoryList] = useState([]);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txHistoryError, setTxHistoryError] = useState("");
  const [txHistoryTab, setTxHistoryTab] = useState("send");
  const txHistoryRows = useMemo(
    () => buildTxRows(txHistoryList, wallet?.address, defi).filter(r => r.category === txHistoryTab),
    [txHistoryList, wallet?.address, defi, txHistoryTab]
  );

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [biometricSupported] = useState(() => isWebAuthnAvailable());
  const [biometricEnabled, setBiometricEnabled] = useState(() => !!loadBiometricRecord());
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState("");
  const sessionKeyCacheRef = useRef(null); 
  const [autoLockMinutes, setAutoLockMinutes] = useState(() => {
    const saved = localStorage.getItem("plasma_autolock_v1");
    return saved ? Number(saved) : 10;
  });

  // Export private key
  const [showExportKey, setShowExportKey] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportedKey, setExportedKey] = useState(null);
  const [exportError, setExportError] = useState("");
  const [revealExportedKey, setRevealExportedKey] = useState(false);

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
  const [multiTicket, setMultiTicket] = useState(null); 
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
  }, [messages.length, busy, qrCode, qrLoading, qrError, collapsedTickets.length]);

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
        label: `Send ${sendAmount} ${activeNetwork.nativeSymbol}${sendTo ? ` to ${shortAddress(sendTo)}` : ""}`,
        data: { sendTo, sendAmount, sendAmountUSD, sendPriceUSD, suggestedContact }
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
        setSendAmountUSD(target.data.sendAmountUSD || "");
        setSendPriceUSD(target.data.sendPriceUSD || null);
        setSuggestedContact(target.data.suggestedContact || null);
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

    const privateKey = await decryptPrivateKey(
      saved,
      unlockPassword
    );

    const w = new ethers.Wallet(privateKey);

    if (
      w.address.toLowerCase() !==
      saved.address.toLowerCase()
    ) {
      throw new Error("Invalid wallet.");
    }

    setUnlockedPrivateKey(privateKey);

    sessionKeyCacheRef.current = privateKey;

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

    const privateKey = await decryptPrivateKey(saved, exportPassword);
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

    const { credentialId, supportsPrf, prfSalt } = await registerBiometric(wallet.address);

    if (supportsPrf) {
      const aesKey = await getBiometricAesKey(credentialId, prfSalt);
      if (!aesKey) throw new Error("Couldn't derive a biometric key, try again.");
      const { iv, ciphertext } = await encryptWithKey(aesKey, unlockedPrivateKey);
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

    if (record.tier === "prf") {
      const aesKey = await getBiometricAesKey(record.credentialId, record.prfSalt);
      if (!aesKey) throw new Error("Biometric key unavailable. Use your password instead.");
      privateKey = await decryptWithKey(aesKey, record.iv, record.ciphertext);
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
    const defiValueXpl = xplPriceUSD ? stableUsdValue / xplPriceUSD : 0;

        setPortfolioHistory(recordPortfolioSnapshot(b, defiValueXpl, activeNetworkKey));
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

  function stepsForDefiTicket(ticket) {
    if (ticket.feature === "swap") return buildSwapSteps(ticket);
    if (ticket.feature === "staking") return buildStakeSteps(ticket);
    if (ticket.feature === "bridge") return buildBridgeSteps(ticket);
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

 async function executeSwapTicket(signer, ticket) {
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
    return signer.sendTransaction(swapTxRequest);
  });
  await tx.wait();
  advanceExecutionTo(steps.length); // sentinel

  return tx;
}

async function executeStakeTicket(signer, ticket) {
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
  advanceExecutionTo(buildStakeSteps(ticket).length); // sentinel: guarantees "all done"
  return tx;
}

async function executeUnstakeTicket(signer, ticket) {
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
  advanceExecutionTo(buildStakeSteps(ticket).length); // sentinel: guarantees "all done"
  return tx;
}

  async function executeBridgeTicket(signer, ticket) {
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
    return signer.sendTransaction(bridgeTxRequest);
  });
  await tx.wait();
  advanceExecutionTo(buildBridgeSteps(ticket).length); // sentinel: guarantees "all done"
  return tx;
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

    const featureLabel = { swap: "Swap", bridge: "Bridge", staking: "Stake" }[defiTicket.feature] || "Transaction";
    setExecutionLabel(featureLabel);
    setExecutionSteps(stepsForDefiTicket(defiTicket));
    setExecutionStepIndex(-1);
    beginExecutionTimer();

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
            tx = await signer.sendTransaction({
              to: recipient,
              value: ethers.parseEther(String(amountToUse))
            });
          } else {
            const token = tokens[step.asset];
            if (!token?.address) throw new Error(`${stepLabel}: ${step.asset} isn't supported.`);
            const contract = new ethers.Contract(token.address, ERC20_ABI, signer);
            tx = await contract.transfer(recipient, ethers.parseUnits(String(amountToUse), token.decimals));
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
          await new Promise(resolve => setTimeout(resolve, 700));
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
      await new Promise(resolve => setTimeout(resolve, 700));
      setStepSweepActive(true);
      setTimeout(() => setStepSweepActive(false), 2400);
      setMultiTicketDone(true);

      // Ticket stays open with the recap fully shown, the user closes it
      // manually (Done button) once they've seen it.

    } finally {
      await finishExecution();
    }
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

  setBusy(true);
  setStatus("Preparing the transaction…");
  setExecutionLabel("Send");
  setExecutionSteps([`Send ${activeNetwork.nativeSymbol}`]);
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

    const value = ethers.parseEther(sendAmount);

    const current = await RPC.getBalance(signer.address);

    if (current < value) {
      throw new Error(`Insufficient ${activeNetwork.nativeSymbol} balance for this transfer.`);
    }

    setStatus("Sending the transaction…");

    const tx = await signer.sendTransaction({
      to: sendTo,
      value
    });

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
    advanceExecutionTo(1);

    setStatus("Transaction confirmed");

   setMessages(m => [...m, { role: "ai", text: `✅ Transaction confirmed on ${activeNetwork.name}. ${fmtXpl(value)} ${activeNetwork.nativeSymbol} were sent.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

    await refreshBalance(signer.address);

    setShowDetails(false);
    // Ticket stays open (showSend stays true) with the checklist
    // fully checked, the user closes it manually (Done button).

  } finally {
    await finishExecution();
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
      {
        role: "ai",
        text: `❌ ${e.message}`
      }
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

    case "RECEIVE_XPL":
  if (!wallet?.address) {
    setMessages(m => [
      ...m,
      { role: "ai", text: "You need to create or import a wallet first." }
    ]);
    return;
  }

  setQrError(null);
  setQrCode(null);
  setQrLoading(true);

  generateAddressQRCode(wallet.address)
    .then(result => setQrCode(result))
    .catch(e => {
      console.error(e);
      setQrError("Couldn't generate the QR code.");
    })
    .finally(() => setQrLoading(false));

  setToast("Here's your address to receive funds.");
  break;

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
            text: `❌ ${e.message}`
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
      setSendAmount(amount);
      setSendAmountUSD(action.amountUSD || "");
      setSendPriceUSD(action.priceUSD || null);

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
      setQrCode(null);
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

    case "SWAP_XPL":
    case "BRIDGE_XPL":
    case "STAKE_XPL":
    case "UNSTAKE_XPL":

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

  setQrCode(null);
  setQrError(null);
  setQrLoading(false);

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
              text: `❌ ${e.message}`
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
              <div className="bubble">
                {m.role === "ai" ? <TypewriterText text={m.text} /> : m.text}
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
                  <span className="thinking-shimmer">Lyra is thinking…</span>
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

{(qrLoading || qrError || qrCode) && (
  <QRCodeDisplay data={qrCode} isLoading={qrLoading} error={qrError} />
)}

        </section>

        <div className="inputbar">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && input.trim()) { handleIntent(input.trim()); setInput(""); } }}
            placeholder="Message Lyra…" />
          <button className="send" onClick={() => { if(input.trim()){ handleIntent(input.trim()); setInput(""); }}}>
            <Send size={16}/>
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
    <div className="ticket-fullscreen-panel">

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
      Transaction · Send {activeNetwork.nativeSymbol}
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
              {fmtXpl(ethers.parseEther(sendAmount || "0"))} {activeNetwork.nativeSymbol}
            </strong>
          </div>

          <div className="transaction-row">
            <span>Rate</span>
            <strong>
              1 {activeNetwork.nativeSymbol} = {Number(sendPriceUSD).toFixed(6)} $
            </strong>
          </div>
        </>
      ) : (
        <div className="transaction-row">
          <span>Amount sent</span>
          <strong>
            {sendAmount || "0"} {activeNetwork.nativeSymbol}
          </strong>
        </div>
      )}

      <div className="transaction-row recipient-row">
        <span>Recipient</span>

        <strong title={sendTo}>
          {shortAddress(sendTo)}
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


    {showDetails && (
      <div className="transaction-details">

        <div className="detail-row">
          <span>Asset</span>
          <span>{activeNetwork.nativeSymbol}</span>
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
          <span>{activeNetwork.nativeSymbol} amount</span>
          <span>
            {sendAmount
              ? `${fmtXpl(ethers.parseEther(sendAmount))} ${activeNetwork.nativeSymbol}`
              : "—"
            }
          </span>
        </div>

        {sendPriceUSD && (
          <div className="detail-row">
            <span>Conversion rate</span>
            <span>
              1 {activeNetwork.nativeSymbol} = {Number(sendPriceUSD).toFixed(6)} $
            </span>
          </div>
        )}

        <div className="detail-row">
          <span>Balance before</span>
          <span>
            {fmtXpl(balance)} {activeNetwork.nativeSymbol}
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
            {sendAmount
              ? sendFeeEstimate !== null
                ? `${fmtXpl(ethers.parseEther(sendAmount) + sendFeeEstimate, 8)} ${activeNetwork.nativeSymbol}`
                : `${fmtXpl(ethers.parseEther(sendAmount))} ${activeNetwork.nativeSymbol} + fees`
              : "—"
            }
          </span>
        </div>

      </div>
    )}


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
            text: completedSummaryLine({ kind: "send", amount: sendAmount, asset: activeNetwork.nativeSymbol, recipient: sendTo }),
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
      {{ swap: "Swap", bridge: "Bridge", staking: "Staking" }[defiTicket.feature] || "DeFi"}
      {" · "}{defiTicket.amount || "?"} {defiTicket.asset || activeNetwork.nativeSymbol}
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

        <div className="transaction-row">
          <span>Estimated fees</span>
          <strong>{defiTicket.fees || "—"}</strong>
        </div>

        <div className={`transaction-row risk-row risk-${defiTicket.riskLevel}`}>
          <span>Risk level</span>
          <strong>{defiTicket.riskLevel || "unknown"}</strong>
        </div>

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
            : "The operation will be signed locally with your encrypted wallet.")
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
                destinationChainKey: defiTicket.destinationChainKey
              }),
              txUrl: txHash ? explorerTx(txHash, activeNetwork) : null
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
          <span className="hold-content">Hold to Confirm</span>
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

          {expanded && (
            <div className="multi-step-body">

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

            </div>
          )}
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

    </div>
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

            const encrypted =
              await encryptPrivateKey(
                pendingPrivateKey,
                newPassword
              );

            const encryptedWallet = {
              address: new ethers.Wallet(
                pendingPrivateKey
              ).address,
              ...encrypted
            };

            localStorage.setItem(
              "plasma_wallet_v2",
              JSON.stringify(encryptedWallet)
            );

            setWallet({
              address: encryptedWallet.address
            });

            setUnlockedPrivateKey(pendingPrivateKey);

            sessionKeyCacheRef.current = pendingPrivateKey;

            setLocked(false);
            setShowPasswordSetup(false);
            setPendingPrivateKey(null);

            setNewPassword("");
            setConfirmPassword("");

            const successText =
              passwordSetupMode === "reset"
                ? "Password reset successfully. Your wallet is unlocked."
                : passwordSetupMode === "import"
                ? `Wallet imported and secured: ${shortAddress(encryptedWallet.address)}.`
                : "Wallet secured successfully. Your private key is now encrypted locally.";

            setToast(successText);

            setPasswordSetupMode("create");

            await refreshBalance(
              encryptedWallet.address
            );

          } catch (e) {

            console.error(e);

            setPasswordSetupError(
              "Couldn't secure the wallet."
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
        <div>
          <div className="contacts-title">Settings</div>
          <div className="contacts-subtitle">{wallet?.address ? shortAddress(wallet.address) : ""}</div>
        </div>
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
          <select
            className="settings-select"
            value={autoLockMinutes}
            onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
          >
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={0}>Never</option>
          </select>
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
    biometricEnabled ? (
      <button type="button" className="settings-toggle-btn" onClick={disableBiometric}>
        Disable
      </button>
    ) : (
      <button type="button" className="settings-toggle-btn" onClick={enableBiometric} disabled={biometricBusy}>
        {biometricBusy ? "…" : "Enable"}
      </button>
    )
  )}
</div>
{biometricError && <div className="seed-error">{biometricError}</div>}

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

{showTxHistory && (
  <div
    className="contacts-overlay"
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) {
        setShowTxHistory(false);
      }
    }}
  >
    <div className="contacts-panel">

      <div className="contacts-header">
        <div>
          <div className="contacts-title">Transactions history</div>
          <div className="contacts-subtitle">
            {wallet?.address ? shortAddress(wallet.address) : ""}
          </div>
        </div>

        <button
          type="button"
          className="contacts-close"
          onClick={() => setShowTxHistory(false)}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="tx-history-tabs">
        {[
          { key: "send", label: "Send/Receive" },
          { key: "swap", label: "Swap" },
          { key: "stake", label: "Stake" },
          { key: "bridge", label: "Bridge" }
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            className={txHistoryTab === tab.key ? "active" : ""}
            onClick={() => setTxHistoryTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="contacts-list">

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

      </div>

    </div>
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

      <div className="multi-summary-steps">
        {steps.map((step, i) => (
          <div className="multi-summary-step" key={i}>
            <div className="multi-summary-step-line">
              <span className="multi-summary-step-num">{i + 1}.</span>
              <span className="multi-summary-step-text">{step.text}</span>
            </div>
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
        Done
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
        Mainnet. The private key is encrypted locally
        in this browser. Never share your recovery
        phrase.
      </p>

    </div>
  );
}
