// A question before something that can't be undone from the wallet (removing
// an address, removing a multisig): a small sheet over the blurred wallet,
// a red button to go ahead, Cancel (or Escape, or a tap outside) to stay.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { overlayRoot } from "./cardBridge.js";
import "./confirm-dialog.css";

export function ConfirmDialog({ open, title, text, note, confirmLabel = "Remove", onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="cd-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2, delay: 0.1 } }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
          <motion.div
            className="cd-sheet"
            role="alertdialog"
            aria-label={title}
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98, transition: { duration: 0.2, ease: [0.55, 0, 0.8, 0.2] } }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            <span className="cd-icon"><AlertTriangle size={20} strokeWidth={2.2} /></span>
            <div className="cd-title">{title}</div>
            <p className="cd-text">{text}</p>
            {note && <p className="cd-note">{note}</p>}
            <div className="cd-actions">
              <button type="button" className="cd-cancel" onClick={onCancel} autoFocus>Cancel</button>
              <button type="button" className="cd-confirm" onClick={onConfirm}>{confirmLabel}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    overlayRoot()
  );
}
