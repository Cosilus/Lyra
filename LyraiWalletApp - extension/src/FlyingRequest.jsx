// The request at the top of the plan sheet. When the sheet grows out of the
// Ask Lyra box, the request doesn't pop in: it starts where it was typed
// (same place, same size, plain text) and glides up and to the right while
// its bubble fades in around it.
import React, { useLayoutEffect } from "react";
import { motion, useAnimate } from "framer-motion";

const EASE = [0.65, 0, 0.25, 1];
const PAD_X = 14; // .plan-sheet-request padding, so the text lines up with the typed one
const PAD_Y = 11;

export function FlyingRequest({ text, origin }) {
  const [scope, animate] = useAnimate();

  useLayoutEffect(() => {
    const el = scope.current;
    if (!el || !origin?.text) return;
    const r = el.getBoundingClientRect();
    // the wallet may be scaled (3D view): screen pixels -> its own pixels
    const k = el.offsetWidth / (r.width || 1);
    const s = origin.fontScale || 1;
    // the padding scales with the bubble (scale is from its top-left corner)
    const dx = (origin.text.x - r.left) * k - PAD_X * s;
    const dy = (origin.text.y - r.top) * k - PAD_Y * s;
    // first frame painted already in place, before the animation takes over
    const bg = el.querySelector(".plan-sheet-request-bg");
    const label = el.querySelector(".plan-sheet-request-text");
    el.style.transform = `translateX(${dx}px) translateY(${dy}px) scale(${s})`;
    bg.style.opacity = "0";
    label.style.color = "#F3EBFF";
    // one transform string: it runs on the compositor, smooth even while the
    // wallet is busy with the request
    animate(el, { transform: [`translateX(${dx}px) translateY(${dy}px) scale(${s})`, "translateX(0px) translateY(0px) scale(1)"] }, { duration: 0.62, ease: EASE });
    animate(bg, { opacity: [0, 1] }, { duration: 0.4, delay: 0.25, ease: "easeOut" });
    animate(label, { color: ["#F3EBFF", "#0D0916"] }, { duration: 0.4, delay: 0.25, ease: "easeOut" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div ref={scope} className="plan-sheet-request is-flying" style={{ transformOrigin: "0 0" }}>
      <span className="plan-sheet-request-bg" aria-hidden="true" />
      <span className="plan-sheet-request-text">{text}</span>
    </motion.div>
  );
}
