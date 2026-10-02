/*
 * Bootstrap. Wires the modules together and runs the scroll loop:
 *   scroll -> progress p -> timeline phases -> scene / device / overlay / chat
 */
import { $, clamp } from "./util.js";
import { phases, TRACK_VH, chapterStartP } from "./timeline.js";
import { createScene } from "./scene.js";
import { createDevices } from "./devices/index.js";
import { createPages } from "./pages.js";
import { createChat } from "./chat.js";
import { createOverlay } from "./overlay.js";
import { createTooltip } from "./tooltip.js";
import { playLoader } from "./loader.js";

const track = $("#track"), stage = $("#stage"), world = $("#world"), screen = $("#screen"), glow = $("#glow");

const scene = createScene();
const devices = createDevices();
const pages = createPages();
const chat = createChat({ devices, pages });

let view = null, target = 0, shown = -1, lastP = -1, moving = false, stageH = 0;
track.style.height = TRACK_VH + "vh";

// Same inverse math as readScroll() below (scrollY -> p), run backwards
// (p -> scrollY), so a chapter dot click lands exactly where that
// chapter's own progress range says it should, not an approximation.
function scrollToChapter(i) {
  const raw = chapterStartP[i];
  if (raw == null) return;
  // Landing EXACTLY on a chapter's opening boundary is ambiguous:
  // phases() decides the chapter with a strict "<", so float rounding
  // in this reverse (p -> scrollY) math vs. the forward (scrollY -> p)
  // math readScroll() does could round either side of that shared seam
  // -- confirmed live, it landed back in the PREVIOUS chapter instead.
  // A tiny nudge past the boundary keeps it solidly inside the target
  // chapter regardless of which way the rounding goes.
  const p = clamp(raw + 1e-4);
  const trackTop = track.getBoundingClientRect().top + window.scrollY;
  const targetY = trackTop + p * (track.offsetHeight - stageH);
  window.scrollTo({ top: targetY, behavior: "smooth" });
}

const overlay = createOverlay({ onDotClick: scrollToChapter });
createTooltip();
const debugP = new URLSearchParams(location.search).get("p");

function layout() {
  stageH = stage.clientHeight;
  view = scene.layout(stage.clientWidth, stageH);
  const { x, y } = devices.layout(view);
  world.style.transformOrigin = `${x}px ${y}px`;
  overlay.layout(view);
  lastP = -1;
}

// Android/iOS collapse and re-expand the browser's own address/tab bar
// WHILE the page scrolls, firing a burst of "resize" events as it
// animates -- each one changing window/stage height by itself, with no
// real layout change on our end. Un-debounced, that both re-runs the
// (somewhat expensive) layout() many times a second during every scroll
// AND, worse, feeds a constantly-shifting stageH into readScroll()'s own
// math below, making the computed scroll progress itself jitter -- the
// actual cause of stutter/skipped content on phones that never shows up
// on desktop, where there's no such dynamic toolbar. Debouncing this
// (re-layout only once things settle) fixes both at once. A screen
// rotation is the one case genuinely worth reacting to instantly, so it
// bypasses the debounce.
let layoutTimer = null;
function layoutDebounced() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(layout, 200);
}

function render(p) {
  const tl = phases(p);
  stage.classList.toggle("busy", tl.busy);

  const { screenOn } = devices.pose(tl);
  screen.style.opacity = screenOn;
  glow.style.opacity = (screenOn * 0.9).toFixed(3);
  screen.classList.toggle("ready", tl.open > 0.92 && tl.closeT < 0.35);

  /* camera: push in while chatting, back out at the end */
  const zoom = 1 + devices.active.zoom * tl.zoomIn;
  world.style.transform = `scale(${(zoom * (1 - tl.zoomOut) + tl.zoomOut).toFixed(4)})`;

  scene.update(tl);
  overlay.update(tl);
  chat.update(tl.chapter, tl.chapterT, moving);
}

function readScroll() {
  if (window.__p !== undefined) return clamp(window.__p);          // test hook
  if (debugP !== null) return clamp(parseFloat(debugP));           // ?p=0.4 freezes the scene
  return clamp(-track.getBoundingClientRect().top / (track.offsetHeight - stageH));
}

function frame() {
  target = readScroll();
  const d = target - shown;
  shown = shown < 0 ? target : shown + d * 0.14;
  if (Math.abs(d) < 0.0002) shown = target;
  const nowMoving = Math.abs(d) > 1e-4;
  if (Math.abs(shown - lastP) > 1e-5 || nowMoving !== moving) {
    moving = nowMoving; lastP = shown; render(shown);     // hands only type while the scroll moves
  }
  requestAnimationFrame(frame);
}

layout();
playLoader();
addEventListener("resize", layoutDebounced);
addEventListener("orientationchange", layout);
window.__frame = frame;
requestAnimationFrame(frame);
