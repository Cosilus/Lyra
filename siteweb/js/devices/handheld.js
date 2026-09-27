/*
 * Handheld device factory: phone and tablet share this code and differ only by their spec.
 * The device lies on the desk, a hand raises it to face the viewer, two hands type on it.
 * The app screen keeps its natural size (spec.screen), the rig scales it to the viewport.
 *
 * spec = {
 *   id:      "phone" | "tablet"
 *   screen:  { portrait: [w, h], landscape: [w, h] }   natural screen size in px
 *   bezel:   total bezel width (both sides) in px
 *   fs:      { portrait, landscape }                     app font size in px
 *   fit:     { portrait: [wFrac, hFrac], landscape: [wFrac, hFrac] }   max size vs viewport when raised
 *   up:      { portrait, landscape }                     vertical centre (fraction of H) when raised
 *   hands:   { portrait, landscape }                     horizontal spread of the typing hands (0..0.5)
 *   depth:   half thickness of the body in px (the side walls are extruded slices)
 *   back:    HTML for the back face (camera)
 *   front:   HTML added inside the front face (camera island, ...)
 * }
 */
import { $, clamp, ease, el, lerp } from "../util.js";

const HAND = '<svg class="hand hand-l" viewBox="0 0 200 1200" width="250" height="1500" aria-hidden="true"><use href="#handShape"/></svg>' +
             '<svg class="hand hand-r" viewBox="0 0 200 1200" width="250" height="1500" aria-hidden="true"><use href="#handShape"/></svg>';

/* The side walls: a stack of rounded rectangles between the front and the back glass, tinted like brushed
   metal (lighter in the middle, darker at the glass). Hardware buttons are thin stacks on the edges. */
function sideWalls(depth) {
  const n = 13;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1), z = -depth + 2 * depth * t;
    const light = 24 + 16 * Math.sin(t * Math.PI);
    return `<i class="hh-slice" style="transform:translateZ(${z.toFixed(2)}px);background:hsl(232 38% ${light.toFixed(1)}%)"></i>`;
  }).join("");
}
function buttons(depth) {
  const layers = (cls) => [-1, -0.5, 0, 0.5, 1].map((k) => `<i class="hh-btn ${cls}" style="transform:translateZ(${(k * depth * 0.32).toFixed(2)}px)"></i>`).join("");
  return layers("hh-power") + layers("hh-vol");
}

function buildRig(spec) {
  const rig = el("div", "rig rig-handheld",
    `<div class="hh3d"><div class="hh-body">
       ${sideWalls(spec.depth)}${buttons(spec.depth)}
       <div class="hh-face hh-front">${spec.front || ""}<i class="hh-sheen"></i></div>
       <div class="hh-face hh-back">${spec.back || ""}</div>
     </div></div>
     <div class="hand-open"><svg viewBox="0 0 200 1400" width="250" height="1750" aria-hidden="true"><use href="#handShape"/></svg></div>
     <div class="hands hh-hands">${HAND}</div>`);
  rig.dataset.kind = spec.id;
  rig.style.setProperty("--d", spec.depth + "px");
  rig.hidden = true;
  $("#world").insertBefore(rig, $("#rigLaptop"));
  return rig;
}

export function createHandheld(spec) {
  const rig = buildRig(spec);
  const body = $(".hh-body", rig), front = $(".hh-front", rig);
  const handOpen = $(".hand-open", rig), hands = $(".hh-hands", rig);
  const handL = $(".hand-l", hands), handR = $(".hand-r", hands);
  let orient = "portrait", pw = 0, ph = 0, kUp = 1, kDown = 0.6, cx = 0, yDown = 0, yUp = 0, tipX = 0, tipY = 0;

  function setOrientation(next) {
    orient = next;
    const [sw, sh] = spec.screen[orient];
    pw = sw + spec.bezel; ph = sh + spec.bezel;
    rig.style.setProperty("--pw", pw + "px");
    rig.style.setProperty("--ph", ph + "px");
    rig.dataset.orient = orient;
    const gap = spec.hands[orient];
    handL.style.left = (pw * gap - 125) + "px";
    handR.style.left = (pw * (1 - gap) - 125) + "px";
    hands.style.setProperty("--tip-y", (ph - 70) + "px");
  }
  setOrientation("portrait");

  return {
    id: spec.id,
    rig,
    zoom: 0,
    setOrientation,

    mount(screen) {
      front.appendChild(screen);
      screen.style.setProperty("--fs", spec.fs[orient] + "px");
    },

    layout(view) {
      const { W, H, desk } = view;
      const [fw, fh] = spec.fit[orient];
      kUp = Math.min((fw * W) / pw, (fh * H) / ph);
      kDown = kUp * 0.62;
      cx = W / 2;
      yDown = desk - 0.17 * H;             // lies on the desk
      yUp = H * spec.up[orient];           // held up in front of the viewer
      return { x: cx, y: (yDown + yUp) / 2 };
    },

    pose(tl) {
      /* 1. the hand arrives and takes hold (device still lying)   2. it carries the device up to the viewer */
      const lift = ease(clamp((tl.open - 0.2) / 0.8));
      const up = lift * (1 - tl.closeT);       // 0 lying on the desk, 1 raised
      const angle = -88 + 88 * up;
      const sway = 5 * Math.sin(up * Math.PI);  // it is carried, not slid: a little turn on the way
      body.style.transform = `rotateX(${angle}deg) rotateZ(${sway.toFixed(2)}deg)`;
      front.style.setProperty("--sheen", "50%");
      const k = lerp(kDown, kUp, up), y = lerp(yDown, yUp, up);
      rig.style.transform = `translate(${(cx - (pw / 2) * k).toFixed(1)}px, ${(y - (ph / 2) * k).toFixed(1)}px) scale(${k.toFixed(4)})`;

      /* the hand holds the lower edge of the device as it is projected on screen, and follows it */
      const vis = tl.handIn * (1 - tl.handOut);
      handOpen.style.opacity = vis > 0.01 ? 1 : 0;
      if (tl.open < 1 || tl.closeT > 0 || vis > 0.005) {
        const r = rig.getBoundingClientRect(), s2 = r.width / pw || 1, bb = body.getBoundingClientRect();
        tipX = (bb.left + bb.width * 0.64 - r.left) / s2;
        tipY = (bb.bottom - Math.min(bb.height * 0.3, 60 * s2) - r.top) / s2;
      }
      handOpen.style.transform = `translate(${(tipX - 125 + (1 - tl.handIn) * 380 + tl.handOut * 240).toFixed(1)}px, ${(tipY - 30 + (1 - tl.handIn) * 520 + tl.handOut * 560).toFixed(1)}px) rotate(${(-16 + 10 * up).toFixed(1)}deg)`;

      hands.style.opacity = tl.typeIn > 0.01 ? 1 : 0;
      hands.style.transform = `translateY(${((1 - tl.typeIn) * 820).toFixed(1)}px)`;

      return { screenOn: clamp((angle + 40) / 30) };
    },

    keyPress() {
      const send = $(".send");
      send.classList.add("tap");
      setTimeout(() => send.classList.remove("tap"), 70);
    },
    setTyping(on) { hands.classList.toggle("typing", on); },
    show(on) { rig.hidden = !on; },
  };
}
