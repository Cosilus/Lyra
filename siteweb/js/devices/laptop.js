/*
 * Laptop device. A 3D lid hinged on a keyboard base, opened by a hand, typed on by two hands.
 * Implements the Device interface used by devices/index.js (see the bottom of that file).
 */
import { $, clamp } from "../util.js";

const NATURAL_W = 1000, NATURAL_H = 640;

function buildKeyboard(root) {
  const keys = [];
  const row = (count, extra) => {
    const r = document.createElement("div");
    r.className = "krow";
    const add = (cls = "") => { const k = document.createElement("div"); k.className = "key " + cls; r.appendChild(k); keys.push(k); };
    if (count === "space") ["", "", "", "w6", "", ""].forEach(add);
    else { for (let i = 0; i < count; i++) add(); if (extra) add(extra); }
    root.appendChild(r);
  };
  row(14); row(14); row(13, "w2"); row(12, "w2"); row("space");
  return keys;
}

export function createLaptop() {
  const rig = $("#rigLaptop"), lid = $("#lid"), tip = $("#lidTip"), front = $(".lid-front");
  const handOpen = $("#handOpen"), hands = $("#hands");
  const keys = buildKeyboard($("#keys"));
  let k = 1, tipX = 0, tipY = 0;

  return {
    id: "laptop",
    rig,
    zoom: 0.16,            // camera push-in while chatting

    mount(screen) { front.appendChild(screen); screen.style.setProperty("--fs", "17px"); },

    /* Pin the laptop on the desk line. Returns the point the camera zooms around. */
    layout(view) {
      const { W, H, sc, desk } = view;
      const width = Math.min(880 * sc, W * 0.66);
      k = Math.min(width / NATURAL_W, (desk - 0.27 * H) / 760);
      const x = W / 2;
      rig.style.transform = `translate(${x - (NATURAL_W / 2) * k}px, ${desk - NATURAL_H * k}px) scale(${k})`;
      return { x, y: desk - 300 * k };
    },

    /* Per-frame pose. Returns how lit the screen is (0..1) and whether the app is ready. */
    pose(tl) {
      /* -90 + 100 * tl.open * (1 - tl.closeT) never actually reaches 0deg
         at rest (tl.open=1, tl.closeT=0 gives 10deg, a deliberate cinematic
         tilt) -- meaning the screen's real interactive content, being a
         child of this rotated lid, is hit-tested by the browser against a
         perspective-projected quad rather than a plain rectangle for its
         entire resting/interactive lifetime, not just during the opening
         animation. That 3D-vs-flat mismatch reproduced as real, unfixable
         clicks landing on the outer .laptop shell instead of any menu
         button on a real user's screen (confirmed via their own devtools:
         e.target was DIV.laptop, worse toward the bottom of the screen,
         further from the hinge -- not reproducible in our own test
         browser, so viewport/DPR-dependent). Snapping to exactly flat
         once fully open and not transitioning removes 3D projection from
         hit-testing entirely for the whole time the screen is actually
         interactive; the tilt still plays during the open/close animation
         itself, where nothing is clickable yet anyway. */
      /* Flat at rest, but never by SNAPPING: the old switch (10deg while moving, 0deg the
         instant the lid is open and still) made the whole laptop jump 10deg when the lid
         finished opening and again the moment it started closing -- a visible pop at the end
         of the menu step, with the hands and the sides of the laptop flashing as it
         happened. Now a "flatten" term takes the 10deg off smoothly while the lid is
         opening (open 0.8 -> 1) and puts it back only after the closing has reached 10deg
         of travel (closeT 0 -> 0.1), so the angle is continuous and is exactly 0 for the
         whole resting/interactive time (same hit-testing guarantee as before). */
      const rampTo = (v, a, b) => clamp((v - a) / (b - a));
      const flatten = 10 * rampTo(tl.open, 0.8, 1) * (1 - rampTo(tl.closeT, 0, 0.1));
      const atRest = tl.open >= 1 && tl.closeT <= 0;
      const angle = atRest ? 0 : -90 + 100 * tl.open * (1 - tl.closeT) - flatten;
      lid.style.transform = `rotateX(${angle}deg)`;

      /* the hand that opens the lid follows the lid's free edge */
      if (tl.open < 1 || tl.closeT > 0 || tl.handIn * (1 - tl.handOut) > 0.005) {
        const r = rig.getBoundingClientRect(), s = r.width / NATURAL_W || 1, t = tip.getBoundingClientRect();
        tipX = (t.left + t.width / 2 - r.left) / s; tipY = (t.top + t.height / 2 - r.top) / s;
      }
      /* Hands live inside this same rig, so their travel distance below
         (420/260/460/520/700px) shrinks with the rig's own transform:
         scale(k) just like the laptop itself -- on a smaller screen (a
         tablet's smaller k) the hands end up moving noticeably less in
         absolute terms, even though the motion is proportionally
         identical to the laptop's own size. `motion` gives that travel
         distance a small boost on smaller screens (capped at +35%) so it
         still reads as movement without fully decoupling it from the
         laptop's size the way a flat, screen-size-independent distance
         would. */
      const motion = k < 1 ? Math.min(1.35, k ** -0.3) : 1;
      const vis = tl.handIn * (1 - tl.handOut);
      handOpen.style.opacity = vis > 0.01 ? 1 : 0;
      handOpen.style.transform = `translate(${(tipX - 125 + (1 - tl.handIn) * 420 * motion + tl.handOut * 260 * motion).toFixed(1)}px, ${(tipY - 30 + (1 - tl.handIn) * 460 * motion + tl.handOut * 520 * motion).toFixed(1)}px) rotate(${(-14 + 10 * (tl.closing ? 1 - tl.closeT : tl.open)).toFixed(1)}deg)`;

      hands.style.opacity = tl.typeIn > 0.01 ? 1 : 0;
      hands.style.transform = `translateY(${(350 + (1 - tl.typeIn) * 700 * motion).toFixed(1)}px)`;

      return { screenOn: clamp((angle + 40) / 30) };
    },

    keyPress() {
      const key = keys[Math.floor(Math.random() * keys.length)];
      key.classList.add("on");
      setTimeout(() => key.classList.remove("on"), 90);
    },
    setTyping(on) { hands.classList.toggle("typing", on); },
    show(on) { rig.hidden = !on; },
  };
}
