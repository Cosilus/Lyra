// The hold-to-confirm "staircase": a diamond of squares grows from the
// button's centre while it is held (same look as the website). Driven
// imperatively through drawRef(progress 0-100), never through React state,
// so holding doesn't re-render anything; draw(0) shrinks it back.
import React, { useEffect, useRef } from "react";

export function HoldSquares({ drawRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const btn = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    const ROWS = 5;        // odd, so a row of squares sits on the centre line
    const SPAN = 3.2;      // width of the soft edge, in squares
    const RETRACT_MS = 420;
    let shown = 0;
    let retractRaf = 0;

    function paint(progress) {
      const rect = btn.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = rect.width || 260;
      const h = rect.height || 50;

      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (progress <= 0) {
        btn.classList.remove("dots-cover");
        return;
      }

      const cell = h / ROWS;
      const halfRows = (ROWS - 1) / 2;
      const halfCols = Math.ceil(w / 2 / cell);
      const R = (progress / 100) * (halfRows + halfCols + SPAN);

      // Flip the label to white once the wave has grown past its ends.
      const label = btn.querySelector(".hold-content");
      let textW = 0;
      if (label) {
        const range = document.createRange();
        range.selectNodeContents(label);
        textW = range.getBoundingClientRect().width;
      }
      btn.classList.toggle("dots-cover", R - textW / 2 / cell - halfRows > SPAN * 0.7);

      // the button can set its own square colour (--hold-square), violet by default
      ctx.fillStyle = getComputedStyle(btn).getPropertyValue("--hold-square").trim() || "#6D4FD1";
      for (let j = -halfRows; j <= halfRows; j++) {
        for (let i = -halfCols; i <= halfCols; i++) {
          let t = (R - (Math.abs(i) + Math.abs(j))) / SPAN;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          if (t <= 0.01) continue;
          t = t * t * (3 - 2 * t);
          const side = t >= 1 ? cell + 0.75 : cell * (0.3 + 0.7 * t);
          ctx.globalAlpha = t >= 1 ? 1 : 0.25 + 0.75 * t;
          ctx.fillRect(w / 2 + i * cell - side / 2, h / 2 + j * cell - side / 2, side, side);
        }
      }
      ctx.globalAlpha = 1;
    }

    function draw(progress) {
      if (progress > 0) {
        cancelAnimationFrame(retractRaf);
        retractRaf = 0;
        shown = progress;
        paint(progress);
        return;
      }
      if (retractRaf) return; // already shrinking back
      if (shown <= 0) {
        paint(0);
        return;
      }
      const from = shown;
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min((now - t0) / (RETRACT_MS * Math.max(0.35, from / 100)), 1);
        shown = from * (1 - k * k);
        paint(shown);
        if (k >= 1) {
          shown = 0;
          paint(0);
          retractRaf = 0;
          return;
        }
        retractRaf = requestAnimationFrame(step);
      };
      retractRaf = requestAnimationFrame(step);
    }

    draw(0);
    drawRef.current = draw;
    return () => {
      cancelAnimationFrame(retractRaf);
      if (drawRef.current === draw) drawRef.current = null;
    };
  }, [drawRef]);

  return <canvas ref={canvasRef} className="hold-squares" />;
}
