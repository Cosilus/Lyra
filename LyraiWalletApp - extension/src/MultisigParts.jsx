// Multisig pieces: the live checklist while a Safe is created, a pending
// transaction that unfolds to its exact details, and the "approval waiting"
// pill that tells a co-owner their signature is needed.
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ExternalLink, Users, Calculator, PenLine, Hourglass, ShieldCheck } from "lucide-react";
import { ethers } from "ethers";
import Spinner from "./Spinner.jsx";
import { describeSafeTx, safeAppTxUrl, fetchSafeHistory, fetchSafeIncoming } from "./multisig.js";
import { getNetworkByKey, explorerAddress, explorerTx } from "./config.js";
import { SkeletonRows } from "./uiPolish.jsx";
import "./multisig-parts.css";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export const DEPLOY_STEPS = [
  { icon: Users, label: "Prepare owners", hint: "Checking every owner address" },
  { icon: Calculator, label: "Compute Safe address", hint: "Predicting where the Safe will live" },
  { icon: PenLine, label: "Confirm deployment", hint: "Signing the creation transaction" },
  { icon: Hourglass, label: "Waiting for the network", hint: "Usually a few seconds, sometimes a minute" },
  { icon: ShieldCheck, label: "Safe ready", hint: "Saved in your multisigs" },
];

// step: index of the stage in progress (DEPLOY_STEPS.length when all done)
export function DeploySteps({ step, txUrl }) {
  return (
    <div className="ms-steps" role="status" aria-live="polite">
      {DEPLOY_STEPS.map((s, i) => {
        if (i > step) return null;
        const done = i < step || (i === DEPLOY_STEPS.length - 1 && step >= i);
        const active = i === step && !done;
        const Icon = s.icon;
        return (
          <motion.div
            key={s.label}
            className={`ms-step${active ? " is-active" : ""}${done ? " is-done" : ""}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="ms-step-icon">
              <Icon size={15} strokeWidth={2} />
              <AnimatePresence>
                {done && (
                  <motion.span className="ms-step-check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
                    <Check size={9} strokeWidth={3.4} />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span className="ms-step-body">
              <span className="ms-step-label">{s.label}</span>
              <span className="ms-step-hint">
                {i === 3 && txUrl ? <a href={txUrl} target="_blank" rel="noreferrer">View the transaction <ExternalLink size={10} /></a> : s.hint}
              </span>
            </span>
            {active && <Spinner size={14} className="ms-step-spin" />}
          </motion.div>
        );
      })}
    </div>
  );
}

// One pending Safe transaction: what it does on one line, its exact details below
export function PendingSafeTx({ p, safe, me, nativeSymbol, busy, defaultOpen, onApprove, nameOf }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const d = describeSafeTx(p, { nativeSymbol, safeAddress: safe.address });
  const confirmations = p.confirmations || [];
  const required = p.confirmationsRequired || safe.threshold;
  const signed = new Set(confirmations.map(c => String(c.owner).toLowerCase()));
  const mine = signed.has(String(me || "").toLowerCase());
  const owners = safe.owners?.length ? safe.owners : confirmations.map(c => c.owner);
  const label = (a) => nameOf?.(a) || short(a);
  return (
    <div className={`ms-tx${open ? " is-open" : ""}${!mine ? " is-waiting" : ""}`}>
      <button type="button" className="ms-tx-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="ms-tx-main">
          <span className="ms-tx-title">{d.title}</span>
          <span className="ms-tx-sub">to {label(d.to)} · {confirmations.length}/{required} signatures</span>
        </span>
        <ChevronDown size={15} className="ms-tx-chev" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="ms-tx-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <dl className="ms-tx-dl">
              <dt>Action</dt><dd>{d.title}</dd>
              <dt>To</dt><dd className="is-mono" title={d.to}>{d.to}</dd>
              {BigInt(p.value || 0) > 0n && (<><dt>Amount</dt><dd className="is-mono">{ethers.formatEther(BigInt(p.value))} {nativeSymbol}</dd></>)}
              {d.detail && (<><dt>Detail</dt><dd>{d.detail}</dd></>)}
              <dt>Nonce</dt><dd className="is-mono">#{p.nonce}</dd>
              {p.submissionDate && (<><dt>Proposed</dt><dd>{new Date(p.submissionDate).toLocaleString()}</dd></>)}
              <dt>Tx hash</dt>
              <dd className="is-mono" title={p.safeTxHash}>
                <a
                  className="ms-link"
                  href={safeAppTxUrl(safe.network, safe.address, p.safeTxHash) || explorerAddress(safe.address, getNetworkByKey(safe.network))}
                  target="_blank"
                  rel="noreferrer"
                >
                  {short(p.safeTxHash)} <ExternalLink size={10} />
                </a>
              </dd>
            </dl>
            <div className="ms-tx-owners">
              {owners.map(o => {
                const ok = signed.has(String(o).toLowerCase());
                const isMe = String(o).toLowerCase() === String(me || "").toLowerCase();
                return (
                  <span key={o} className={`ms-owner${ok ? " is-signed" : ""}`}>
                    {ok ? <Check size={11} strokeWidth={3} /> : <span className="ms-owner-wait" />}
                    {isMe ? "You" : label(o)}
                  </span>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        className={`ms-tx-approve${mine ? " is-signed" : ""}`}
        disabled={busy || mine}
        onClick={() => onApprove(p.safeTxHash)}
      >
        {mine ? "Signed" : confirmations.length + 1 >= required ? "Approve & execute" : "Approve"}
      </button>
    </div>
  );
}

// The pill at the top right, like a deposit arriving
export function MultisigWaitingPill({ count, onOpen }) {
  return (
    <motion.button
      type="button"
      className="ms-pill"
      initial={{ opacity: 0, y: -8, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onClick={onOpen}
      aria-label={`Multisig approval waiting${count > 1 ? ` (${count})` : ""}`}
    >
      <span className="ms-pill-pulse" aria-hidden="true"><span /><span /><span /></span>
      <span className="ms-pill-text">Multisig approval waiting{count > 1 ? ` · ${count}` : ""}</span>
    </motion.button>
  );
}

// The Multisig tab of the Send / Receive / Swap / Bridge / Stake menus: what
// the Safes this address co-owns did, apart from the wallet's own history.
const fmtAmount = (v, decimals = 18) => {
  try { return Number(ethers.formatUnits(BigInt(v || 0), decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 }); } catch { return "0"; }
};
const dateOf = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};

export function MultisigHistory({ category, safes, onOpenSafe, nameOf, walletRows = [] }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const kinds = category === "sent" ? ["transfer", "token"] : category === "received" ? null : [];
  const key = safes.map(x => x.network + x.address).join(",");

  useEffect(() => {
    let stop = false;
    setRows(null);
    setError("");
    if (kinds && !kinds.length) { setRows([]); return; }
    (async () => {
      const all = [];
      for (const safe of safes) {
        const net = getNetworkByKey(safe.network);
        try {
          if (category === "received") {
            for (const t of await fetchSafeIncoming({ networkKey: safe.network, safeAddress: safe.address })) {
              const token = t.tokenInfo;
              all.push({
                id: t.transactionHash + (t.transferId || ""),
                safe, verb: "Received", who: `from ${nameOf?.(t.from) || short(t.from)}`,
                amount: `+${fmtAmount(t.value, token?.decimals ?? 18)} ${token?.symbol || net.nativeSymbol}`, positive: true,
                when: t.executionDate, href: explorerTx(t.transactionHash, net),
              });
            }
          } else {
            for (const p of await fetchSafeHistory({ networkKey: safe.network, safeAddress: safe.address })) {
              const d = describeSafeTx(p, { nativeSymbol: net.nativeSymbol, safeAddress: safe.address });
              if (!kinds.includes(d.kind)) continue;
              const signed = (p.confirmations || []).length;
              const required = p.confirmationsRequired || safe.threshold;
              all.push({
                id: p.safeTxHash,
                safe, hash: p.safeTxHash, pending: !p.isExecuted,
                verb: p.isExecuted ? (p.isSuccessful === false ? "Failed" : "Sent") : "Waiting",
                who: `to ${nameOf?.(d.to) || short(d.to)}`,
                amount: d.kind === "transfer" ? `-${fmtAmount(p.value)} ${net.nativeSymbol}` : d.title,
                status: p.isExecuted ? null : `${signed}/${required} signatures`,
                when: p.executionDate || p.submissionDate,
                href: p.isExecuted && p.transactionHash ? explorerTx(p.transactionHash, net) : null,
              });
            }
          }
        } catch (e) {
          if (!stop) setError("The Safe service didn't answer. Try again in a moment.");
        }
      }
      // the wallet's own transactions for its Safes: creating one, executing an approved transfer
      const seen = new Set(all.map(x => x.id));
      for (const w of walletRows) if (!seen.has(w.id)) all.push(w);
      all.sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0));
      if (!stop) setRows(all);
    })();
    return () => { stop = true; };
  }, [category, key, walletRows.length]);

  if (rows === null) return <SkeletonRows count={3} />;
  if (!rows.length) {
    return (
      <div className="menu-empty">
        <span className="menu-empty-icon tone-p"><ShieldCheck size={19} strokeWidth={1.9} /></span>
        <strong>{error || (kinds && !kinds.length ? "Nothing here for your multisig" : "No multisig activity yet")}</strong>
        <span>
          {kinds && !kinds.length
            ? "A multisig sends and receives here; its other actions show in the Safe itself."
            : category === "received" ? "Funds sent to your Safe show up here." : "Transfers proposed and approved by the owners show up here."}
        </span>
      </div>
    );
  }
  const several = new Set(safes.map(x => x.network + x.address)).size > 1;
  return rows.map((row, i) => {
    const body = (
      <>
        <span className="ms-hist-mark"><ShieldCheck size={15} strokeWidth={2} /></span>
        <span className="tx-line-col">
          <span className="tx-line-verb">{row.verb}</span>
          <span className="tx-line-who">{row.who}{several ? ` · ${getNetworkByKey(row.safe.network).name}` : ""}</span>
        </span>
        <span className="tx-line-col is-right">
          <span className={`tx-line-amount${row.positive ? " positive" : row.pending ? "" : " negative"}`}>{row.amount}</span>
          <span className={`tx-line-when${row.pending ? " ms-hist-pending" : ""}`}>{row.status || dateOf(row.when)}</span>
        </span>
      </>
    );
    const anim = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, delay: Math.min(i, 8) * 0.03 } };
    return row.pending ? (
      <motion.button key={row.id} type="button" className="tx-item tx-line" onClick={() => onOpenSafe(row.safe, row.hash)} {...anim}>{body}</motion.button>
    ) : row.href ? (
      <motion.a key={row.id} className="tx-item tx-line" href={row.href} target="_blank" rel="noreferrer" {...anim}>{body}</motion.a>
    ) : (
      <motion.div key={row.id} className="tx-item tx-line" {...anim}>{body}</motion.div>
    );
  });
}
