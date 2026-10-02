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
     portrait viewport  -> phone if narrow (< 600px), laptop (PC version) otherwise
     touch, landscape   -> phone if short (<= 520px), laptop (PC version) otherwise
     anything else      -> laptop
   Tablets used to get their own tablet-portrait/tablet-landscape rig here;
   now routed to "laptop" instead so tablet shows the same PC build as
   desktop. tablet.js and the tablet-* CSS/MODES entries are left in place
   (still reachable via ?device=tablet-portrait for testing) in case this
   needs reverting, just no longer picked automatically. */
export function modeFor(W, H, coarse = matchMedia("(pointer: coarse)").matches) {
  const forced = new URLSearchParams(location.search).get("device");   // ?device=tablet-landscape (testing)
  if (MODES.includes(forced)) return forced;
  if (W / H < 0.85) return W < 600 ? "phone-portrait" : "laptop";
  if (coarse && H <= 520) return "phone-landscape";
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
    /* Once the device has started closing nothing on it is clickable any
       more, but its rig is a big box that still sits on top of the window
       (the Discord/X balloons rise there), so it would swallow every
       click meant for them. Let clicks fall through from that point on. */
    pose(tl) {
      active.rig.style.pointerEvents = tl.uiOpen ? "" : "none";
      return active.pose(tl);
    },
    keyPress: () => active.keyPress(),
    setTyping(on) { for (const d of Object.values(devices)) d.setTyping(on); },
  };
}
