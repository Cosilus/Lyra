// The two Ledger settings Lyra needs (Ethereum app): Blind signing and Smart
// accounts. Shown when one is missing, with the steps for the Ledger that is
// plugged in (buttons on a Nano, touch on Stax / Flex). Blind signing is read
// from the device itself, so the guide ticks it on its own; Smart accounts
// can't be read, it is confirmed by the next try.
import React, { useState } from "react";
import Spinner from "./Spinner.jsx";
import { motion } from "framer-motion";
import { Check, X, ShieldCheck } from "lucide-react";

const TOUCH = ["stax", "flex", "apexp"];

function steps(model) {
  if (TOUCH.includes(model)) {
    return [
      "Open the Ethereum app on your Ledger.",
      "Tap the settings icon at the top right.",
      <>Turn on <strong>Blind signing</strong>.</>,
      <>Turn on <strong>Smart account upgrade</strong>.</>,
    ];
  }
  return [
    "Open the Ethereum app on your Ledger.",
    <>Press the right button until <strong>Settings</strong>, then press both buttons.</>,
    <>On <strong>Blind signing</strong>, press both buttons: it shows <em>Enabled</em>.</>,
    <>Right button to <strong>Smart accounts</strong>, press both buttons: <em>Enabled</em>.</>,
    <>Go to <strong>Back</strong> to leave the settings.</>,
  ];
}

const MODEL_NAME = { nanoS: "Nano S", nanoSP: "Nano S Plus", nanoX: "Nano X", stax: "Stax", flex: "Flex", apexp: "Ledger" };

// need: "blind" | "smart" | "both"; blindOn: true | false | null (unknown)
export function LedgerSetup({ model, need, blindOn, onCheck, onClose }) {
  const [checking, setChecking] = useState(false);
  const [blind, setBlind] = useState(blindOn);
  const [note, setNote] = useState("");

  const check = async () => {
    setChecking(true);
    setNote("");
    try {
      const r = await onCheck();
      setBlind(r.blindSigning);
      if (r.blindSigning === false) setNote("Blind signing still looks off on your Ledger.");
    } catch (e) {
      setNote(e?.message || "Couldn't reach your Ledger.");
    } finally {
      setChecking(false);
    }
  };

  const Status = ({ on, unknownText }) => (
    <span className={`lsetup-status ${on === true ? "is-on" : on === false ? "is-off" : "is-unknown"}`}>
      {on === true ? <><Check size={12} strokeWidth={3} /> On</> : on === false ? <><X size={12} strokeWidth={3} /> Off</> : unknownText}
    </span>
  );

  return (
    <div className="contacts-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        className="contacts-panel lsetup"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="contacts-header">
          <div className="contacts-title">Set up your {MODEL_NAME[model] || "Ledger"}</div>
          <button type="button" className="contacts-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <p className="lsetup-intro">
          {need === "smart"
            ? "Your Ledger refused the one-time upgrade that lets a whole plan go in one signature. One setting to turn on, then confirm the plan again."
            : "Two settings in the Ethereum app, once, about a minute. Nothing was sent."}
        </p>

        <div className="lsetup-checks">
          <div className="lsetup-check">
            <span>Blind signing</span>
            <Status on={blind} unknownText="Checking…" />
          </div>
          <div className="lsetup-check">
            <span>{TOUCH.includes(model) ? "Smart account upgrade" : "Smart accounts"}</span>
            <Status on={need === "smart" ? false : null} unknownText="Checked at your next plan" />
          </div>
        </div>

        <ol className="lsetup-steps">
          {steps(model).map((s, i) => <li key={i}>{s}</li>)}
        </ol>

        <p className="lsetup-why"><ShieldCheck size={13} /> Your Ledger still asks you before every signature. Lyra shows what each plan does before you confirm.</p>

        {note && <div className="acct-error">{note}</div>}
        <button type="button" className="acct-submit lsetup-done" onClick={need === "smart" || blind ? onClose : check} disabled={checking}>
          {checking ? <Spinner size={15} /> : need === "smart" ? "Done, I'll confirm again" : blind ? "All set, continue" : "I turned them on"}
        </button>
      </motion.div>
    </div>
  );
}
