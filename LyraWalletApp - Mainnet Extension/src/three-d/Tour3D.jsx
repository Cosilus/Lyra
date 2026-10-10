import { createPortal } from "react-dom";

// One stop per menu button, grouped by dock. `index` points at the
// button's position inside that side's menu (see App.jsx's leftMenu3d /
// rightMenu3d), `dock` is which side the box is pinned to while the step
// is showing.
export const TOUR_STEPS = [
  {
    dock: null,
    title: "Welcome to the 3D wallet",
    body: "Same wallet, same Lyra. Move your mouse and the wallet tilts toward you. Your menus now live on its sides, and a quick tour will show you where everything went.",
  },

  { dock: "left", index: 0, title: "Contacts", body: "Your saved addresses. Add, edit or remove the people you send to, so you can just say their name to Lyra." },
  { dock: "left", index: 1, title: "Network", body: "Choose which chain Lyra works on: Plasma, Ethereum, Base, Polygon and more." },
  { dock: "left", index: 2, title: "Chart", body: "Your portfolio chart. It used to sit under your balance; now it opens from here." },
  { dock: "left", index: 3, title: "Help", body: "Examples of what to ask Lyra, a reminder of how 3D works, and this tour whenever you want it again." },
  { dock: "left", index: 4, title: "Settings", body: "Security, auto-lock, biometrics, extra protection, backup, and the 2D / 3D switch. Everything about how your wallet behaves." },

  { dock: "right", index: 0, title: "Send history", body: "Everything you have sent: who got it, how much, and when. Tap a line to open it on the explorer." },
  { dock: "right", index: 1, title: "Receive history", body: "Everything that arrived in your wallet. New deposits show up here and in your balance on their own." },
  { dock: "right", index: 2, title: "Swap history", body: "Your token swaps, kept apart from your transfers." },
  { dock: "right", index: 3, title: "Bridge history", body: "Your cross-chain transfers from one network to another." },
  { dock: "right", index: 4, title: "Stake history", body: "What you deposited into or withdrew from staking." },

  { dock: "top", title: "Assets", body: "Push the mouse to the top edge to pull up every asset you hold with its USD value. Hover the icon for the name, or the value for the exact amount." },

  // only in the floating card on a website (cardBridge.js): the side panel doesn't move
  {
    dock: null,
    cardOnly: true,
    preview: "move",
    title: "Move mode",
    body: "Press and hold the wallet anywhere that isn't a button. After a short moment it follows your mouse: drag it wherever you like on the page and let go to drop it.",
  },

  {
    dock: null,
    title: "You're all set",
    body: "Push to the left or right edge for the side menus, and to the top for your assets. You can replay this tour or switch back to 2D any time in Settings.",
  },
];

// The steps for where the wallet runs now (the move step only in the floating card)
export function tourStepsHere() {
  const card = typeof document !== "undefined" && document.documentElement.classList.contains("lyra-card");
  return TOUR_STEPS.filter(s => !s.cardOnly || card);
}

// A looping preview of move mode: the pointer presses the wallet, the ring
// fills while it is held, then the wallet follows the pointer and is dropped.
function MovePreview() {
  return (
    <div className="d3-tour-move" aria-hidden="true">
      <div className="mv-page">
        <span className="mv-line" /><span className="mv-line short" /><span className="mv-line" />
      </div>
      <div className="mv-group">
        <div className="mv-card">
          <span className="mv-chip">Moving</span>
          <span className="mv-bal" />
          <span className="mv-bal short" />
          <span className="mv-ask" />
        </div>
        <div className="mv-pointer">
          <svg className="mv-ring" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" />
          </svg>
          <svg className="mv-cursor" viewBox="0 0 24 24" width="18" height="18">
            <path d="M5 3l14 7.5-6.2 1.6L10 18.5z" fill="#FBF8FF" stroke="#1A1028" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// Floating coach-mark. Rendered in <body> (not inside the 3D scene) so
// it is a true fixed overlay; its transparent backdrop keeps stray
// clicks off the wallet while the tour is running.
export function Tour3D({ step, total, steps = TOUR_STEPS, onNext, onBack, onSkip }) {
  const s = steps[step];
  const first = step === 0;
  const last = step === total - 1;
  return createPortal(
    <div className="d3-tour-backdrop" role="dialog" aria-modal="true" aria-label="3D wallet tour">
      <div className="d3-tour-card" key={step}>
        <div className="d3-tour-meta">
          <span>{s.dock === "left" ? "Left menu" : s.dock === "right" ? "Right menu" : s.dock === "top" ? "Top edge" : s.preview === "move" ? "On any website" : "Tour"}</span>
          <span>{step + 1} / {total}</span>
        </div>
        <div className="d3-tour-title">{s.title}</div>
        {s.preview === "move" && <MovePreview />}
        <p className="d3-tour-body">{s.body}</p>
        <div className="d3-tour-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={i === step ? "on" : i < step ? "done" : ""} />
          ))}
        </div>
        <div className="d3-tour-actions">
          {!last ? <button type="button" className="d3-tour-skip" onClick={onSkip}>Skip tour</button> : <span />}
          <div className="d3-tour-nav">
            {!first && <button type="button" className="d3-tour-back" onClick={onBack}>Back</button>}
            <button type="button" className="d3-tour-next" onClick={onNext} autoFocus>
              {first ? "Start tour" : last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
