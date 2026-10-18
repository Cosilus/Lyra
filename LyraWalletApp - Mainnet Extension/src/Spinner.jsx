import { useLayoutEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";

// Lyra's loading mark: the "Thinking" orb (thinking-orbs, composing state)
// in place of a spinning ring. The orb is monochrome, so its ink follows the
// text around it: light dots on a dark surface, dark dots inside a light button.
export default function Spinner({ size = 16, className = "", style }) {
  const ref = useRef(null);
  const [theme, setTheme] = useState("dark");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g);
    if (!m) return;
    const [r, g, b] = m.map(Number);
    setTheme(0.299 * r + 0.587 * g + 0.114 * b > 128 ? "dark" : "light");
  }, []);
  // drawn bigger than the slot it replaces (a 14px ring read as a speck):
  // the extra height overflows evenly, so lines and buttons keep their size
  const shown = Math.max(22, Math.round(size * 1.6));
  const preset = shown >= 48 ? 64 : shown >= 28 ? 32 : 20;
  const bleed = (shown - size) / 2;
  return (
    <span ref={ref} className={`lyra-orb ${className}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", verticalAlign: "middle", width: shown, height: shown, margin: `${-bleed}px 0`, ...style }}>
      <ThinkingOrb state="composing" size={preset} dotSize={shown < 28 ? 1.25 : 1} theme={theme} aria-label="Loading" style={{ width: shown, height: shown }} />
    </span>
  );
}
