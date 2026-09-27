/*
 * The room: procedurally-drawn stars, skyline and books (seeded so the room never changes),
 * the "cover" fit of the 1600x900 drawing, and the moon/clouds that follow the scroll.
 */
import { $, clamp, svgEl } from "./util.js";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function drawStars(group) {
  for (let i = 0; i < 90; i++) {
    const c = svgEl("circle", { cx: 460 + rnd() * 680, cy: 90 + rnd() * 250, r: (0.8 + rnd() * 1.8).toFixed(2), fill: "#fff" }, group);
    if (i % 5 === 0) {
      c.style.animationDelay = (-rnd() * 4).toFixed(2) + "s";
      c.style.animationDuration = (2.2 + rnd() * 3).toFixed(2) + "s";
    } else c.style.animation = "none";
  }
}

function drawSkyline(group, base, minH, maxH, fill, litChance) {
  let x = 440;
  while (x < 1160) {
    const w = 46 + rnd() * 62, h = minH + rnd() * (maxH - minH);
    svgEl("rect", { x, y: base - h, width: w, height: h + 20, fill }, group);
    for (let wy = base - h + 12; wy < base - 8; wy += 17) {
      for (let wx = x + 8; wx < x + w - 10; wx += 15) {
        if (rnd() < litChance) {
          const lit = svgEl("rect", { x: wx, y: wy, width: 6, height: 8, fill: rnd() < 0.8 ? "#ffd98a" : "#9fc0ff", opacity: (0.55 + rnd() * 0.45).toFixed(2) }, group);
          if (rnd() < 0.12) { lit.setAttribute("class", "lit"); lit.style.animationDelay = (-rnd() * 6).toFixed(1) + "s"; }
        }
      }
    }
    x += w + 4 + rnd() * 8;
  }
}

function drawBooks(group, x0, x1, shelves) {
  const palette = ["#5b6ed8", "#7c5bc8", "#3f9d8c", "#c0748e", "#4a5aa8", "#d3a35a", "#8a6bd6", "#2f7f8a"];
  for (const y of shelves) {
    let x = x0;
    while (x < x1 - 30) {
      const w = 14 + rnd() * 16, h = 46 + rnd() * 52;
      if (rnd() < 0.14) { x += 22; continue; }
      svgEl("rect", { x, y: y - h, width: w, height: h, rx: 2, fill: palette[Math.floor(rnd() * palette.length)], opacity: 0.85 }, group);
      x += w + 2;
    }
  }
}

/* Discord/X balloons: each rises from below the window sill to its own
   resting spot and stays there, clickable, all the way to the end (unless
   popped). Position is plain JS (own transform attribute on the .balloon
   <a>); the pop burst is a separate CSS animation on an inner group, see
   base.css. */
/* Window frame splits the glass into 4 panes (vertical divider x:792-808,
   horizontal divider y:322-336, see the "frame on top of glass" rects in
   index.html). Each balloon rests in a BOTTOM pane, centered horizontally
   (bottom-left x:452-792, bottom-right x:808-1148) but sat a bit above
   dead-center vertically (pane is y:336-578) so the string trails down
   into view below the body instead of ending right at the sill. */
const BALLOONS = [
  { id: "balloonDiscord", x: 622, restY: 420, swayPhase: 0 },
  { id: "balloonX", x: 978, restY: 420, swayPhase: 2.1 },
];
const BALLOON_START_Y = 700; // below the sill (glass clip ends at y=578), hidden until it rises

function setupBalloons() {
  const popped = new Set();
  const els = BALLOONS.map((b) => {
    const el = document.getElementById(b.id);
    el.addEventListener("click", () => {
      if (popped.has(b.id)) return;
      popped.add(b.id);
      el.classList.add("popped");
      // Inline style always beats a stylesheet rule, and update() below
      // stops touching this element from here on -- so without this, the
      // pointerEvents:"auto" left over from its last visible frame would
      // outrank .popped's own pointer-events:none in base.css forever.
      el.style.pointerEvents = "none";
    });
    return { ...b, el };
  });

  return {
    update(tl) {
      const { balloonRise: rise = 0, balloonOpacity: op = 0, p } = tl;
      for (const b of els) {
        if (popped.has(b.id)) continue; // stays exactly as the pop animation left it
        const y = BALLOON_START_Y - (BALLOON_START_Y - b.restY) * rise;
        const sway = Math.sin(p * 50 + b.swayPhase) * 5;
        b.el.setAttribute("transform", `translate(${(b.x + sway).toFixed(1)} ${y.toFixed(1)})`);
        b.el.style.opacity = op.toFixed(3);
        b.el.style.pointerEvents = op > 0.05 ? "auto" : "none";
      }
    },
  };
}

export function createScene() {
  drawStars($("#stars"));
  drawSkyline($("#cityFar"), 578, 70, 210, "#27337a", 0.16);
  drawSkyline($("#cityNear"), 590, 40, 150, "#161d4c", 0.3);
  drawBooks($("#booksL"), 96, 340, [508, 644]);
  drawBooks($("#booksR"), 1266, 1520, [352, 496, 650]);

  const moon = $("#moon"), clouds = $("#clouds");
  const balloons = setupBalloons();

  return {
    /* The drawing is fitted with "slice" (cover). `sc` and `oy` locate it inside the stage. */
    layout(W, H) {
      const sc = Math.max(W / 1600, H / 900);
      const oy = (H - 900 * sc) / 2;
      return { W, H, sc, oy, deskY: oy + 772 * sc, desk: oy + 826 * sc };
    },
    update(tl) {
      const p = tl.p;
      const mx = 560 + 470 * p, my = 330 - 150 * Math.sin(Math.PI * Math.pow(clamp(p), 0.9));
      moon.setAttribute("transform", `translate(${mx.toFixed(1)} ${my.toFixed(1)}) scale(${(1 + 0.12 * Math.sin(Math.PI * p)).toFixed(3)})`);
      clouds.setAttribute("transform", `translate(${(-p * 240).toFixed(1)} 0)`);
      balloons.update(tl);
    },
  };
}
