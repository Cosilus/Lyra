import { useEffect, useRef, useState } from "react";
import { HELP_FAQ } from "./helpFaq.js";

// Wallet FAQ: category chips on top, one accordion of questions below
// (same pattern as the website's FAQ). Changing tab fades the current
// list out first, then the next one in, instead of swapping instantly.
const FADE_OUT_MS = 150;

export function HelpFaq({ mode = "3d", onReplayTour, onSwitchMode }) {
  const [cat, setCat] = useState(HELP_FAQ[0].id);
  const [leaving, setLeaving] = useState(false);
  const [openQ, setOpenQ] = useState(HELP_FAQ[0].items[0].q);
  const timer = useRef(null);
  const group = HELP_FAQ.find(g => g.id === cat) || HELP_FAQ[0];

  useEffect(() => () => clearTimeout(timer.current), []);

  function pickTab(id) {
    if (id === cat) return;
    clearTimeout(timer.current);
    setLeaving(true);
    timer.current = setTimeout(() => {
      setCat(id);
      setOpenQ(HELP_FAQ.find(g => g.id === id)?.items[0].q ?? null);
      setLeaving(false);
    }, FADE_OUT_MS);
  }

  return (
    <div className="faq">
      <div className="faq-tabs" role="tablist">
        {HELP_FAQ.map(g => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === cat}
            className={`faq-tab${g.id === cat ? " active" : ""}`}
            onClick={() => pickTab(g.id)}
          >
            <span className="faq-tab-label">{g.label}</span>
            <span className="faq-tab-fill" />
          </button>
        ))}
      </div>

      <div className="faq-stage">
        <div className={`faq-list${leaving ? " leaving" : ""}`} key={group.id}>
          {group.items.map(item => {
            const open = openQ === item.q;
            return (
              <div className={`faq-q${open ? " open" : ""}`} key={item.q}>
                <button
                  type="button"
                  className="faq-qb"
                  aria-expanded={open}
                  onClick={() => setOpenQ(open ? null : item.q)}
                >
                  <span>{item.q}</span>
                  <i aria-hidden="true">+</i>
                </button>
                <div className="faq-qa-wrap" aria-hidden={!open}>
                  <div className="faq-qa">
                    <p>{item.a}</p>
                    {item.chips && (
                      <div className="faq-chips" aria-label="Examples">
                        {item.chips.map(c => (
                          <span key={c} className="faq-chip">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="faq-foot">
        {mode === "3d" ? (
          <>
            <button type="button" className="faq-foot-btn" onClick={onReplayTour}>Replay the 3D tour</button>
            <button type="button" className="faq-foot-btn faq-foot-btn--ghost" onClick={() => onSwitchMode("2d")}>Back to 2D</button>
          </>
        ) : (
          <button type="button" className="faq-foot-btn" onClick={() => onSwitchMode("3d")}>Try the 3D interface</button>
        )}
      </div>
    </div>
  );
}
