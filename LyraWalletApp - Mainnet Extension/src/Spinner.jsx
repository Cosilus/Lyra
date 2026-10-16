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
  return (
    <span ref={ref} className={`lyra-orb ${className}`} style={{ display: "inline-flex", flex: "0 0 auto", verticalAlign: "middle", width: size, height: size, ...style }}>
      <ThinkingOrb state="composing" size={size > 30 ? 64 : 20} theme={theme} aria-label="Loading" style={{ width: size, height: size }} />
    </span>
  );
}
