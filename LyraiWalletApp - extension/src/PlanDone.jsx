// The end of a plan: a sheet rises over the wallet, the check draws itself,
// the net result is shown big (what left, what arrived), then every step with
// its explorer link. On a phone or in the side panel it is a bottom sheet; in
// a wide window (the extension opened in a tab) a card in the middle.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ExternalLink } from "lucide-react";
import { tokenLogoUrl } from "./tokenLogo.jsx";
import { IS_CARD } from "./cardBridge.js";
import "./plan-done.css";

const EASE = [0.22, 1, 0.36, 1];

// "100 XPL" / "≈ 8.21 USDC on Base": the amount and token of a step's side
function side(text) {
  const t = String(text || "").replace(/^≈\s*/, "").trim();
  const m = t.match(/^([\d.,]+)\s+([A-Za-z0-9.]+)(?:\s+on\s+(.+))?/);
  return m ? { amount: m[1], symbol: m[2], chain: m[3] || null } : null;
}

// One amount, always drawn the same way: logo, number, symbol (no chain:
// the result box above already says where it all ended up)
function Amount({ text, logo = 14 }) {
  const v = side(text);
  if (!v) return <span className="pd-amt">{String(text || "").replace(/s+ons+.+$/, "")}</span>;
  const url = tokenLogoUrl(v.symbol);
  return (
    <span className="pd-amt">
      {url && <img src={url} alt="" width={logo} height={logo} className="pd-amt-logo" />}
      <span className="pd-amt-n">{v.amount}</span> {v.symbol}
    </span>
  );
}

export function PlanDoneSheet({ done, networkName, onClose }) {
  useEffect(() => {
    if (!done) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, onClose]);

  const steps = done?.steps || [];
  const first = side(steps[0]?.from);
  const last = side(steps[steps.length - 1]?.to);
  const links = steps.filter(s => s.txUrl).length > 1;
  const sheet = (
    <AnimatePresence>
      {done && (
        <motion.div
          className="pd-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="pd-sheet"
            role="dialog"
            aria-label="Plan done"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <span className="pd-grab" aria-hidden="true" />
            <span className="pd-ring" aria-hidden="true">
              <svg viewBox="0 0 76 76">
                <circle cx="38" cy="38" r="36" />
                <path d="M24 39l9 9 19-21" />
              </svg>
            </span>
            <div className="pd-title">{steps.length > 1 ? "Plan done" : "Done"}</div>
            <p className="pd-sub">
              {steps.length > 1 ? `${steps.length} steps, 1 confirmation` : steps[0]?.label || ""}
              {done.seconds ? ` · ${done.seconds} s` : ""}
            </p>

            {first && last && (
              <div className="pd-hero">
                {[[first, "−", ""], [last, "+", " is-in"]].map(([v, sign, cls], k) => (
                  <span className={`pd-side${cls}`} key={k}>
                    {tokenLogoUrl(v.symbol) ? <img src={tokenLogoUrl(v.symbol)} alt="" className="pd-side-logo" /> : <span className="pd-side-logo" />}
                    <b>{sign}{v.amount} <em>{v.symbol}</em></b>
                    <span>{v.chain || networkName || ""}</span>
                  </span>
                )).reduce((a, el, i) => (i ? [...a, <span className="pd-arrow" key="arrow">→</span>, el] : [el]), [])}
              </div>
            )}

            <div className="pd-steps">
              {steps.map((s, i) => (
                <motion.div
                  className="pd-step"
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, ease: EASE, delay: 0.9 + i * 0.12 }}
                >
                  <span className="pd-step-ok"><Check size={11} strokeWidth={3.5} /></span>
                  <span className="pd-step-text">
                    <span className="pd-step-line">
                      <b>{s.label}</b>
                      {s.from && <Amount text={s.from} />}
                      {s.to && <><span className="pd-step-arrow">→</span><Amount text={s.to} /></>}
                    </span>
                    {s.via && <small>{s.via}</small>}
                  </span>
                  {links && s.txUrl && (
                    <a href={s.txUrl} target="_blank" rel="noreferrer" className="pd-step-link">View <ExternalLink size={11} /></a>
                  )}
                </motion.div>
              ))}
            </div>
            {!links && (done.txUrl || steps.find(s => s.txUrl)?.txUrl) && (
              <a className="pd-txlink" href={done.txUrl || steps.find(s => s.txUrl).txUrl} target="_blank" rel="noreferrer">
                View on the explorer <ExternalLink size={12} />
              </a>
            )}

            <button type="button" className="pd-done" onClick={onClose} autoFocus>Back to wallet</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
  // above the 3D box and its menus; in the floating card, inside its area
  return createPortal(sheet, (IS_CARD && document.getElementById("card-overlays")) || document.body);
}
