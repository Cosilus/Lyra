/*
 * Device manager. The story is told on ONE app screen (#screen). This module decides which device
 * carries it (laptop, phone, tablet; portrait or landscape), moves the screen there and forwards calls.
 *
 * Device interface (laptop.js and handheld.js):
 *   id, rig, zoom
 *   mount(screen)          put the screen inside this device and set its font size
 *   layout(view)           size/position the rig for the viewport; returns the camera zoom origin {x, y}
 *   pose(tl)               per-frame pose from the timeline; returns { screenOn } (0..1)
 *   keyPress()             visual feedback for one typed character
 *   setTyping(on)          hands start/stop typing
 *   show(on)               show/hide the rig
 * Handheld devices also have setOrientation("portrait" | "landscape").
 */
import { $ } from "../util.js";
import { createLaptop } from "./laptop.js";
import { createPhone } from "./phone.js";
import { createTablet } from "./tablet.js";

const MODES = ["laptop", "phone-portrait", "phone-landscape", "tablet-portrait", "tablet-landscape"];

/* Which device fits this viewport?
     portrait viewport  -> phone if narrow (< 600px), tablet otherwise
     touch, landscape   -> phone if short (<= 520px), tablet if up to 900px tall
     anything else      -> laptop */
export function modeFor(W, H, coarse = matchMedia("(pointer: coarse)").matches) {
  const forced = new URLSearchParams(location.search).get("device");   // ?device=tablet-landscape (testing)
  if (MODES.includes(forced)) return forced;
  if (W / H < 0.85) return W < 600 ? "phone-portrait" : "tablet-portrait";
  if (coarse && H <= 520) return "phone-landscape";
  if (coarse && H <= 900 && W <= 1400) return "tablet-landscape";
  return "laptop";
}

export function createDevices() {
  const screen = $("#screen"), stage = $("#stage");
  const devices = { laptop: createLaptop(), phone: createPhone(), tablet: createTablet() };
  let mode = null, active = null;

  function select(next) {
    mode = next;
    stage.dataset.device = next;
    const [kind, orientation] = next.split("-");
    const wanted = devices[kind];
    if (orientation) wanted.setOrientation(orientation);
    if (wanted !== active) {
      for (const d of Object.values(devices)) d.show(d === wanted);
      active = wanted;
    }
    active.mount(screen);
  }

  return {
    get active() { return active; },
    get mode() { return mode; },

    /* Called on load and on every resize/orientation change. */
    layout(view) {
      const next = modeFor(view.W, view.H);
      if (next !== mode) select(next);
      return active.layout(view);
    },
    pose: (tl) => active.pose(tl),
    keyPress: () => active.keyPress(),
    setTyping(on) { for (const d of Object.values(devices)) d.setTyping(on); },
  };
}
