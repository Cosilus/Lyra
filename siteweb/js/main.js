/*
 * Bootstrap. Wires the modules together and runs the scroll loop:
 *   scroll -> progress p -> timeline phases -> scene / device / overlay / chat
 */
import { $, clamp } from "./util.js";
import { phases, TRACK_VH } from "./timeline.js";
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
const overlay = createOverlay();
createTooltip();

let view = null, target = 0, shown = -1, lastP = -1, moving = false;
track.style.height = TRACK_VH + "vh";
const debugP = new URLSearchParams(location.search).get("p");

function layout() {
  view = scene.layout(stage.clientWidth, stage.clientHeight);
  const { x, y } = devices.layout(view);
  world.style.transformOrigin = `${x}px ${y}px`;
  overlay.layout(view);
  lastP = -1;
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
  return clamp(-track.getBoundingClientRect().top / (track.offsetHeight - stage.clientHeight));
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
addEventListener("resize", layout);
addEventListener("orientationchange", layout);
window.__frame = frame;
requestAnimationFrame(frame);
