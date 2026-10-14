import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Coins, Mic, MousePointer2, X } from "lucide-react";
import { LyraStar } from "./PlanCard.jsx";
import "./ask-dock.css";

// Mobile app, 3D interface: Ask Lyra lives at the bottom of the screen, where
// the thumb is. The bar (with a few quick actions above it) opens a sheet from
// the bottom; the wallet steps back behind it (html.ask-sheet-open, see
// ask-dock.css) and the usual Ask Lyra box takes the sheet, keyboard up.
// Sending closes the sheet: the plan then opens as it always does.

const QUICK = [
  { key: "send", label: "Send", Icon: ArrowUpRight },
  { key: "receive", label: "Receive", Icon: ArrowDownLeft },
  { key: "swap", label: "Swap", Icon: ArrowLeftRight },
  { key: "stake", label: "Stake", Icon: Coins },
];

export function AskDock({ hidden = false, onOpen, onQuick }) {
  if (hidden) return null;
  return (
    <div className="ask-dock" role="region" aria-label="Ask Lyra">
      <div className="ask-dock-quick">
        {QUICK.map(({ key, label, Icon }) => (
          <button key={key} type="button" className="ask-dock-chip" onClick={() => onQuick?.(key)}>
            <Icon size={15} strokeWidth={2} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="ask-dock-bar">
        <button type="button" className="ask-dock-open" onClick={() => onOpen?.({ voice: false })} aria-label="Ask Lyra">
          <LyraStar />
          <span>Ask Lyra</span>
        </button>
        <button type="button" className="ask-dock-mic" onClick={() => onOpen?.({ voice: true })} aria-label="Talk to Lyra">
          <Mic size={18} strokeWidth={2} />
        </button>
        <button type="button" className="ask-dock-send" onClick={() => onOpen?.({ voice: false })} aria-label="Ask Lyra" tabIndex={-1}>
          <MousePointer2 size={15} fill="currentColor" strokeWidth={0} style={{ transform: "rotate(135deg)" }} />
        </button>
      </div>
    </div>
  );
}

export function AskSheet({ open, onClose, children }) {
  // only the grip and the header drag the sheet down: the box itself must keep
  // its own touch (selecting text, scrolling the ideas)
  const drag = useDragControls();
  // the wallet behind steps back while the sheet is up
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("ask-sheet-open", !!open);
    return () => root.classList.remove("ask-sheet-open");
  }, [open]);

  // Escape (keyboard, or a hardware back on some Androids) closes it
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="ask-sheet-layer" key="ask-sheet">
          <motion.div
            className="ask-sheet-scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
          <motion.section
            className="ask-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Ask Lyra"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose?.(); }}
          >
            <div className="ask-sheet-grip" aria-hidden="true" onPointerDown={e => drag.start(e)} />
            <header className="ask-sheet-head" onPointerDown={e => { if (!e.target.closest("button")) drag.start(e); }}>
              <button type="button" className="ask-sheet-close" onClick={onClose} aria-label="Close">
                <X size={20} strokeWidth={2} />
              </button>
              <div className="ask-sheet-title">
                <LyraStar />
                <span>Ask Lyra</span>
              </div>
            </header>
            <div className="ask-sheet-body">{children}</div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
