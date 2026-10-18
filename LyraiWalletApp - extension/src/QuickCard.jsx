// The pills at the top right ("Multisig approval waiting", "+0.5 USDC") open
// into a card right where they are: the essentials at a glance, a short live
// review, and the one action (Approve, or Done) without going through the
// menus. The pill grows into the card and the card shrinks back into it
// (shared layoutId), over the blurred wallet.
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, ShieldCheck, ExternalLink, Fingerprint, AlertTriangle } from "lucide-react";
import { ethers } from "ethers";
import Spinner from "./Spinner.jsx";
import { overlayRoot } from "./cardBridge.js";
import { tokenLogoUrl } from "./tokenLogo.jsx";
import { describeSafeTx, fetchPendingTransactions, getSafeBalance, safeAppTxUrl } from "./multisig.js";
import { getNetworkByKey, explorerTx, explorerAddress } from "./config.js";
import "./quick-card.css";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const ago = (t) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(t || Date.now()).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// The checks run one after the other, a dot grid scanning behind them, then
// the ring with its check (or the warning) lands
function Review({ checks, scanning, label }) {
  const passed = checks.filter(c => c.ok).length;
  const warn = checks.find(c => c.ok === false);
  return (
    <>
      <div className={`qc-visual${scanning ? " is-scanning" : warn ? " is-warn" : " is-done"}`}>
        <div className="qc-doc" aria-hidden="true">
          <span className="qc-doc-bar" />
          <span /><span /><span className="is-short" />
          <span className="qc-doc-block" />
        </div>
        <AnimatePresence>
          {!scanning && (
            <motion.span
              className="qc-seal"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
            >
              {warn ? <AlertTriangle size={20} strokeWidth={2.4} /> : <Check size={22} strokeWidth={3} />}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className={`qc-status${scanning ? "" : warn ? " is-warn" : " is-ok"}`}>
        {scanning ? (
          <><span className="qc-spark">✦</span> {label}</>
        ) : warn ? (
          <><AlertTriangle size={13} strokeWidth={2.4} /> {warn.label}</>
        ) : (
          <><span className="qc-ok-dot"><Check size={9} strokeWidth={3.5} /></span> All clear · {passed} checks passed</>
        )}
      </div>
    </>
  );
}

function Row({ k, v, href }) {
  return (
    <div className="qc-row">
      <span>{k}</span>
      {href ? <a href={href} target="_blank" rel="noreferrer">{v} <ExternalLink size={10} /></a> : <b>{v}</b>}
    </div>
  );
}

function ApprovalBody({ card, me, nameOf, onApprove, onDone, onOpenSafe, identity, biometricLabel }) {
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState("");
  const { safe, hash } = card;
  const net = getNetworkByKey(safe.network);
  const [tx, setTx] = useState(null);
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const [phase, setPhase] = useState("idle"); // idle | confirming | sending | done
  const [result, setResult] = useState(null);

  useEffect(() => {
    let stop = false;
    const started = Date.now();
    Promise.all([
      fetchPendingTransactions({ networkKey: safe.network, safeAddress: safe.address }),
      getSafeBalance({ networkKey: safe.network, safeAddress: safe.address }).catch(() => null),
    ]).then(([pending, bal]) => {
      if (stop) return;
      const p = pending.find(x => x.safeTxHash === hash) || pending[0] || null;
      setTx(p);
      setBalance(bal);
      if (!p) setError("This transaction isn't waiting any more.");
      // the review stays on screen long enough to be seen
      setTimeout(() => !stop && setScanning(false), Math.max(0, 1600 - (Date.now() - started)));
    }).catch(() => { if (!stop) { setError("The Safe service didn't answer. Try again in a moment."); setScanning(false); } });
    return () => { stop = true; };
  }, [safe.address, safe.network, hash]);

  const d = tx ? describeSafeTx(tx, { nativeSymbol: net.nativeSymbol, safeAddress: safe.address }) : null;
  const signed = (tx?.confirmations || []).length;
  const required = tx?.confirmationsRequired || safe.threshold;
  const mine = (tx?.confirmations || []).some(c => String(c.owner).toLowerCase() === String(me).toLowerCase());
  const value = BigInt(tx?.value || 0);
  const toName = d ? nameOf?.(d.to) : null;
  const checks = useMemo(() => {
    if (!d) return [];
    const enough = balance == null || value <= balance;
    return [
      { label: ethers.isAddress(d.to) ? "The recipient address is valid" : "The recipient address isn't valid", ok: ethers.isAddress(d.to) },
      { label: d.kind === "transfer" ? "A plain transfer, no contract call" : d.kind === "token" ? "A token transfer" : "A contract call: check it in the Safe", ok: d.kind === "transfer" || d.kind === "token" },
      { label: enough ? "The Safe holds enough" : "Not enough in the Safe for this amount", ok: enough },
      { label: `${signed} of ${required} owners signed`, ok: true },
    ];
  }, [d?.to, d?.kind, balance, value, signed, required]);

  async function approve() {
    setError("");
    // no biometrics on this device: the password, typed here
    if (identity === "password" && !askPassword) { setAskPassword(true); return; }
    if (identity === "password" && !password) { setError("Enter your password to approve."); return; }
    try {
      setPhase("confirming");
      const r = await onApprove(safe, tx, () => setPhase("sending"), password);
      setPassword("");
      setResult(r);
      if (r?.pending) setTx(r.pending);
      setPhase("done");
      setTimeout(onDone, 2200);
    } catch (e) {
      setPhase("idle");
      setError(e?.message || "That didn't go through.");
    }
  }

  return (
    <>
      <div className="qc-head">
        <span className="qc-avatar is-safe"><ShieldCheck size={16} strokeWidth={2.2} /></span>
        <span className="qc-from">
          <b>{safe.name || `${net.name} multisig`}</b>
          <small>Approval · {ago(tx?.submissionDate)}</small>
        </span>
      </div>
      <div className="qc-title">{d ? d.title : "Multisig approval"}</div>
      <div className="qc-meta">
        {d ? <>to {toName || short(d.to)} · {signed}/{required} signed · {net.name}</> : <>{short(safe.address)} · {net.name}</>}
      </div>

      <div className="qc-review">
        <Review checks={checks} scanning={scanning || !tx} label="Reviewing recipient, amount and signatures" />
        <AnimatePresence>
          {phase === "confirming" && identity === "biometric" && (
            <motion.div className="plan-scan qc-scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="plan-scan-badge" initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                <Fingerprint size={34} strokeWidth={1.6} />
                <span className="plan-scan-line" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {tx && !scanning && (
        <motion.div className="qc-rows" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Row k="To" v={toName ? `${toName} · ${short(d.to)}` : short(d.to)} href={explorerAddress(d.to, net)} />
          {value > 0n && <Row k="Amount" v={`${ethers.formatEther(value)} ${net.nativeSymbol}`} />}
          {balance != null && <Row k="Safe balance" v={`${Number(ethers.formatEther(balance)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${net.nativeSymbol}`} />}
          <Row k="Safe tx" v={short(tx.safeTxHash)} href={safeAppTxUrl(safe.network, safe.address, tx.safeTxHash) || explorerAddress(safe.address, net)} />
        </motion.div>
      )}

      {error && <div className="qc-error">{error}</div>}

      {askPassword && phase !== "done" && (
        <motion.form
          className="qc-password"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          onSubmit={(e) => { e.preventDefault(); approve(); }}
        >
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Wallet password"
            autoComplete="current-password"
            aria-label="Wallet password"
          />
          <small>Set up fingerprint or face unlock in Settings to approve with one touch.</small>
        </motion.form>
      )}

      <div className="qc-actions">
        {phase === "done" ? (
          <motion.div className="qc-btn is-done" initial={{ scale: 0.96 }} animate={{ scale: 1 }}>
            <Check size={16} strokeWidth={3} />
            {result?.executed ? "Approved & executed" : "Approved"}
          </motion.div>
        ) : mine ? (
          <button type="button" className="qc-btn is-ghost" onClick={() => onOpenSafe(safe, hash)}>Already signed · Open the Safe</button>
        ) : (
          <button type="button" className="qc-btn" disabled={!tx || scanning || phase !== "idle"} onClick={approve}>
            {phase === "confirming" ? <><Fingerprint size={16} strokeWidth={2.2} /> {identity === "password" ? "Checking…" : identity === "device" ? "Confirm on your device" : `Confirm with ${biometricLabel || "biometrics"}`}</>
              : phase === "idle" && identity === "biometric" ? <><Fingerprint size={16} strokeWidth={2.2} /> {signed + 1 >= required ? "Approve & execute" : "Approve"}</>
              : phase === "idle" && askPassword ? "Confirm & approve"
              : phase === "sending" ? <><Spinner size={15} /> Approving…</>
              : signed + 1 >= required ? "Approve & execute" : "Approve"}
          </button>
        )}
        {phase === "done" && (
          <div className="qc-after">
            {result?.executed
              ? <>Sent on {net.name}{result.hash ? <> · <a href={explorerTx(result.hash, net)} target="_blank" rel="noreferrer">View <ExternalLink size={10} /></a></> : null}</>
              : "The other owners see your signature now"}
          </div>
        )}
        {phase !== "done" && !mine && tx && (
          <button type="button" className="qc-link" onClick={() => onOpenSafe(safe, hash)}>Open the Safe</button>
        )}
      </div>
    </>
  );
}

function DepositBody({ card, onDone }) {
  const { amount, symbol, from, fromAddress, hash, network, at, balanceText } = card;
  const net = getNetworkByKey(network);
  const [scanning, setScanning] = useState(true);
  useEffect(() => { const t = setTimeout(() => setScanning(false), 1100); return () => clearTimeout(t); }, []);
  const logo = tokenLogoUrl(symbol);
  const checks = [
    { label: `Arrived on ${net.name}`, ok: true },
    { label: from && fromAddress && from !== short(fromAddress) ? `From ${from}, a saved contact` : "From an address that isn't in your contacts", ok: true },
    { label: "Already in your balance", ok: true },
  ];
  return (
    <>
      <div className="qc-head">
        <span className="qc-avatar">{logo ? <img src={logo} alt="" /> : symbol.slice(0, 1)}</span>
        <span className="qc-from">
          <b>{from || "Deposit"}</b>
          <small>Received · {ago(at)}</small>
        </span>
      </div>
      <div className="qc-title is-in">+{amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} {symbol}</div>
      <div className="qc-meta">{from ? `from ${from}` : "a transfer in"} · {net.name}</div>

      <Review checks={checks} scanning={scanning} label="Checking where it came from" />

      {!scanning && (
        <motion.div className="qc-rows" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {fromAddress && <Row k="From" v={from && from !== short(fromAddress) ? `${from} · ${short(fromAddress)}` : short(fromAddress)} href={explorerAddress(fromAddress, net)} />}
          {balanceText && <Row k={`${symbol} balance`} v={balanceText} />}
          {hash && <Row k="Transaction" v={short(hash)} href={explorerTx(hash, net)} />}
        </motion.div>
      )}

      <div className="qc-actions">
        <button type="button" className="qc-btn" onClick={onDone}>Done</button>
      </div>
    </>
  );
}

export function QuickCard({ card, me, nameOf, onClose, onApprove, onOpenSafe, identity = "password", biometricLabel }) {
  useEffect(() => {
    if (!card) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [!!card]);
  return createPortal(
    <AnimatePresence>
      {card && (
        <motion.div
          key="qc"
          className="qc-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25, delay: 0.1 } }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            layoutId={card.kind === "approval" ? "quick-approval" : "quick-deposit"}
            className="qc-card"
            role="dialog"
            aria-label={card.kind === "approval" ? "Multisig approval" : "Deposit"}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            style={{ borderRadius: 26 }}
          >
            <motion.div className="qc-inner" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
              <button type="button" className="qc-close" onClick={onClose} aria-label="Close"><X size={14} strokeWidth={2.4} /></button>
              {card.kind === "approval"
                ? <ApprovalBody card={card} me={me} nameOf={nameOf} onApprove={onApprove} onDone={onClose} onOpenSafe={onOpenSafe} identity={identity} biometricLabel={biometricLabel} />
                : <DepositBody card={card} onDone={onClose} />}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    overlayRoot()
  );
}
