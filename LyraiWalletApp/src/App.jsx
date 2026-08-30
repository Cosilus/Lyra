import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ethers } from "ethers";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Send, WalletCards, Menu, UserRound, Pencil, Plus, X, History, PieChart, LineChart, Coins, Settings, KeyRound, Trash2, Eye, EyeOff, Fingerprint, Lock, ArrowRight, RotateCcw } from "lucide-react";
import { API_BASE_URL, NETWORKS, DEFAULT_NETWORK, getNetworkByKey, TOKENS_BY_NETWORK, getActiveTokens, ERC20_ABI, WNATIVE_BY_NETWORK, WETH9_ABI, getDefiContracts, LIFI_QUOTE_API_URL, UNISWAP_V3_FEE_TIERS, UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_ROUTER_ABI, UNISWAP_V3_QUOTER_ABI, AAVE_POOL_ABI, AAVE_DATA_PROVIDER_ABI, DEFAULT_SLIPPAGE, explorerTx } from "./config";
import QRCode from "qrcode";
import { QRCodeDisplay } from "./QRCodeDisplay";
import { isWebAuthnAvailable, registerBiometric, getBiometricAesKey, confirmBiometricPresence, encryptWithKey, decryptWithKey } from "./biometric";

function shortAddress(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
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
    color: { dark: "#150E20", light: "#F3E7D0" } // --void sur --beige, cohérent avec la palette
  });
  return { data: address, size, output };
}

function stepSummaryLine(step) {
  const amt = `${step.amountIsEstimate ? "≈ " : ""}${step.amount ?? "…"} ${step.asset || ""}`.trim();

  switch (step.kind) {
    case "send":
      return `Send ${amt}${step.recipient ? ` to ${step.contactName || shortAddress(step.recipient)}` : ""}`;
    case "swap":
      return `Swap ${amt} → ${step.ticket?.estimatedReceive || "…"} ${step.tokenOutSymbol || ""}`;
    case "stake":
      return `Stake ${amt} on ${step.ticket?.platform || "…"}`;
    case "unstake":
      return `Withdraw ${amt} from ${step.ticket?.platform || "…"}`;
    case "bridge":
      return `Bridge ${amt} to ${step.destinationChainKey || "…"}`;
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

// Les anciens points enregistrés avant l'ajout du multi-réseau n'ont
// pas de champ "network" — on les rattache à DEFAULT_NETWORK pour ne
// pas les faire disparaître silencieusement de l'historique Plasma.
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

function HoldSquares({ progress }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = rect.width || 260;
    const h = rect.height || 50;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (progress <= 0) return;

    const p = progress / 100;
    const CELL = 9;
    const FRONT = 0.30;
    const cols = Math.ceil(w / CELL);
    const rows = Math.ceil(h / CELL);
    const maxR = CELL * 1.25;
    const half = w / 2;

    ctx.fillStyle = "#6D4FD1"; // --accent-deep, comme sur le site

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = (col + 0.5) * CELL;
        const cy = (row + 0.5) * CELL;

        const dist = Math.abs(cx - half) / half;
        const stagger = ((row % 3) - 1) * 0.02;
        const threshold = Math.max(0, Math.min(1, dist + stagger)) * (1 - FRONT);

        let t = (p - threshold) / FRONT;
        t = Math.max(0, Math.min(1, t));
        t = t * t * (3 - 2 * t);

        if (t <= 0.02) continue;

        const radius = maxR * t;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [progress]);

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
  const [showDetails, setShowDetails] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
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
  const [showMenu, setShowMenu] = useState(false);
  const [showNetworkMenu, setShowNetworkMenu] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
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
  const networkSwitchRef = useRef(null);

  // Historique des transactions (menu hamburger)
  const [showTxHistory, setShowTxHistory] = useState(false);
  const [txHistoryList, setTxHistoryList] = useState([]);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txHistoryError, setTxHistoryError] = useState("");

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
  const [defiTicket, setDefiTicket] = useState(null); 
  const [multiTicket, setMultiTicket] = useState(null); 
  const [collapsedTickets, setCollapsedTickets] = useState([]); 
  const [expandedSteps, setExpandedSteps] = useState({}); 

  // Execution progress checklist — real progress of the on-chain
  // sub-actions the AI is running under a single "Hold to Confirm".
  const [executionSteps, setExecutionSteps] = useState([]); // string[]
  const [executionStepIndex, setExecutionStepIndex] = useState(-1); // -1 = none done yet
  const [executionLabel, setExecutionLabel] = useState("");

  // Once true, the ticket's "top" (title/summary/details/warning)
  // collapses away, like the deposit demo video's Before card sliding
  // up — leaving only the checklist, grown to fill the panel.
  const [ticketTopCollapsed, setTicketTopCollapsed] = useState(false);

  function resetExecutionProgress() {
    setExecutionSteps([]);
    setExecutionStepIndex(-1);
    setExecutionLabel("");
    setTicketTopCollapsed(false);
    setWaveActive(false);
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
// activeNetworkKey changes — RPC/tokens/defi above have already been
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
  // the checklist first appears — mirrors the video's timing where
  // the Before card slides away right after the After list starts.
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
}, [busy, executionSteps.length, ticketTopCollapsed]);

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
        `${API_BASE_URL}/api/transactions/${wallet.address}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Couldn't fetch the transaction history.");
      }

      setTxHistoryList(data.transactions || []);
    } catch (e) {
      console.error(e);
      setTxHistoryError(e.message || "Erreur lors du chargement.");
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
      const response = await fetch(`${API_BASE_URL}/api/price/xpl`);
      const data = await response.json();

      if (cancelled) return;

      if (!response.ok) {
        // On log désormais la vraie raison de l'échec (429 CoinGecko,
        // backend down, etc.) au lieu de disparaître en silence.
        console.error("XPL price endpoint error:", response.status, data?.error);
        return;
      }

      setXplPriceUSD(data.priceUSD);
      // data.stale === true si le backend sert son dernier prix connu
      // faute d'avoir pu recontacter CoinGecko à temps.
    } catch (e) {
      console.error("XPL price unavailable:", e);
    }
  }

  fetchPrice();
  const interval = setInterval(fetchPrice, 2 * 60 * 1000);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, []);

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
  if (!showMenu && !showNetworkMenu) return;

  function handlePointerDown(e) {
    if (showMenu && headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
      setShowMenu(false);
    }
    if (showNetworkMenu && networkSwitchRef.current && !networkSwitchRef.current.contains(e.target)) {
      setShowNetworkMenu(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      setShowMenu(false);
      setShowNetworkMenu(false);
    }
  }

  document.addEventListener("mousedown", handlePointerDown);
  document.addEventListener("keydown", handleKeyDown);

  return () => {
    document.removeEventListener("mousedown", handlePointerDown);
    document.removeEventListener("keydown", handleKeyDown);
  };
}, [showMenu, showNetworkMenu]);

function lockWallet() {
  setUnlockedPrivateKey(null);
  setLocked(true);
  setShowUnlock(true);
  setShowMenu(false);
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
      throw new Error("Wallet invalide.");
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
    setToast("Network unavailable — couldn't refresh the balance.");
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
    const isNativeOut = ticket.tokenOutSymbol === activeNetwork.nativeSymbol;
    const steps = [];
    if (isNativeIn) steps.push(`Wrap ${activeNetwork.nativeSymbol}`);
    steps.push(`Approve ${ticket.asset}`);
    steps.push("Get swap quote");
    steps.push(`Swap ${ticket.asset} → ${ticket.tokenOutSymbol || "token"}`);
    if (isNativeOut) steps.push(`Unwrap to ${activeNetwork.nativeSymbol}`);
    return steps;
  }

  function buildStakeSteps(ticket) {
    if (ticket.intent === "UNSTAKE_XPL") {
      return [`Withdraw ${ticket.asset} from Aave`];
    }
    return [`Approve ${ticket.asset}`, `Deposit ${ticket.asset} to Aave`];
  }

  function buildBridgeSteps(ticket) {
    return [
      "Get bridge quote",
      `Approve ${ticket.asset}`,
      `Bridge ${ticket.asset} to ${ticket.destinationChainKey || "destination chain"}`
    ];
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
  // of steps — e.g. an allowance that turned out to already be
  // sufficient — completes without its own tx to wait on).
  function advanceExecutionTo(index) {
    setExecutionStepIndex(i => Math.max(i, index));
  }

  async function executeSwapTicket(signer, ticket) {
  const assetInSymbol = ticket.asset;
  const assetOutSymbol = ticket.tokenOutSymbol;

  const isNativeIn = assetInSymbol === activeNetwork.nativeSymbol;
  const isNativeOut = assetOutSymbol === activeNetwork.nativeSymbol;

  const tokenIn = isNativeIn ? nativeWrapped : tokens[assetInSymbol];
  const tokenOut = isNativeOut ? nativeWrapped : tokens[assetOutSymbol];

  if (!tokenIn?.address || tokenIn.address === ethers.ZeroAddress) {
    throw new Error(`${assetInSymbol} is not supported for swaps yet on ${activeNetwork.name} (missing or unsupported address).`);
  }
  if (!tokenOut?.address || tokenOut.address === ethers.ZeroAddress) {
    throw new Error("The output token for this swap isn't configured (missing or unsupported address).");
  }

  // Cursor-based progress: each real action bumps the checklist by
  // exactly one, in the same order buildSwapSteps() lists them, so
  // the substeps and the "all done" state can never fall out of
  // sync with however many optional steps (wrap/unwrap) this
  // particular swap actually needs.
  const steps = buildSwapSteps(ticket);
  let stepCursor = 0;
  const nextStep = () => {
    advanceExecutionTo(stepCursor);
    stepCursor += 1;
  };

  const amountIn = ethers.parseUnits(String(ticket.amount), tokenIn.decimals);
  const signerAddress = await signer.getAddress();

  if (isNativeIn) {
    setStatus(`Wrapping ${activeNetwork.nativeSymbol} into ${nativeWrapped.symbol}…`);
    const wrapped = new ethers.Contract(nativeWrapped.address, WETH9_ABI, signer);
    const wrapTx = await wrapped.deposit({ value: amountIn });
    await wrapTx.wait();
    nextStep();
  }

  setStatus(`Approving ${assetInSymbol}…`);
  await ensureAllowance(signer, tokenIn.address, defi.uniswapV3.router, amountIn);
  nextStep();

  setStatus("Looking up the Uniswap V3 pool…");
  const found = await findUniswapV3Pool(tokenIn.address, tokenOut.address);
  if (!found) {
    throw new Error(`No Uniswap V3 pool found on ${activeNetwork.name} for ${assetInSymbol}/${assetOutSymbol}.`);
  }

  setStatus("Getting a quote…");
  const quoter = new ethers.Contract(defi.uniswapV3.quoter, UNISWAP_V3_QUOTER_ABI, RPC);
  const slippage = ticket.slippage ?? DEFAULT_SLIPPAGE;
  let amountOutMinimum = 0n;

  try {
    const quoteResult = await quoter.quoteExactInputSingle.staticCall({
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amountIn,
      fee: found.fee,
      sqrtPriceLimitX96: 0n
    });
    const expectedOut = quoteResult[0];
    amountOutMinimum = expectedOut - (expectedOut * BigInt(Math.round(slippage * 10000))) / 10000n;
  } catch (e) {
    console.error("Uniswap quote unavailable, proceeding without a minimum:", e);
  }
  nextStep();

  const router = new ethers.Contract(defi.uniswapV3.router, UNISWAP_V3_ROUTER_ABI, signer);

  setStatus("Sending the swap…");
  const swapTx = await router.exactInputSingle({
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    fee: found.fee,
    recipient: signerAddress,
    amountIn,
    amountOutMinimum,
    sqrtPriceLimitX96: 0n
  });
  await swapTx.wait();
  nextStep();

  if (!isNativeOut) {
    advanceExecutionTo(steps.length); // sentinel: guarantees "all done" regardless of step count
    return swapTx;
  }

  setStatus(`Unwrapping ${nativeWrapped.symbol} back into native ${activeNetwork.nativeSymbol}…`);
  const wrappedOut = new ethers.Contract(nativeWrapped.address, WETH9_ABI, signer);
  const receivedWrapped = await wrappedOut.balanceOf(signerAddress);
  const unwrapTx = await wrappedOut.withdraw(receivedWrapped);
  nextStep();
  advanceExecutionTo(steps.length); // sentinel
  return unwrapTx;
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
  setStatus(`Approving ${ticket.asset}…`);
  await ensureAllowance(signer, token.address, defi.aave.pool, amount);
  advanceExecutionTo(0);
  const pool = new ethers.Contract(defi.aave.pool, AAVE_POOL_ABI, signer);
  setStatus("Depositing to Aave…");
  const tx = await pool.supply(token.address, amount, await signer.getAddress(), 0);
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
  const amount = ethers.parseUnits(String(ticket.amount), token.decimals);
  const pool = new ethers.Contract(defi.aave.pool, AAVE_POOL_ABI, signer);
  setStatus("Withdrawing from Aave…");
  const tx = await pool.withdraw(token.address, amount, await signer.getAddress());
  await tx.wait();
  advanceExecutionTo(buildStakeSteps(ticket).length); // sentinel: guarantees "all done"
  return tx;
}

  async function executeBridgeTicket(signer, ticket) {
  const token = tokens[ticket.asset];
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
  const fromAddress = await signer.getAddress();

  setStatus("Fetching the LI.FI quote…");
  const url = new URL(LIFI_QUOTE_API_URL);
  url.searchParams.set("fromChain", String(activeNetwork.chainId));
  url.searchParams.set("toChain", ticket.destinationChainKey);
  url.searchParams.set("fromToken", token.address);
  url.searchParams.set("toToken", token.address);
  url.searchParams.set("fromAmount", amount.toString());
  url.searchParams.set("fromAddress", fromAddress);
  url.searchParams.set("slippage", String(ticket.slippage ?? DEFAULT_SLIPPAGE));

  const response = await fetch(url);
  const quote = await response.json();

  if (!response.ok || !quote.transactionRequest) {
    throw new Error(quote.error || "LI.FI couldn't provide a transaction for this bridge.");
  }
  advanceExecutionTo(0);

  setStatus(`Approving ${ticket.asset}…`);
  await ensureAllowance(
    signer,
    token.address,
    quote.estimate?.approvalAddress || defi.lifi.diamond,
    amount
  );
  advanceExecutionTo(1);

  setStatus("Sending the bridge transaction…");
  const tx = await signer.sendTransaction({
    to: quote.transactionRequest.to,
    data: quote.transactionRequest.data,
    value: quote.transactionRequest.value ? BigInt(quote.transactionRequest.value) : 0n
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

      // Ticket stays open with the checklist fully checked — the
      // user closes it manually (Done button) once they've seen it.

    } finally {
      await finishExecution();
    }
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

          const amountToUse = carriedAmount !== null ? carriedAmount : step.amount;
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
          setMessages(m => [...m, { role: "ai", text: `${stepLabel} sent (send). Hash: ${shortAddress(tx.hash)}` }]);
          await tx.wait();
          advanceExecutionTo(1);
          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} confirmed.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

          carriedAmount = null;

        } else if (step.kind === "swap") {
          const stepTicket = { ...step.ticket, amount: carriedAmount !== null ? carriedAmount : step.amount, asset: step.asset, tokenOutSymbol: step.tokenOutSymbol };
          const before = await balanceOfAsset(step.tokenOutSymbol);

          const tx = await executeSwapTicket(signer, stepTicket);
          setTxHash(tx.hash);
          setMessages(m => [...m, { role: "ai", text: `${stepLabel} sent (swap). Hash: ${shortAddress(tx.hash)}` }]);
          await tx.wait();

          const after = await balanceOfAsset(step.tokenOutSymbol);
          const received = after > before ? after - before : 0n;
          carriedAmount = Number(ethers.formatUnits(received, decimalsOfAsset(step.tokenOutSymbol)));

          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} confirmed and received ${carriedAmount} ${step.tokenOutSymbol}.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

        } else if (step.kind === "stake" || step.kind === "unstake") {
          const stepTicket = { ...step.ticket, amount: carriedAmount !== null ? carriedAmount : step.amount, asset: step.asset, intent: step.intent };
          const tx = step.kind === "unstake"
            ? await executeUnstakeTicket(signer, stepTicket)
            : await executeStakeTicket(signer, stepTicket);

          setTxHash(tx.hash);
          setMessages(m => [...m, { role: "ai", text: `${stepLabel} sent (${step.kind}). Hash: ${shortAddress(tx.hash)}` }]);
          await tx.wait();
          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} confirmed.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

          carriedAmount = null;

        } else if (step.kind === "bridge") {
          const stepTicket = { ...step.ticket, amount: carriedAmount !== null ? carriedAmount : step.amount, asset: step.asset, destinationChainKey: step.destinationChainKey };
          const tx = await executeBridgeTicket(signer, stepTicket);

          setTxHash(tx.hash);
          setMessages(m => [...m, { role: "ai", text: `${stepLabel} sent (bridge). Hash: ${shortAddress(tx.hash)}` }]);
          await tx.wait();
          setMessages(m => [...m, { role: "ai", text: `✅ ${stepLabel} confirmed.\n\n[View on Explorer Here](${explorerTx(tx.hash, activeNetwork)})` }]);

          carriedAmount = null;
        }
      }

      setStatus("Plan completed");
      setMessages(m => [...m, { role: "ai", text: `✅ All ${multiTicket.steps.length} steps completed on ${activeNetwork.name}.` }]);

      await refreshBalance(signer.address);
      await refreshTokenBalances(signer.address);

      // Ticket stays open with the checklist fully checked — the
      // user closes it manually (Done button) once they've seen it.

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
    // fully checked — the user closes it manually (Done button).

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
      contacts: loadContacts()
    })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erreur IA.");
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

    setStatus("Erreur");
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
    const response = await fetch(`${API_BASE_URL}/api/address-check/${address}`);
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
      setShowMenu(false);
      setShowContacts(true);
      break;

    case "OPEN_TRANSACTION_HISTORY":
      setShowMenu(false);
      openTxHistory();
      break;

    case "OPEN_SETTINGS":
      setShowMenu(false);
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
          `${API_BASE_URL}/api/transactions/${wallet.address}`
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

        setStatus("Erreur");
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

  setHoldProgress(0);

  const duration = 2000;
  const startTime = Date.now();

  holdIntervalRef.current = setInterval(() => {
    const elapsed = Date.now() - startTime;

    const progress = Math.min(
      (elapsed / duration) * 100,
      100
    );

    setHoldProgress(progress);

    if (progress >= 100) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;

      setHoldProgress(100);

      signAndSend()
        .catch((e) => {
          console.error(e);

          setStatus("Erreur");

          setMessages(m => [
            ...m,
            {
              role: "ai",
              text: `❌ ${e.message}`
            }
          ]);
        })
        .finally(() => {
          setHoldProgress(0);
        });
    }
  }, 20);
}

function handleHoldEnd() {
  if (holdIntervalRef.current) {
    clearInterval(holdIntervalRef.current);
    holdIntervalRef.current = null;
  }

  setHoldProgress(0);
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
    src="/logo.png"
    alt="Lyra"
  />
  <div className="name">Lyra</div>

  <div className="header-actions">
    {wallet && (
      <div className="header-menu" ref={headerMenuRef}>
        <button
          className={`menu-button ${showMenu ? "active" : ""}`}
          type="button"
          onClick={() => {
            setShowMenu(v => !v);
            setShowNetworkMenu(false);
          }}
          title="Menu"
          aria-label="Ouvrir le menu"
        >
          <Menu size={15} strokeWidth={1.8} />
        </button>

        {showMenu && (
          <div className="menu-dropdown">
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setContacts(loadContacts());
                setShowMenu(false);
                setShowContacts(true);
              }}
            >
              <UserRound size={17} strokeWidth={1.8} />
              <span>Contacts</span>
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setShowMenu(false);
                openTxHistory();
              }}
            >
              <History size={17} strokeWidth={1.8} />
              <span>Transactions history</span>
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setShowMenu(false);
                setShowSettings(true);
              }}
            >
              <Settings size={17} strokeWidth={1.8} />
              <span>Settings</span>
            </button>
          </div>
        )}
      </div>
    )}

    <div
  className={`network-switch ${showNetworkMenu ? "open" : ""}`}
  ref={networkSwitchRef}
>
  <button
    type="button"
    className="network-btn"
    aria-haspopup="true"
    aria-expanded={showNetworkMenu}
    onClick={() => {
      setShowNetworkMenu(v => !v);
      setShowMenu(false);
    }}
  >
    <span
      className="network-dot"
      style={{
        background: activeNetwork.color || "var(--success)"
      }}
    />

    {activeNetwork.name}

    <svg
      className="network-chevron"
      width="13"
      height="13"
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

  {showNetworkMenu && (
    <div className="network-menu" role="menu">
      {NETWORKS.map(net => (
        <button
          key={net.key}
          type="button"
          className={`network-item ${
            net.key === activeNetworkKey ? "active" : ""
          }`}
          role="menuitem"
          onClick={() => {
            switchNetwork(net.key);
            setShowNetworkMenu(false);
          }}
        >
          <span
            className="network-dot"
            style={{
              background:
                net.color || "var(--muted-dim)"
            }}
          />

          <span className="net-name">
            {net.name}
          </span>

        </button>
      ))}
    </div>
  )}
</div>
  </div>
</div>

            <div className="balance-label-row">
            <div className="balance-label">Available balance</div>
          </div>
          <div className="balance-row">
            <div className="balance">{fmtXpl(balance, 2)}</div>
            <div className="balance-usd">{activeNetwork.nativeSymbol}</div>
            <button
              type="button"
              className="balance-refresh"
              onClick={() => refreshBalance()}
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
      <span>
        ≈ {(
          Number(ethers.formatEther(balance || 0n)) * xplPriceUSD +
          Object.entries(tokens).reduce((sum, [symbol, token]) => {
            const walletAmt = Number(ethers.formatUnits(tokenBalances[symbol] || 0n, token.decimals));
            const stakedAmt = Number(ethers.formatUnits(stakedBalances[symbol] || 0n, token.decimals));
            return sum + walletAmt + stakedAmt;
          }, 0)
        ).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
      </span>
    )}

    {wallet?.address && (
      <span className="wallet-address-inline">
        <span className="address-dot" />
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

          {(Object.entries(tokens).some(([symbol]) => (tokenBalances[symbol] || 0n) > 0n) ||
            Object.entries(tokens).some(([symbol]) => (stakedBalances[symbol] || 0n) > 0n)) && (
            <div className="token-balances-row">
              {Object.entries(tokens)
                .filter(([symbol]) => (tokenBalances[symbol] || 0n) > 0n)
                .map(([symbol, token]) => (
                  <div className="token-balance-chip" key={symbol}>
                    <span className="token-dot" style={{ background: token.color }} />
                    {Number(ethers.formatUnits(tokenBalances[symbol] || 0n, token.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })} {symbol}
                  </div>
                ))}
              {Object.entries(tokens)
                .filter(([symbol]) => (stakedBalances[symbol] || 0n) > 0n)
                .map(([symbol, token]) => (
                  <div className="token-balance-chip staked-chip" key={`staked-${symbol}`} title="Staked on Aave">
                    <span className="token-dot" style={{ background: token.color }} />
                    {Number(ethers.formatUnits(stakedBalances[symbol] || 0n, token.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })} {symbol} staked
                  </div>
                ))}
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

        <section className="chat">
          {messages.length === 0 && !showSend && !defiTicket && !multiTicket && (
  <div className="chat-empty-card">
    <div className="chat-empty-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M21 11.5a8.5 8.5 0 0 1-11.8 7.8L4 21l1.7-5.2A8.5 8.5 0 1 1 21 11.5Z"/>
      </svg>
    </div>
    <div className="chat-empty-title">What would you like to do?</div>
    <div className="chat-empty-subtitle">Send, receive, swap or stake tokens.</div>
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

      {!busy && (
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

    {waveActive && (
  <div className="ticket-transition-wave">
    <span className="wave-ring wave-ring-a" />
    <span className="wave-ring wave-ring-b" />
  </div>
)}

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
    {!contactSaved ? (
      <button
        type="button"
        className="save-contact"
        onClick={() => {
  addContact(
    suggestedContact.name,
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
        ＋ Save as "{suggestedContact.name}"
      </button>
    ) : (
      <div className="contact-saved">
        ✓ Address saved as "{suggestedContact.name}".
      </div>
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
    >
      <span>
        {showDetails ? "Hide details" : "Show details"}
      </span>

      <span className={showDetails ? "chevron open" : "chevron"}>
        ↓
      </span>
    </button>


    {showDetails && (
      <div className="transaction-details">

        <div className="detail-row">
          <span>Actif</span>
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
            <span>Taux de conversion</span>
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
            Calculated when preparing
          </span>
        </div>

        <div className="detail-row">
          <span>Estimated total debited</span>
          <span>
            {sendAmount
              ? `${fmtXpl(ethers.parseEther(sendAmount))} ${activeNetwork.nativeSymbol} + fees`
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
      <div className="ticket-checklist-enter">
        <ExecutionChecklist
          label={executionLabel || "Send"}
          steps={executionSteps}
          currentIndex={executionStepIndex}
        />
        {!busy && (
          <button type="button" className="confirm confirm-compact" onClick={clearActiveTicket}>
            {executionStepIndex >= executionSteps.length ? "Done" : "Close"}
          </button>
        )}
        {!busy && txHash && executionStepIndex >= executionSteps.length && (
          <a
            className="txlink"
            href={explorerTx(txHash, activeNetwork)}
            target="_blank"
            rel="noreferrer"
          >
            View on Explorer
            <ExternalLink size={13} />
          </a>
        )}
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

        <HoldSquares progress={holdProgress} />

        <span className="hold-content">
          Hold to Confirm
        </span>

      </button>
    )}

  </div>
)}

{defiTicket && (
  <div className="ticket defi-ticket">

    {waveActive && (
  <div className="ticket-transition-wave">
    <span className="wave-ring wave-ring-a" />
    <span className="wave-ring wave-ring-b" />
  </div>
)}

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
          <span>Plateforme</span>
          <strong>{defiTicket.platform || "—"}</strong>
        </div>

        {defiTicket.feature === "staking" && (
          <>
            <div className="transaction-row">
              <span>Estimated yield</span>
              <strong>{defiTicket.apy || "—"}</strong>
            </div>
            <div className="transaction-row">
              <span>Verrouillage</span>
              <strong>{defiTicket.lock === null || defiTicket.lock === undefined ? "—" : (defiTicket.lock ? "Yes" : "No")}</strong>
            </div>
          </>
        )}

        {defiTicket.feature === "swap" && (
          <>
            <div className="transaction-row">
              <span>Taux</span>
              <strong>{defiTicket.rate || "—"}</strong>
            </div>
            <div className="transaction-row">
              <span>Vous recevrez environ</span>
              <strong>{defiTicket.estimatedReceive || "—"}</strong>
            </div>
          </>
        )}

        {defiTicket.feature === "bridge" && (
          <div className="transaction-row">
            <span>Chemin</span>
            <strong>{defiTicket.route || "—"}</strong>
          </div>
        )}

        <div className="transaction-row">
          <span>Estimated fees</span>
          <strong>{defiTicket.fees || "—"}</strong>
        </div>

        <div className={`transaction-row risk-row risk-${defiTicket.riskLevel}`}>
          <span>Niveau de risque</span>
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
        <div className="ticket-checklist-enter">
          <ExecutionChecklist
            label={executionLabel || "Confirm"}
            steps={executionSteps}
            currentIndex={executionStepIndex}
          />
          {!busy && (
            <button type="button" className="confirm confirm-compact" onClick={clearActiveTicket}>
              {executionStepIndex >= executionSteps.length ? "Done" : "Close"}
            </button>
          )}
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
          <HoldSquares progress={holdProgress} />
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

   {waveActive && (
  <div className="ticket-transition-wave">
    <span className="wave-ring wave-ring-a" />
    <span className="wave-ring wave-ring-b" />
  </div>
)}

    <div className={`ticket-collapsible-top ${ticketTopCollapsed ? "collapsed" : ""}`}>
      <div>

    <div className="ticket-title">Plan · {multiTicket.steps.length} steps</div>

    {multiTicket.steps.map((step, i) => {
      const isLast = i === multiTicket.steps.length - 1;
      const expanded = isLast || !!expandedSteps[i];
      const t = step.ticket;

      return (
        <div className={`multi-step ${expanded ? "expanded" : ""}`} key={i}>

          <div
            className="multi-step-head"
            onClick={() => !isLast && setExpandedSteps(s => ({ ...s, [i]: !s[i] }))}
          >
            <span className="multi-step-num">{i + 1}</span>
            <span className="multi-step-summary">{stepSummaryLine(step)}</span>
            {!isLast && (
              <span className="multi-step-toggle">{expanded ? "Hide details" : "Show details"}</span>
            )}
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

    {executionSteps.length > 0 ? (
      <div className="ticket-checklist-enter">
        <ExecutionChecklist
          label={executionLabel || "Confirm"}
          steps={executionSteps}
          currentIndex={executionStepIndex}
        />
        {!busy && (
          <button type="button" className="confirm confirm-compact" onClick={clearActiveTicket}>
            {executionStepIndex >= executionSteps.length ? "Done" : "Close"}
          </button>
        )}
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
        <HoldSquares progress={holdProgress} />
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

        <button
          type="button"
          className="contacts-close"
          onClick={() => {
            setShowSeedVerification(false);
            setSeedVerificationWords({});
            setSeedVerificationError("");
          }}
        >
          <X size={18} />
        </button>
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
              Mot #{position + 1}
            </span>

            <input
              type="text"
              autoComplete="off"
              spellCheck="false"
              placeholder="Entrez le mot"
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
  new ethers.Wallet(pendingMnemonic).privateKey
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
        <div>
          <div className="backup-title">
            Back up your wallet
          </div>

          <div className="backup-subtitle">
            Recovery phrase
          </div>
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

        <button
          type="button"
          className="contacts-close"
          onClick={() => {
            setShowContacts(false);
            setShowAddContact(false);
            setEditingContact(null);
          }}
          aria-label="Fermer"
        >
          <X size={18} />
        </button>
      </div>

      <div className="contacts-list">

        {contacts.length === 0 ? (
          <div className="contacts-empty">
            No saved contacts.
          </div>
        ) : (
          contacts.map((contact, index) => (
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
                    placeholder="Nom"
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
                      Enregistrer
                    </button>

                    <button
                      type="button"
                      className="contact-cancel"
                      onClick={() => setEditingContact(null)}
                    >
                      Cancel
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
                    aria-label={`Modifier ${contact.name}`}
                    title="Modifier"
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
          Ajouter un contact
        </button>

      ) : (

        <div className="add-contact-form">

          <div className="add-contact-title">
            Nouveau contact
          </div>

          <input
            type="text"
            value={newContactName}
            onChange={(e) => setNewContactName(e.target.value)}
            placeholder="Nom du contact"
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
    alert("Veuillez entrer un nom.");
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
              Enregistrer
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
          aria-label="Fermer"
        >
          <X size={18} />
        </button>
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

        {!txHistoryLoading && !txHistoryError && txHistoryList.length === 0 && (
          <div className="contacts-empty">
            No transactions found for this wallet.
          </div>
        )}

        {!txHistoryLoading && !txHistoryError && txHistoryList.map((tx) => {
          const isSent = tx.from.toLowerCase() === wallet?.address?.toLowerCase();
          const date = new Date(tx.timestamp * 1000);

          return (
            <a
              className={`tx-item ${isSent ? "sent" : "received"}`}
              key={tx.hash}
              href={explorerTx(tx.hash, activeNetwork)}
              target="_blank"
              rel="noreferrer"
            >
              <div className="tx-item-main">
                <div className="tx-item-direction">
                  {isSent ? "↗ Sent to" : "↙ Received from"} {shortAddress(isSent ? tx.to : tx.from)}
                </div>
                <div className="tx-item-date">
                  {date.toLocaleDateString("en-US")} · {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>

              <div className={`tx-item-amount ${isSent ? "negative" : "positive"}`}>
                {isSent ? "-" : "+"}{Number(tx.valueXPL).toLocaleString("en-US", { maximumFractionDigits: 6 })} {tx.symbol || "XPL"}
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
// ExecutionChecklist — the "grouped confirmation" checklist shown
// while a ticket is executing. Real progress: `currentIndex` is the
// number of sub-steps actually completed on-chain so far (-1 = none
// yet), driven by the execute*Ticket functions above via
// advanceExecutionTo(), not a fixed timer.
// ---------------------------------------------------------------
function ExecutionChecklist({ label, steps, currentIndex }) {
  const mainDone = currentIndex >= steps.length;

  return (
    <div className="execution-checklist">
      <div className="execution-checklist-title">{label}</div>

      <div className={`execution-checklist-card ${mainDone ? "checklist-complete" : ""}`}>
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

      {mode === "line" ? (
        <LineChartView points={points} nativeSymbol={nativeSymbol} />
      ) : (
        <PieChartView holdings={holdings} />
      )}
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
    d={smoothAreaPath(coords, height)}
    fill="url(#chart-area-fill)"
    stroke="none"
  />

  <path
    d={path}
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
        e.message || "Erreur lors de l'importation."
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
            Importer un wallet
          </div>

          <div className="seed-import-description">
            Enter your full recovery phrase, dans
            l'ordre exact.
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
