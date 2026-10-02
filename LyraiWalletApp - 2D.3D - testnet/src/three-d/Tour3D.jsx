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

  {
    dock: null,
    title: "You're all set",
    body: "Push to the left or right edge for the side menus, and to the top for your assets. You can replay this tour or switch back to 2D any time in Settings.",
  },
];

// Floating coach-mark. Rendered in <body> (not inside the 3D scene) so
// it is a true fixed overlay; its transparent backdrop keeps stray
// clicks off the wallet while the tour is running.
export function Tour3D({ step, total, onNext, onBack, onSkip }) {
  const s = TOUR_STEPS[step];
  const first = step === 0;
  const last = step === total - 1;
  return createPortal(
    <div className="d3-tour-backdrop" role="dialog" aria-modal="true" aria-label="3D wallet tour">
      <div className="d3-tour-card" key={step}>
        <div className="d3-tour-meta">
          <span>{s.dock === "left" ? "Left menu" : s.dock === "right" ? "Right menu" : s.dock === "top" ? "Top edge" : "Tour"}</span>
          <span>{step + 1} / {total}</span>
        </div>
        <div className="d3-tour-title">{s.title}</div>
        <p className="d3-tour-body">{s.body}</p>
        <div className="d3-tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((_, i) => (
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
