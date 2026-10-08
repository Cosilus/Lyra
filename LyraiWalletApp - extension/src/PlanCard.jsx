import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftRight, ArrowUpFromDot, ArrowDownToDot, Vault, MoveHorizontal, Wallet, Zap, ListOrdered, MessageCircle, Check, Fingerprint, Loader2, ExternalLink, X, ChevronDown } from "lucide-react";
import { TokenLogo, tokenLogoUrl } from "./tokenLogo.jsx";
import { StatusBadge } from "./StatusBadge.jsx";
import { FillButton } from "./FillButton.jsx";
import "./plan-card.css";

// The plan, in the sheet that covers the wallet:
//   thinking  Lyra's work log (phase + seconds), steps appear, values fill in
//   review    "3 steps"                + details drop-down, then confirm
//   running   "Running…"               each step gets its check as it lands
//   done      "Done"                   what changed, link, Done
// Confirmation is biometric when the wallet has it (Touch ID / Windows
// Hello), otherwise a press-and-hold, never a single click.
//
// step  = { kind, label, sub, from, to }
// after = [{ label, value, before }]

// The same icons as the wallet's own menus (Send, Receive, Swap, Bridge, Stake).
export function StepIcon({ kind, size = 16 }) {
  const p = { size, strokeWidth: 1.8 };
  if (kind === "swap") return <ArrowLeftRight {...p} />;
  if (kind === "bridge") return <MoveHorizontal {...p} />;
  if (kind === "stake") return <Vault {...p} />;
  if (kind === "unstake") return <ArrowDownToDot {...p} style={{ transform: "rotate(45deg)" }} />;
  if (kind === "receive") return <ArrowDownToDot {...p} style={{ transform: "rotate(45deg)" }} />;
  if (kind === "wallet") return <Wallet {...p} />;
  if (kind === "pay") return <Zap {...p} />;
  if (kind === "multi") return <ListOrdered {...p} />;
  if (kind === "ask") return <MessageCircle {...p} />;
  return <ArrowUpFromDot {...p} style={{ transform: "rotate(45deg)" }} />;
}

const EASE = [0.22, 1, 0.36, 1];

// Lyra's own four-point star, the same mark the work log used to animate.
export function LyraStar({ className = "" }) {
  return (
    <svg className={`lyra-star ${className}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1.5c.6 4.9 2.6 7.4 7.5 8.1v.8c-4.9.7-6.9 3.2-7.5 8.1-.6-4.9-2.6-7.4-7.5-8.1v-.8c4.9-.7 6.9-3.2 7.5-8.1z" />
    </svg>
  );
}

// "5 USDC" -> "5 [USDC logo] USDC": every known token symbol in a step's value
// gets its logo right before it.
export function withTokenLogos(text) {
  return String(text).split(/(\s+)/).map((part, i) =>
    tokenLogoUrl(part.replace(/[^A-Za-z0-9.]/g, ""))
      ? <span key={i} className="plan-token"><TokenLogo symbol={part.replace(/[^A-Za-z0-9.]/g, "")} size={14} className="plan-token-logo" />{part}</span>
      : part
  );
}

function Value({ text }) {
  if (!text) return <span className="plan-skel" />;
  return (
    <motion.span
      className="plan-value"
      key={text}
      initial={{ opacity: 0, y: 4, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <span className="plan-value-text">{withTokenLogos(text)}</span>
      <span className="plan-flash" aria-hidden="true" />
    </motion.span>
  );
}

function StepRow({ step, index, checked, active }) {
  return (
    <motion.div
      className={`plan-step${active ? " is-active" : ""}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: index * 0.12 }}
    >
      <span className="plan-step-icon">
        <StepIcon kind={step.kind} />
        <AnimatePresence>
          {checked && (
            <motion.span
              className="plan-step-check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
            >
              <Check size={9} strokeWidth={3.5} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <div className="plan-step-body">
        <div className="plan-step-label">
          {index > 0 && <span className="plan-chain">↳</span>}
          {step.label}
          {/* where the funds go: the protocol that runs this step */}
          {step.via && <span className="step-via"> · {step.via}</span>}
          {step.sub && <span className="plan-step-sub"> · {step.sub}</span>}
        </div>
        <div className="plan-step-line">
          <Value text={step.from} />
          <span className="plan-arrow">→</span>
          <Value text={step.to} />
        </div>
      </div>
      {active && <Loader2 size={14} className="plan-spin plan-step-spin" />}
    </motion.div>
  );
}

// What a finished plan leaves in the chat: one line per request
// ("LYRA · Request 1 › send 1 usdc to…"), and its steps, outcome and
// explorer link in a drop-down.
// entry = { n, text, status: "done" | "failed" | "cancelled", steps, error, txUrl }
export function RequestBox({ entry }) {
  const [open, setOpen] = useState(false);
  const badge = entry.status === "done" ? "Done" : entry.status === "failed" ? "Stopped" : "Cancelled";
  return (
    <div className={`request-box is-${entry.status}${open ? " is-open" : ""}`}>
      <button type="button" className="request-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="request-who"><LyraStar /> LYRA</span>
        <span className="request-n">Request {entry.n}</span>
        <span className="request-sep">›</span>
        <span className="request-text">{entry.text}</span>
        <StatusBadge status={entry.status === "done" ? "success" : entry.status === "failed" ? "failed" : "expired"}>{badge}</StatusBadge>
        <ChevronDown size={14} className="request-chev" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="request-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="request-steps">
              {(entry.steps || []).map((s, i) => (
                <div className="request-step" key={i}>
                  <span className="request-step-icon"><StepIcon kind={s.kind} size={13} /></span>
                  <span className="request-step-label">{s.label}{s.via && <span className="step-via"> · {s.via}</span>}</span>
                  <span className="request-step-line">
                    {s.from ? withTokenLogos(s.from) : "…"}
                    {s.to ? <> <span className="plan-arrow">→</span> {withTokenLogos(s.to)}</> : null}
                  </span>
                  {entry.status === "done" && <Check size={12} strokeWidth={3} className="request-step-ok" />}
                </div>
              ))}
            </div>
            {entry.error && <div className="request-error">{entry.error}</div>}
            {entry.status === "cancelled" && <div className="request-note">Cancelled before anything was sent.</div>}
            {entry.txUrl && (
              <a className="plan-txlink" href={entry.txUrl} target="_blank" rel="noreferrer">
                View transaction on the explorer <ExternalLink size={12} />
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HoldButton({ onDone, disabled, children }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(null);
  const start = () => {
    if (disabled) return;
    setHolding(true);
    timer.current = setTimeout(() => { setHolding(false); onDone(); }, 1500);
  };
  const stop = () => { clearTimeout(timer.current); setHolding(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`plan-confirm plan-hold${holding ? " is-holding" : ""}`}
      disabled={disabled}
      onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}
      onTouchStart={start} onTouchEnd={stop} onTouchCancel={stop}
    >
      <span className="plan-hold-fill" aria-hidden="true" />
      <span className="plan-hold-label">{children}</span>
    </button>
  );
}

export function PlanCard({
  phase,               // "thinking" | "review" | "running" | "done" | "failed"
  error: stopError,    // why it stopped (phase "failed")
  steps,
  after = [],
  note,
  warning,
  executable = true,
  activeIndex = -1,    // step running now
  doneCount = 0,       // steps already confirmed on-chain
  txUrl,
  biometric,           // { label } when the wallet can confirm with biometrics
  onConfirm,           // async () => void, after the biometric / hold passed
  onCancel,
  onDone,
}) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const count = steps.length;

  const title =
    phase === "thinking" ? "Putting it together…"
    : phase === "running" ? (count > 1 ? `Running ${count} steps…` : "Running…")
    : phase === "done" ? (count > 1 ? `Done, ${count} steps` : "Done")
    : phase === "failed" ? "Stopped"
    : count > 1 ? `${count} steps, one confirmation` : "Ready when you are";
  const subtitle =
    phase === "review" ? (count > 1 ? "Lyra runs them in order and stops if one fails." : null)
    : phase === "done" ? (count > 1 ? "Every step went through." : "It went through.")
    : phase === "failed" ? (doneCount > 0 ? `${doneCount} of ${count} steps went through, the rest did not run.` : "Nothing was sent.")
    : null;

  async function confirm(viaBiometric) {
    setError("");
    try {
      if (viaBiometric) {
        setScanning(true);
        await biometric.verify();
        // a short beat so the scan reads as a real moment, like the video
        await new Promise(r => setTimeout(r, 450));
        setScanning(false);
      }
      await onConfirm();
    } catch (e) {
      setScanning(false);
      setError(e?.message || "Confirmation cancelled.");
    }
  }

  const [showDetails, setShowDetails] = useState(false);
  const moving = phase === "thinking" || phase === "running";

  return (
    <motion.div
      className={`plan-card is-${phase}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      layout
    >
      {/* while Lyra works, her work log above (phase + seconds) is the title */}
      {phase !== "thinking" && <div className="plan-title-row">
        <span className={`plan-title-icon is-${phase}`}>
          {phase === "done" ? <Check size={12} strokeWidth={3.2} />
            : phase === "failed" ? <X size={12} strokeWidth={3.2} />
            : <LyraStar className={moving ? "is-moving" : ""} />}
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={title}
            className="plan-title"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            {title}
          </motion.span>
        </AnimatePresence>
      </div>}
      {subtitle && <div className="plan-subtitle">{subtitle}</div>}

      <motion.div className={`plan-steps${phase === "running" || phase === "done" || phase === "failed" ? " is-grouped" : ""}`} layout>
        {steps.map((s, i) => (
          <StepRow
            key={i}
            step={s}
            index={i}
            checked={phase === "done" || i < doneCount}
            active={phase === "running" && i === activeIndex}
          />
        ))}
        <AnimatePresence>
          {scanning && (
            <motion.div
              className="plan-scan"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="plan-scan-badge"
                initial={{ scale: 0.85 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <Fingerprint size={34} strokeWidth={1.6} />
                <span className="plan-scan-line" />
                <span>{biometric?.label || "Biometrics"}</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {warning && <div className="plan-warning">{warning}</div>}

      {/* What changes and the fee: in a drop-down, closed by default */}
      {phase !== "thinking" && phase !== "failed" && after.length > 0 && (
        <motion.div
          className="plan-details"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE, delay: 0.15 }}
        >
          <button
            type="button"
            className={`plan-details-toggle${showDetails ? " is-open" : ""}`}
            onClick={() => setShowDetails(o => !o)}
            aria-expanded={showDetails}
          >
            <span>{phase === "done" ? "What changed" : "Transaction details"}</span>
            <ChevronDown size={14} className="plan-details-chev" />
          </button>
          <AnimatePresence initial={false}>
            {showDetails && (
              <motion.div
                className="plan-details-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: "hidden" }}
              >
                {after.length > 0 && (
                  <div className="plan-after-box">
                    {after.map((r, i) => (
                      <div className="plan-after-row" key={i}>
                        <span>{r.label}</span>
                        <strong>
                          {r.before && phase !== "done" && <span className="plan-before">{r.before} → </span>}
                          {withTokenLogos(r.value)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* the network fee, always visible right before confirming */}
      {phase === "review" && note && <div className="plan-note">{note}</div>}

      {/* one explorer link, even for a multi-step plan (its last transaction),
          under the details once it went through */}
      {phase === "done" && txUrl && (
        <a className="plan-txlink" href={txUrl} target="_blank" rel="noreferrer">
          View transaction on the explorer <ExternalLink size={12} />
        </a>
      )}
      {(error || (phase === "failed" && stopError)) && <div className="plan-error">{phase === "failed" ? stopError : error}</div>}

      {phase === "failed" && (
        <div className="plan-actions">
          {txUrl && (
            <a className="plan-link" href={txUrl} target="_blank" rel="noreferrer">
              View what went through <ExternalLink size={12} />
            </a>
          )}
          <button type="button" className="plan-confirm plan-secondary" onClick={onCancel}>Close</button>
        </div>
      )}

      {phase === "review" && (
        <motion.div
          className="plan-actions"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3 }}
        >
          {!executable ? (
            <button type="button" className="plan-confirm plan-secondary" onClick={onCancel}>Close</button>
          ) : biometric ? (
            <FillButton className="plan-confirm" icon={Fingerprint} iconSide="left" onClick={() => confirm(true)} disabled={scanning}>
              Confirm with biometrics
            </FillButton>
          ) : (
            <HoldButton onDone={() => confirm(false)} disabled={scanning}>Hold to confirm</HoldButton>
          )}
          {executable && <button type="button" className="plan-cancel" onClick={onCancel}>Cancel</button>}
        </motion.div>
      )}

      {phase === "running" && (
        <div className="plan-actions">
          <button type="button" className="plan-confirm" disabled>
            <Loader2 size={15} className="plan-spin" /> Confirming…
          </button>
        </div>
      )}

      {phase === "done" && (
        <motion.div
          className="plan-actions"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
        >
          <button type="button" className="plan-confirm" onClick={onDone}>Done</button>
        </motion.div>
      )}
    </motion.div>
  );
}
