/* Tablet spec (see handheld.js). 4:3 screen: 600x800 in portrait, 800x600 in landscape. */
import { createHandheld } from "./handheld.js";

export const createTablet = () => createHandheld({
  id: "tablet",
  screen: { portrait: [600, 800], landscape: [800, 600] },
  bezel: 36,
  depth: 8,
  fs: { portrait: 16, landscape: 16 },
  fit: { portrait: [0.86, 0.86], landscape: [0.8, 0.84] },
  up: { portrait: 0.5, landscape: 0.47 },
  hands: { portrait: 0.3, landscape: 0.28 },
  front: '<i class="hh-lens"></i>',
  back: '<span class="hh-cam hh-cam-single"><b></b><b></b><b></b><b></b><i></i></span>' + '<span class="hh-name">Lyra</span>',
});
