import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StepIcon, withTokenLogos } from "../PlanCard.jsx";
const IS_APP = false; // the testnet extension has no web-app build
import { isTouchOnly } from "./TiltActivation.jsx";
import "./plan-scene.css";

// While Lyra prepares a plan of several steps (computer only), the plan sheet
// becomes a small 3D scene instead of a list that waits:
// - the request lands in the middle, word by word from above;
// - the starfield of the first website fades in around it;
// - for each step the camera steps back: what was there goes into the
//   distance, toward the vanishing point, the stars rush past, and the step
//   comes from the camera, in the wallet's own step box;
// - a step gets its green check when Lyra has really prepared it (the
//   "Step k of n" progress the server reports), never on a timer;
// - when the plan is ready the scene steps back once more and the usual plan
//   card (the recap) takes over; its boxes come closer under the pointer.
// The stars never cross the texts: they thin out around the middle.

export const PLAN_3D_KEY = "lyra_plan_3d_v1";
export function plan3dEnabled() {
  if (IS_APP || isTouchOnly()) return false;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  try { return localStorage.getItem(PLAN_3D_KEY) !== "off"; } catch { return true; }
}
export function setPlan3d(on) {
  try { localStorage.setItem(PLAN_3D_KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
}

const MOVE = { duration: 1100, easing: "cubic-bezier(0.65, 0, 0.25, 1)", fill: "forwards" };
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
// the track: slot 0 in focus, each older item one slot further back (toward
// the vanishing point); slot -1 is at the camera
const SLOT = { y: -24, z: -320 };
const pose = (k) => ({
  transform: `translate3d(0px, ${k < 0 ? 70 : k * SLOT.y}px, ${k < 0 ? 380 : k * SLOT.z}px)`,
  opacity: k < 0 ? 0 : [1, 0.85, 0.6, 0.3, 0.12][Math.min(k, 4)],
  filter: `blur(${k < 0 ? 10 : [0, 0, 0.5, 1.2, 2][Math.min(k, 4)]}px)`,
});

// ---- the starfield (the first website's) ----
const STARS = { count: 380, depth: 1600, focal: 230, step: 260 };
function makeSprites() {
  const make = (r, g, b) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.18, `rgba(${r},${g},${b},0.85)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},0.18)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    return c;
  };
  return [make(255, 255, 255), make(255, 214, 170), make(170, 200, 255)];
}
function makeStars() {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  for (let i = 0; i < STARS.count; i++) {
    const roll = rnd();
    const angle = rnd() * Math.PI * 2;
    const radius = 30 + Math.pow(rnd(), 0.7) * 900;
    out.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: rnd() * STARS.depth, size: 0.5 + rnd() * 1.6, tone: roll < 0.7 ? 0 : roll < 0.9 ? 1 : 2, tw: rnd() * Math.PI * 2 });
  }
  return out;
}
const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function bezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    let t = x;
    for (let k = 0; k < 8; k++) {
      const d = sx(t) - x, dx = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-5 || !dx) break;
      t -= d / dx;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}
const moveEase = bezier(0.65, 0, 0.25, 1);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// the request's words, numbers and tokens standing out a little
function requestWords(text) {
  return String(text || "").replace(/0x[0-9a-fA-F]{40}/g, a => `${a.slice(0, 6)}…${a.slice(-4)}`).split(/\s+/).filter(Boolean);
}

export function PlanScene3D({ request, steps: liveSteps, ready, settled, leaving, onSettled }) {
  // the steps as read when the request was sent: the scene keeps them, the
  // recap shows the plan Lyra really made
  const [steps] = useState(liveSteps);
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const trackRef = useRef(null);
  const st = useRef({ alive: true, queue: Promise.resolve(), items: [], shown: 0, checked: 0, cam: 0, camNow: 0, settling: false, settled: false });
  const props = useRef({ ready, settled, steps, onSettled });
  props.current = { ready, settled, steps, onSettled };

  // ---- stars: drawn every frame while the scene is up ----
  useEffect(() => {
    const s = st.current;
    const sprites = makeSprites();
    const stars = makeStars();
    let raf = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      const c = canvasRef.current, root = rootRef.current;
      if (!c || !root) return;
      const W = root.clientWidth, H = root.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!W || !H) return;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const g = c.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      const t = now / 1000, cam = s.camNow, roll = cam * 0.00012;
      const cosR = Math.cos(roll), sinR = Math.sin(roll), cx = W / 2, cy = H * 0.31, D = STARS.depth;
      for (const p of stars) {
        let z = ((p.z - cam) % D + D) % D;
        if (z < 24) continue;
        const k = STARS.focal / z;
        const sx = cx + (p.x * cosR - p.y * sinR) * k, sy = cy + (p.x * sinR + p.y * cosR) * k;
        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
        const a = smoothstep(0, 0.25, 1 - z / D) * smoothstep(24, 120, z) * (0.8 + 0.2 * Math.sin(t * 1.6 + p.tw));
        if (a < 0.02) continue;
        const size = Math.max(2, p.size * k * 5);
        g.globalAlpha = Math.min(1, a);
        g.drawImage(sprites[p.tone], sx - size / 2, sy - size / 2, size, size);
      }
      g.globalAlpha = 1;
      // no star over the plan: the field thins out softly around the middle
      g.globalCompositeOperation = "destination-out";
      g.save();
      g.translate(cx, H * 0.41);
      g.scale(1, 0.55);
      const r = Math.max(W * 0.62, 250);
      const clear = g.createRadialGradient(0, 0, 0, 0, 0, r);
      clear.addColorStop(0, "rgba(0,0,0,1)");
      clear.addColorStop(0.62, "rgba(0,0,0,0.92)");
      clear.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = clear;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
      g.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(draw);
    return () => { s.alive = false; cancelAnimationFrame(raf); };
  }, []);

  // the camera flies forward through the stars during a step back, only then
  function moveCamera() {
    const s = st.current;
    const from = s.cam, to = s.cam + STARS.step, t0 = performance.now();
    s.cam = to;
    const tick = (now) => {
      if (!s.alive) return;
      const p = Math.min(1, (now - t0) / MOVE.duration);
      s.camNow = from + (to - from) * moveEase(p);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  // every item one slot further back, the stars rush past
  function stepBack() {
    for (const it of st.current.items) {
      it.el.animate([pose(it.slot), pose(it.slot + 1)], MOVE);
      it.slot += 1;
    }
    moveCamera();
  }
  const enqueue = (fn) => { const s = st.current; s.queue = s.queue.then(() => (s.alive ? fn() : null)).catch(() => {}); return s.queue; };

  // the step boxes in the track get their places before the first paint
  useLayoutEffect(() => {
    trackRef.current?.querySelectorAll(".ps3d-step").forEach(el => Object.assign(el.style, { opacity: "0" }));
  }, []);

  // ---- intro: the words, then the stars ----
  useEffect(() => {
    const s = st.current;
    const req = trackRef.current?.querySelector(".ps3d-req");
    if (!req) return;
    s.items.push({ el: req, slot: 0 });
    const words = [...req.querySelectorAll(".ps3d-w")];
    words.forEach((w, i) => w.animate(
      [{ opacity: 0, transform: "translateY(-14px)", filter: "blur(5px)" }, { opacity: 1, transform: "translateY(0)", filter: "blur(0)" }],
      { duration: 480, delay: 120 + i * 60, easing: EASE, fill: "forwards" }));
    canvasRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2400, delay: 200, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" });
    enqueue(() => sleep(Math.min(1600, 300 + words.length * 60)));
    enqueue(() => enterStep(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enterStep(i) {
    const s = st.current;
    const el = trackRef.current?.querySelector(`.ps3d-step[data-i="${i}"]`);
    if (!el || s.settling) return;
    stepBack();
    el.animate([pose(-1), pose(0)], MOVE);
    s.items.push({ el, slot: 0 });
    s.shown = i + 1;
    await sleep(MOVE.duration);
  }
  async function checkStep(i, quick = false) {
    const s = st.current;
    const el = trackRef.current?.querySelector(`.ps3d-step[data-i="${i}"]`);
    if (!el || s.checked > i) return;
    s.checked = i + 1;
    el.classList.remove("is-active");
    el.querySelector(".plan-step-check")?.animate([{ transform: "scale(0)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 420, easing: EASE, fill: "forwards" });
    el.animate([
      { boxShadow: "0 0 0 0 rgba(61,220,132,0)", borderColor: "rgba(167,139,250,0.34)" },
      { boxShadow: "0 0 26px 0 rgba(61,220,132,0.28)", borderColor: "rgba(61,220,132,0.5)" },
      { boxShadow: "0 24px 50px -18px rgba(0,0,0,0.95)", borderColor: "rgba(196,176,255,0.34)" },
    ], { duration: 900, easing: "ease-out" });
    await sleep(quick ? 250 : 750);
  }

  // ---- a step is ready: its check, then the next one comes ----
  useEffect(() => {
    const s = st.current;
    if (s.settling) return;
    const n = props.current.steps.length;
    for (let i = s.checked; i < Math.min(ready, n); i++) {
      enqueue(async () => {
        if (s.shown <= i) await enterStep(i);
        await checkStep(i);
        if (i + 1 < n && !props.current.settled) await enterStep(i + 1);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ---- the plan is ready: the rest gets its check quickly, the scene steps back for the recap ----
  useEffect(() => {
    if (!settled) return;
    const s = st.current;
    enqueue(async () => {
      const n = props.current.steps.length;
      for (let i = s.checked; i < n; i++) {
        if (s.shown <= i) {
          // not shown yet: a short pass, so every step was seen once
          const el = trackRef.current?.querySelector(`.ps3d-step[data-i="${i}"]`);
          if (el) {
            stepBack();
            el.animate([pose(-1), pose(0)], { ...MOVE, duration: 600 });
            s.items.push({ el, slot: 0 });
            s.shown = i + 1;
            await sleep(450);
          }
        }
        await checkStep(i, true);
      }
      // the last step stays on screen a moment, checked, before the recap
      await sleep(800);
      s.settling = true;
      stepBack();
      for (const it of s.items) it.el.animate([{ opacity: pose(it.slot).opacity }, { opacity: 0 }], { duration: 650, delay: 250, fill: "forwards" });
      canvasRef.current?.animate([{ opacity: 1 }, { opacity: 0.3 }], { duration: 900, fill: "forwards" });
      await sleep(550);
      s.settled = true;
      props.current.onSettled?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  // ---- confirmed (or closed): the stars go ----
  useEffect(() => {
    if (!leaving) return;
    canvasRef.current?.animate([{ opacity: 0.3 }, { opacity: 0 }], { duration: 700, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" });
  }, [leaving]);

  // ---- the recap: a box comes closer under the pointer, tilting toward it ----
  useEffect(() => {
    const sheet = rootRef.current?.closest(".plan-sheet");
    if (!sheet) return;
    const SEL = ".plan-steps .plan-step, .plan-details, .plan-confirm, .plan-sim, .plan-after-box";
    let current = null;
    const reset = (el) => { if (el) el.style.transform = ""; };
    const onMove = (e) => {
      if (!st.current.settled) return;
      const el = e.target instanceof Element ? e.target.closest(SEL) : null;
      if (el !== current) { reset(current); current = el; }
      if (!el) return;
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `translateZ(28px) rotateX(${(-ny * 8).toFixed(2)}deg) rotateY(${(nx * 9).toFixed(2)}deg)`;
    };
    const onLeave = () => { reset(current); current = null; };
    sheet.addEventListener("pointermove", onMove);
    sheet.addEventListener("pointerleave", onLeave);
    return () => { sheet.removeEventListener("pointermove", onMove); sheet.removeEventListener("pointerleave", onLeave); reset(current); };
  }, []);

  // what the boxes show: the plan Lyra made once it is there (real amounts,
  // "≈ 0.0802 USDT0" instead of "… USDT"), the words of the request before
  const shown = steps.map((st, i) => (liveSteps?.length === steps.length && liveSteps[i] ? liveSteps[i] : st));
  const words = requestWords(request);
  return (
    <div className="ps3d" ref={rootRef} aria-hidden="true">
      <canvas className="ps3d-stars" ref={canvasRef} />
      <div className="ps3d-stage">
        <div className="ps3d-track" ref={trackRef}>
          <div className="ps3d-item ps3d-req">
            {words.map((w, i) => {
              const cls = /^\$?\d/.test(w) ? " is-num" : /^[A-Z][A-Z0-9.]{1,9}[,.]?$/.test(w) || /^(usdc|usdt0?|eurc|xpl|eth|weth|pol|hype|usd)[,.]?$/i.test(w) ? " is-tok" : "";
              return <span key={i} className={`ps3d-w${cls}`}>{w}{i < words.length - 1 ? " " : ""}</span>;
            })}
          </div>
          {shown.map((step, i) => (
            <div key={i} data-i={i} className="ps3d-item ps3d-step plan-step is-active">
              <span className="plan-step-icon">
                <StepIcon kind={step.kind} />
                <span className="plan-step-check ps3d-check">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
              </span>
              <div className="plan-step-body">
                <div className="plan-step-label">
                  {step.label}
                  {step.via && <span className="step-via"> · {step.via}</span>}
                </div>
                <div className="plan-step-line">
                  <span className="plan-value-text">{withTokenLogos(step.from || "…")}</span>
                  <span className="plan-arrow">→</span>
                  <span className="plan-value-text">{withTokenLogos(step.to || "…")}</span>
                </div>
              </div>
              <svg className="ps3d-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
