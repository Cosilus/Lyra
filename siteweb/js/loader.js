/*
 * Opening loader, ported from lyrapp.to: a binary typewriter (0s and 1s that settle into letters) over a
 * grid of squares, then the grid clears in a pyramidal wave radiating from the centre.
 * Plays once on load. Skipped when the page is already scrolled, under reduced motion, or with ?p= / ?loader=0.
 * ?loader=1 forces it (testing).
 */
import { $, wait } from "./util.js";

const LINE1 = "Say what you want.", LINE2 = "Lyra handles the chain.";
const CHAR_DELAY = 42;                 // ms per letter
const REVEAL = { duration: 0.16, spread: 0.55 };

function binaryTypewriter(line, text, accent = [Infinity, Infinity]) {
  const chars = [...text];
  line.innerHTML = "";
  const spans = chars.map((ch) => {
    const s = document.createElement("span");
    s.className = "bt-char";
    s.textContent = ch === " " ? " " : Math.random() < 0.5 ? "0" : "1";
    line.appendChild(s);
    return s;
  });
  return new Promise((resolve) => {
    const scramble = setInterval(() => spans.forEach((s, i) => {
      if (!s.classList.contains("revealed") && chars[i] !== " ") s.textContent = Math.random() < 0.5 ? "0" : "1";
    }), 65);
    let i = 0;
    (function next() {
      if (i >= chars.length) { clearInterval(scramble); resolve(); return; }
      const s = spans[i];
      s.textContent = chars[i];
      s.classList.add("revealed");
      if (i >= accent[0] && i < accent[1]) s.classList.add("accent", "brand");
      i++;
      setTimeout(next, CHAR_DELAY);
    })();
  });
}

/* A grid of squares tiling the screen; each knows its Manhattan distance from the centre cell. */
function buildSquares(container) {
  container.innerHTML = "";
  const cols = innerWidth < 640 ? 8 : 14, cell = innerWidth / cols, rows = Math.ceil(innerHeight / cell);
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  container.style.gridTemplateRows = `repeat(${rows}, ${cell}px)`;
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2, squares = [];
  let max = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const sq = document.createElement("div");
    sq.className = "loader-square";
    sq._d = Math.abs(c - cx) + Math.abs(r - cy);
    max = Math.max(max, sq._d);
    container.appendChild(sq); squares.push(sq);
  }
  return { squares, max };
}

export async function playLoader() {
  const root = $("#loader");
  const params = new URLSearchParams(location.search);
  const forced = params.get("loader") === "1";
  const skip = !forced && (params.has("p") || params.get("loader") === "0" || scrollY > 5 || matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (!root || skip) { if (root) root.hidden = true; return; }

  const grid = $("#loaderSquares"), text = $("#loaderText");
  document.documentElement.style.overflow = "hidden";
  const { squares, max } = buildSquares(grid);

  squares.forEach((s) => { s.style.transitionDuration = "0.1s"; s.style.transitionDelay = (s._d / max) * 0.3 + "s"; s.style.opacity = "0"; });
  void grid.offsetWidth;
  squares.forEach((s) => { s.style.opacity = "1"; });

  await binaryTypewriter($("#loaderLine1"), LINE1);
  await wait(150);
  await binaryTypewriter($("#loaderLine2"), LINE2, [0, 4]);
  await wait(500);
  text.classList.add("out");
  await wait(300);

  grid.style.background = "transparent";                       // or it would mask the squares fading out
  squares.forEach((s) => { s.style.transitionDuration = REVEAL.duration + "s"; s.style.transitionDelay = (s._d / max) * REVEAL.spread + "s"; s.style.opacity = "0"; });
  await wait((REVEAL.duration + REVEAL.spread) * 1000 + 100);

  root.hidden = true;
  document.documentElement.style.overflow = "";
}
