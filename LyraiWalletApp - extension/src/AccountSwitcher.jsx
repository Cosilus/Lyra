// The wallet's addresses, opened from the chevron next to the address in the
// balance card: switch between them, create a new one from the recovery
// phrase, or import one (private key or recovery phrase). Opens in place,
// under the address, inside the card.
import React, { useEffect, useRef, useState } from "react";
import Spinner from "./Spinner.jsx";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, Download, Lock, ArrowLeft, Pencil, Usb, ChevronDown, ShieldCheck } from "lucide-react";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

// A small round mark, its colors taken from the address, to tell them apart
function AccountMark({ address }) {
  const h = parseInt(String(address).slice(2, 8), 16) || 0;
  const a = h % 360;
  const b = (a + 70 + (h >> 9) % 80) % 360;
  return (
    <span
      className="acct-mark"
      style={{ background: `conic-gradient(from ${h % 180}deg, hsl(${a} 70% 72%), hsl(${b} 65% 58%), hsl(${a} 70% 72%))` }}
    />
  );
}

export function AccountSwitcher({ accounts, activeAddress, keyReady, onSwitch, onCreate, onImport, onRename, onConnectLedger, onConnectOneKey, onConnectTrezor, multisigs = [], onOpenMultisig }) {
  // the address being renamed, and the name being typed
  const [renaming, setRenaming] = useState(null);
  const [draftName, setDraftName] = useState("");
  const startRename = (a) => { setRenaming(a.address); setDraftName(a.name); };
  const saveRename = () => {
    if (renaming && draftName.trim()) onRename(renaming, draftName);
    setRenaming(null);
  };
  // "list" | "create" | "import" | an address waiting for the password
  const [view, setView] = useState("list");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  // the hardware wallets on offer, behind one button
  const [hwOpen, setHwOpen] = useState(false);
  const firstField = useRef(null);

  useEffect(() => {
    setError("");
    setPassword("");
    if (view !== "import") setSecret("");
    if (view !== "list") setTimeout(() => firstField.current?.focus(), 60);
  }, [view]);

  const run = async (fn) => {
    setWorking(true);
    setError("");
    try {
      await fn();
      setView("list");
    } catch (e) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setWorking(false);
    }
  };

  const pick = (a) => {
    if (a.address.toLowerCase() === activeAddress?.toLowerCase()) return;
    if (keyReady(a.address)) run(() => onSwitch(a.address));
    else setView(a.address);
  };

  const waiting = view !== "list" && view !== "create" && view !== "import"
    ? accounts.find(a => a.address === view)
    : null;

  const submit = (e) => {
    e.preventDefault();
    if (working) return;
    if (!password) { setError("Enter your password."); return; }
    if (view === "create") run(() => onCreate(password));
    else if (view === "import") {
      if (!secret.trim()) { setError("Paste a private key or a recovery phrase."); return; }
      run(() => onImport(secret, password));
    } else if (waiting) run(() => onSwitch(waiting.address, password));
  };

  return (
    <div className="acct">
      <AnimatePresence mode="wait" initial={false}>
        {view === "list" ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
          >
            <ul className="acct-list">
              {accounts.map((a, i) => {
                const active = a.address.toLowerCase() === activeAddress?.toLowerCase();
                if (renaming === a.address) {
                  return (
                    <li key={a.address}>
                      <div className="acct-row is-editing">
                        <AccountMark address={a.address} />
                        <span className="acct-text">
                          <input
                            className="acct-rename"
                            value={draftName}
                            onChange={e => setDraftName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") { e.preventDefault(); saveRename(); }
                              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setRenaming(null); }
                            }}
                            onBlur={saveRename}
                            maxLength={32}
                            autoFocus
                            aria-label="Address name"
                          />
                          <span className="acct-address">{short(a.address)}</span>
                        </span>
                        <button type="button" className="acct-edit is-save" onMouseDown={e => e.preventDefault()} onClick={saveRename} aria-label="Save name">
                          <Check size={14} strokeWidth={2.4} />
                        </button>
                      </div>
                    </li>
                  );
                }
                return (
                  <motion.li
                    key={a.address}
                    className="acct-item"
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 8) * 0.04 }}
                  >
                    <button
                      type="button"
                      className={`acct-row${active ? " is-active" : ""}`}
                      onClick={() => pick(a)}
                      disabled={working}
                    >
                      <AccountMark address={a.address} />
                      <span className="acct-text">
                        <span className="acct-name">{a.name}</span>
                        <span className="acct-address">{a.kind === "ledger" ? `Ledger · ${short(a.address)}` : a.kind === "onekey" ? `OneKey · ${short(a.address)}` : a.kind === "trezor" ? `Trezor · ${short(a.address)}` : short(a.address)}</span>
                      </span>
                      {active ? (
                        <Check size={15} strokeWidth={2.4} className="acct-state is-on" />
                      ) : !keyReady(a.address) ? (
                        <Lock size={13} strokeWidth={2} className="acct-state" />
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="acct-edit"
                      onClick={() => startRename(a)}
                      aria-label={`Rename ${a.name}`}
                      data-tip="Rename"
                    >
                      <Pencil size={12} strokeWidth={2} />
                    </button>
                  </motion.li>
                );
              })}
            </ul>
            {multisigs.length > 0 && onOpenMultisig && (
              <>
                <div className="acct-section-label">Multisig</div>
                <ul className="acct-list">
                  {multisigs.map((m, i) => (
                    <motion.li
                      key={m.network + m.address}
                      className="acct-item"
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: Math.min(accounts.length + i, 10) * 0.04 }}
                    >
                      <button type="button" className="acct-row" onClick={() => onOpenMultisig(m)}>
                        <span className="acct-ms-mark"><ShieldCheck size={14} strokeWidth={2} /></span>
                        <span className="acct-text">
                          <span className="acct-name">{m.threshold}-of-{m.owners?.length || "?"} · {m.networkName}</span>
                          <span className="acct-address">{short(m.address)}</span>
                        </span>
                        {m.waiting > 0 && <span className="acct-ms-badge">{m.waiting} to sign</span>}
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </>
            )}
            {error && <div className="acct-error">{error}</div>}
            <div className="acct-actions">
              <button type="button" className="acct-action" onClick={() => setView("create")}>
                <Plus size={14} strokeWidth={2.2} /> New
              </button>
              <button type="button" className="acct-action" onClick={() => setView("import")}>
                <Download size={14} strokeWidth={2.2} /> Import
              </button>
              {(onConnectLedger || onConnectOneKey || onConnectTrezor) && (
                <button
                  type="button"
                  className={`acct-action acct-hw-toggle${hwOpen ? " is-open" : ""}`}
                  disabled={working}
                  aria-expanded={hwOpen}
                  onClick={() => setHwOpen(o => !o)}
                >
                  {working ? <Spinner size={14} /> : <Usb size={14} strokeWidth={2.2} />} Hardware
                  <ChevronDown size={13} className="acct-hw-chev" />
                </button>
              )}
            </div>
            <AnimatePresence initial={false}>
              {hwOpen && (
                <motion.div
                  className="acct-hw-menu"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {[
                    ["Ledger", onConnectLedger, "Plug in your Ledger and open its Ethereum app"],
                    ["Trezor", onConnectTrezor, "Approve in Trezor's window"],
                    ["OneKey", onConnectOneKey, "Plug in your OneKey and unlock it"],
                  ].map(([name, connect, hint]) => (
                    <button
                      key={name}
                      type="button"
                      className="acct-hw-item"
                      disabled={!connect || working}
                      onClick={() => { setHwOpen(false); run(connect); }}
                    >
                      <span className="acct-hw-name">{name}</span>
                      <span className="acct-hw-hint">{connect ? hint : "Soon"}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.form
            key={view}
            className="acct-form"
            onSubmit={submit}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.18 }}
          >
            <div className="acct-form-head">
              <button type="button" className="acct-back" onClick={() => setView("list")} aria-label="Back">
                <ArrowLeft size={15} strokeWidth={2} />
              </button>
              <span>
                {view === "create" ? "New address" : view === "import" ? "Import an address" : `Unlock ${waiting?.name || "address"}`}
              </span>
            </div>
            <p className="acct-hint">
              {view === "create"
                ? "A new address from your recovery phrase. Your phrase still backs up all of them."
                : view === "import"
                  ? "Paste a private key or a 12 or 24-word recovery phrase. It stays encrypted on this device."
                  : "Enter your password once to use this address."}
            </p>
            {view === "import" && (
              <textarea
                ref={firstField}
                className="acct-input acct-secret"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                placeholder="0x… or word word word…"
                rows={2}
                spellCheck={false}
                autoComplete="off"
              />
            )}
            <input
              ref={view === "import" ? undefined : firstField}
              className="acct-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Wallet password"
              autoComplete="current-password"
            />
            {error && <div className="acct-error">{error}</div>}
            <button type="submit" className="acct-submit" disabled={working}>
              {working ? <Spinner size={15} /> : view === "create" ? "Create address" : view === "import" ? "Import" : "Unlock and switch"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
