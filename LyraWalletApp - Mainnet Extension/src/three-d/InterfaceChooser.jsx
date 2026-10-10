import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import "./interface-chooser.css";

// Rough, looping animated previews (not real videos): a mini phone with
// a mouse cursor, just enough to show the two real differences -- how the
// menus open, and what the card does when the mouse moves.

// `variant` mirrors the real difference: the classic 2D frame has the
// header "Menu" button and the chart under the balance; in 3D both are
// gone (menus live on the sides, the chart opens from the left menu).
function MiniPhone({ variant }) {
  const is2d = variant === "2d";
  return (
    <div className="ic-phone">
      <div className="ic-phone-glow" />
      <div className="ic-phone-top">
        <img className="ic-phone-logo" src="/logo.svg" alt="" />
        {is2d && <span className="ic-phone-menu-btn">Menu</span>}
      </div>
      <div className="ic-phone-balance">
        <span className="ic-line ic-line--s" />
        <span className="ic-line ic-line--l" />
      </div>
      {is2d && (
        <div className="ic-phone-chart">
          <svg viewBox="0 0 100 30" preserveAspectRatio="none">
            <path d="M0 24 L18 18 L34 21 L52 10 L70 14 L100 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      <div className="ic-phone-chat">
        <span className="ic-line ic-line--m" />
      </div>
      <div className="ic-phone-input">
        <span className="ic-line ic-line--s" />
        <span className="ic-phone-send" />
      </div>
    </div>
  );
}

function Cursor() {
  return (
    <svg className="ic-cursor" viewBox="0 0 24 24" width="18" height="18">
      <path d="M4 3l15 7-6.5 2L10 19z" fill="#fff" stroke="#1a1028" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function Preview2D() {
  return (
    <div className="ic-scene ic-scene--2d" aria-hidden="true">
      <MiniPhone variant="2d" />
      <div className="ic-circle-menu">
        <span /><span /><span />
      </div>
      <Cursor />
    </div>
  );
}

function Preview3D() {
  return (
    <div className="ic-scene ic-scene--3d" aria-hidden="true">
      <div className="ic-side ic-side--left"><span /><span /><span /></div>
      <div className="ic-side ic-side--right"><span /><span /><span /></div>
      <div className="ic-top-menu"><span /><span /><span /></div>
      <div className="ic-tilt">
        <MiniPhone variant="3d" />
      </div>
      <Cursor />
    </div>
  );
}

const CARDS = {
  "2d": {
    title: "Classic 2D",
    body: (
      <>
        <p>
          The familiar flat wallet. Everything sits on one calm screen: open the <strong>Menu</strong> at the top right
          for contacts, transactions, network and settings, and follow your portfolio on the chart.
        </p>
        <p className="ic-card-note">Doesn't react to the mouse.</p>
      </>
    ),
    cta: "Choose 2D",
    Preview: Preview2D,
  },
  "3d": {
    title: "Immersive 3D",
    body: (
      <>
        <p>
          The same wallet floating in depth. It <strong>tilts as your mouse moves</strong>. Push to the left or right edge of the
          screen for contacts, settings and history, or to the top for your assets.
        </p>
        <p className="ic-card-note">Built for a mouse. Great on desktop.</p>
      </>
    ),
    cta: "Choose 3D",
    Preview: Preview3D,
  },
};

// Shown once, right after a wallet is created/imported and secured.
// A 2D | 3D pill on top (same look as the one in Settings) picks which card is shown: the current
// card fades out while the other fades in. The button on the card applies that interface.
export function InterfaceChooser({ onChoose }) {
  const [mode, setMode] = useState("3d");

  function select(next) {
    if (next !== mode) setMode(next);
  }

  return createPortal(
    <div className="ic-overlay" role="dialog" aria-modal="true" aria-label="Choose your interface">
      <div className="ic-panel">
        <div className="ic-head">
          <div className="ic-title">Choose your wallet experience</div>
          <div className="ic-subtitle">Same wallet, same Lyra. Only the way you move around it changes.</div>
        </div>

        <div className={`ic-pill${mode === "3d" ? " is-3d" : ""}`} role="tablist" aria-label="Interface">
          <span className="ic-pill-thumb" />
          <button type="button" role="tab" aria-selected={mode === "2d"} className={mode === "2d" ? "active" : ""} onClick={() => select("2d")}>2D</button>
          <button type="button" role="tab" aria-selected={mode === "3d"} className={mode === "3d" ? "active" : ""} onClick={() => select("3d")}>3D</button>
        </div>

        <div className="ic-deck">
          {["2d", "3d"].map((id) => {
            const c = CARDS[id];
            const selected = mode === id;
            return (
              <motion.div
                key={id}
                className={`ic-card ic-card--deck${selected ? " is-selected" : ""}`}
                aria-hidden={!selected}
                initial={false}
                animate={{ opacity: selected ? 1 : 0 }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
              >
                <c.Preview />
                <div className="ic-card-body">
                  <div className="ic-card-title">{c.title}</div>
                  {c.body}
                </div>
                <button
                  type="button"
                  className="ic-card-cta"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => { if (selected) onChoose(id); }}
                >
                  {c.cta}
                </button>
              </motion.div>
            );
          })}
        </div>

        <div className="ic-footer">You can switch at any time in <strong>Settings → Interface</strong>.</div>
      </div>
    </div>,
    document.body
  );
}
