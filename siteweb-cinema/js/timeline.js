/*
 * One scroll progress p in [0, 1] drives everything, and it is LINEAR: every part of the scroll does
 * something. The scroll distance of each part is set in "vh" below; chapters get a distance
 * proportional to how long their conversation is, so typing runs at a constant speed per scroll.
 * This module turns p into a plain object of named phases. It knows nothing about the DOM.
 */
import { CH, N, TOTAL } from "./story.js";
import { planOf } from "./chapters.js";
import { clamp, ease, easeOut } from "./util.js";

/* ---- scroll budget, in vh ---- */
const VH_PER_SECOND = 16;    // scroll distance per second of virtual conversation
const MIN_CHAPTER = 60;      // never shorter than this
const INTRO = 40;            // hero title, device lies on the desk
const OPEN = 100;            // the device wakes up and rises
const MENU = 70;             // interactive menu step
const OUTRO = 175;           // device closes, camera pulls back, sheet slides in

const FIRST_LEAD = 2000;    // ms of virtual time before the first question starts, so the hands arrive first
export const plans = CH.map((c, i) => planOf(c, i === 0 ? FIRST_LEAD : 0));
const chapterVh = plans.map((pl) => Math.max(MIN_CHAPTER, (pl.total / 1000) * VH_PER_SECOND));

/* cumulative starts of each chapter (index 0..N-1) and of the menu */
const starts = [];
let acc = INTRO + OPEN;
for (const vh of chapterVh) { starts.push(acc); acc += vh; }
const MENU_START = acc;
const END_VH = acc + MENU;
export const TOTAL_VH = END_VH + OUTRO;

/* Height of the scroll track: the scrollable distance is track - viewport. */
export const TRACK_VH = TOTAL_VH + 100;

const V = (vh) => vh / TOTAL_VH;                      // vh -> progress
const ramp = (p, a, b) => clamp((p - V(a)) / (V(b) - V(a)));

/* Progress p at the START of each chapter dot (see overlay.js's #dots):
   one entry per chat chapter (index 0..N-1), plus one more for the menu
   step at the end. Lets a dot click jump straight to that chapter. */
export const chapterStartP = [...starts.map(V), V(MENU_START)];

export const T_OPEN0 = V(INTRO);
export const T_OPEN1 = V(INTRO + OPEN);
export const T_END = V(END_VH);

export function phases(p) {
  const closing = p > V(MENU_START);

  /* which chapter, and how far into it (0..1) */
  let chapter = 0, chapterT = 0;
  if (p >= V(INTRO + OPEN) - 1e-6) {
    chapter = TOTAL;
    for (let i = 0; i < N; i++) {
      const a = V(starts[i]), b = V(starts[i] + chapterVh[i]);
      if (p < b) { chapter = i + 1; chapterT = clamp((p - a) / (b - a)); break; }
    }
  }

  return {
    p,
    open: ease(ramp(p, INTRO, INTRO + OPEN)),
    zoomIn: ease(ramp(p, INTRO + 45, INTRO + OPEN + 30)),
    closeT: ease(ramp(p, END_VH + 8, END_VH + 62)),
    zoomOut: ease(ramp(p, END_VH + 66, END_VH + 122)),
    // Discord/X balloons: rise once the device has finished closing (so
    // it never competes with the legal paper sliding in later), then stay
    // risen and clickable all the way to the end -- they never fade out.
    // Opacity ramps in over a much shorter window than the position does
    // (10vh vs 32vh), so they read as solid/opaque almost as soon as they
    // appear instead of looking translucent while still floating up.
    balloonRise: ease(ramp(p, END_VH + 58, END_VH + 90)),
    balloonOpacity: ease(ramp(p, END_VH + 58, END_VH + 68)),
    paperT: easeOut(ramp(p, END_VH + 112, END_VH + 170)),
    textOn: ramp(p, END_VH + 130, END_VH + 165),
    chapter, chapterT,
    closing,
    handIn: closing ? easeOut(ramp(p, END_VH + 6, END_VH + 36)) : easeOut(ramp(p, 8, INTRO + 5)),
    handOut: closing ? ease(ramp(p, END_VH + 56, END_VH + 84)) : ease(ramp(p, INTRO + OPEN - 42, INTRO + OPEN - 6)),
    typeIn: ease(ramp(p, INTRO + OPEN - 12, INTRO + OPEN + 28)) * (1 - ease(ramp(p, END_VH - 30, END_VH - 4))),
    busy: (p > 0.005 && p < V(INTRO + OPEN + 40)) || (p > T_END && p < V(END_VH + 175)),
    uiOpen: p < V(END_VH + 8),
    heroFade: ramp(p, 0, INTRO * 0.8),
    hintFade: ramp(p, 0, INTRO * 0.5),
  };
}

/* Virtual time (ms) reached inside chapter i for a given local progress. */
export const chapterTime = (i, t) => t * plans[i].total;
