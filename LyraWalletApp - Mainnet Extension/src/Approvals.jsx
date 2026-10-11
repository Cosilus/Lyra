// Token approvals: which contracts may still spend this wallet's tokens.
// Checked live (allowance()) for every token of the network against the
// contracts Lyra uses and the ones this wallet has called before, so no
// indexer is needed. Unlimited ones and unknown contracts come first.
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ethers } from "ethers";
import { ShieldCheck, ShieldAlert, Loader2, RefreshCw } from "lucide-react";

const ERC20_ALLOWANCE_ABI = ["function allowance(address owner, address spender) view returns (uint256)"];
// anything above this is "unlimited" in practice (approve(max) and friends)
const UNLIMITED = 2n ** 128n;
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function Approvals({ owner, provider, tokens, spenders, onRevoke }) {
  const [items, setItems] = useState(null); // null while loading
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null); // key waiting for the second click
  const [revoking, setRevoking] = useState(null);
  const [revokeError, setRevokeError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError("");
    (async () => {
      try {
        const checks = [];
        for (const [symbol, t] of Object.entries(tokens)) {
          if (!t?.address) continue;
          const c = new ethers.Contract(t.address, ERC20_ALLOWANCE_ABI, provider);
          for (const s of spenders) {
            checks.push(
              c.allowance(owner, s.address)
                .then(v => (v > 0n ? { key: `${symbol}:${s.address}`, symbol, token: t, spender: s, amount: v } : null))
                .catch(() => null)
            );
          }
        }
        const found = (await Promise.all(checks)).filter(Boolean);
        // unknown contracts, then unlimited, then the rest
        found.sort((a, b) => (a.spender.known === b.spender.known ? 0 : a.spender.known ? 1 : -1) || ((b.amount >= UNLIMITED) - (a.amount >= UNLIMITED)));
        if (!cancelled) setItems(found);
      } catch (e) {
        if (!cancelled) setError("Couldn't read the approvals on this network.");
      }
    })();
    return () => { cancelled = true; };
  }, [owner, provider, tokens, spenders, nonce]);

  const revoke = async (it) => {
    if (confirming !== it.key) { setConfirming(it.key); setRevokeError(""); return; }
    setRevoking(it.key);
    setRevokeError("");
    try {
      await onRevoke(it.token.address, it.spender.address);
      setItems(list => list.filter(x => x.key !== it.key));
    } catch (e) {
      setRevokeError(e?.shortMessage || e?.message || "The revoke didn't go through.");
    } finally {
      setRevoking(null);
      setConfirming(null);
    }
  };

  const unlimited = items ? items.filter(i => i.amount >= UNLIMITED).length : 0;

  return (
    <div className="appr">
      <div className="appr-summary">
        {items === null ? (
          <span className="appr-summary-text"><Loader2 size={14} className="spin" /> Checking your tokens…</span>
        ) : error ? (
          <span className="appr-summary-text">{error}</span>
        ) : items.length === 0 ? (
          <span className="appr-summary-text is-ok"><ShieldCheck size={15} /> No contract can spend your tokens</span>
        ) : (
          <span className="appr-summary-text">
            <ShieldAlert size={15} className={unlimited ? "is-warn" : ""} />
            {items.length} open approval{items.length > 1 ? "s" : ""}{unlimited ? ` · ${unlimited} unlimited` : ""}
          </span>
        )}
        <button type="button" className="appr-refresh" onClick={() => setNonce(n => n + 1)} aria-label="Check again" data-tip="Check again">
          <RefreshCw size={13} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {(items || []).map(it => {
          const isUnlimited = it.amount >= UNLIMITED;
          const amount = isUnlimited ? "Unlimited" : `${Number(ethers.formatUnits(it.amount, it.token.decimals)).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${it.symbol}`;
          return (
            <motion.div
              key={it.key}
              className="appr-row"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="appr-main">
                <div className="appr-title">
                  {it.symbol}
                  <span className={`appr-amount${isUnlimited ? " is-warn" : ""}`}>{amount}</span>
                </div>
                <div className="appr-spender">
                  {it.spender.known ? it.spender.label : <span className="is-warn">Unknown contract</span>} · {short(it.spender.address)}
                </div>
              </div>
              <button
                type="button"
                className={`appr-revoke${confirming === it.key ? " is-confirm" : ""}`}
                onClick={() => revoke(it)}
                onBlur={() => confirming === it.key && revoking !== it.key && setConfirming(null)}
                disabled={!!revoking}
              >
                {revoking === it.key ? <Loader2 size={13} className="spin" /> : confirming === it.key ? "Confirm" : "Revoke"}
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {revokeError && <div className="acct-error">{revokeError}</div>}
      <p className="appr-note">Revoking sends one small transaction, with its network fee.</p>
    </div>
  );
}
