// Small pieces of visual polish shared across the wallet: loading skeletons,
// the chain badge on token logos, the empty-wallet invitation, the phone's
// short vibrations and pull-to-refresh.
import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { TokenLogo } from "./tokenLogo.jsx";
import Spinner from "./Spinner.jsx";
import "./ui-polish.css";

// ---------------------------------------------------------------- haptics
// A short buzz on a phone (Android; iOS Safari has no vibration API and
// ignores it). Never on a desktop, never when the user asked for less motion.
const PATTERNS = { tap: 8, confirm: [12, 40, 18], success: [10, 60, 10], error: [30, 50, 30] };
export function haptic(kind = "tap") {
  try {
    if (!navigator.vibrate || !matchMedia("(pointer: coarse)").matches) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tap);
  } catch { /* not available here */ }
}

// ---------------------------------------------------------------- skeletons
// Grey shapes where the content will be, shimmering while it loads.
export function Skel({ w = "100%", h = 10, r = 6, style }) {
  return <span className="lyra-skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

// A list of rows (an icon, a title and a date, an amount on the right)
export function SkeletonRows({ count = 4 }) {
  return (
    <div className="lyra-skel-rows" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div className="lyra-skel-row" key={i}>
          <Skel w={28} h={28} r={14} />
          <span className="lyra-skel-col">
            <Skel w={`${58 - i * 7}%`} h={10} />
            <Skel w="34%" h={8} />
          </span>
          <Skel w={54} h={10} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- chain badge
// The network's own coin stands for the chain (Base has its blue disc).
const CHAIN_MARK = {
  plasma: "XPL", ethereum: "ETH", polygon: "POL", hyperliquid: "HYPE", arc: "USDC",
};
const CHAIN_COLOR = { base: "#0052FF", arc: "#1B1B1F" };

export function ChainBadge({ networkKey, size = 11 }) {
  const key = String(networkKey || "").toLowerCase();
  const mark = CHAIN_MARK[key];
  return (
    <span className="lyra-chain-badge" style={{ width: size, height: size, background: CHAIN_COLOR[key] || "#0D0916" }} title={key}>
      {mark && <TokenLogo symbol={mark} size={size - 2} />}
    </span>
  );
}

// A token's logo with the chain it lives on in the corner
export function TokenWithChain({ symbol, networkKey, size = 26, fallbackColor = "#A78BFA" }) {
  return (
    <span className="lyra-token-chain" style={{ width: size, height: size }}>
      <TokenLogo
        symbol={symbol}
        size={size}
        fallback={<span className="lyra-token-fallback" style={{ width: size, height: size, background: fallbackColor }}>{String(symbol || "?")[0]}</span>}
      />
      {networkKey && <ChainBadge networkKey={networkKey} size={Math.round(size * 0.46)} />}
    </span>
  );
}

// ---------------------------------------------------------------- empty wallet
export function EmptyWallet({ networkName, nativeSymbol, onReceive, compact = false }) {
  const plasma = /plasma/i.test(networkName || "");
  return (
    <div className={`lyra-empty${compact ? " is-compact" : ""}`}>
      <span className="lyra-empty-icon"><QrCode size={compact ? 18 : 22} strokeWidth={1.7} /></span>
      <strong>{plasma ? "Add your first USDT0" : `Add your first ${nativeSymbol || "funds"}`}</strong>
      <span>{plasma ? "Transfers of USDT0 are free on Plasma." : `Send funds to this wallet on ${networkName}.`}</span>
      <button type="button" className="lyra-empty-btn" onClick={() => { haptic("tap"); onReceive?.(); }}>Show my address</button>
    </div>
  );
}

// ---------------------------------------------------------------- pull to refresh
// Pull a scrolled-to-top list down to reload it (touch screens only).
const PULL_MAX = 70, PULL_TRIGGER = 52;
export function usePullToRefresh(ref, onRefresh) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia("(pointer: coarse)").matches) return;
    let y0 = null, d = 0;
    const start = (e) => { y0 = el.scrollTop <= 0 ? e.touches[0].clientY : null; d = 0; };
    const move = (e) => {
      if (y0 === null) return;
      d = Math.max(0, Math.min(PULL_MAX, (e.touches[0].clientY - y0) * 0.5));
      if (d > 0) setPull(d);
    };
    const end = async () => {
      if (y0 === null) return;
      y0 = null;
      if (d >= PULL_TRIGGER) {
        haptic("tap");
        setRefreshing(true);
        setPull(PULL_TRIGGER);
        try { await cb.current?.(); } finally { setRefreshing(false); setPull(0); }
      } else setPull(0);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [ref]);
  const indicator = (pull > 0 || refreshing) ? (
    <div className="lyra-pull" style={{ height: pull, opacity: Math.min(1, pull / PULL_TRIGGER) }} aria-hidden="true">
      <Spinner size={18} />
    </div>
  ) : null;
  return { indicator, style: pull ? { transform: `translateY(${pull * 0.15}px)` } : undefined };
}
