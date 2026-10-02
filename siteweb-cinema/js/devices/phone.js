/* Phone spec (see handheld.js). Screen 390x844 in portrait, 844x390 in landscape. */
import { createHandheld } from "./handheld.js";

export const createPhone = () => createHandheld({
  id: "phone",
  screen: { portrait: [390, 844], landscape: [844, 390] },
  bezel: 28,
  depth: 11,
  fs: { portrait: 15, landscape: 13.5 },
  fit: { portrait: [0.86, 0.9], landscape: [0.94, 0.84] },
  up: { portrait: 0.5, landscape: 0.47 },
  hands: { portrait: 0.27, landscape: 0.2 },
  front: '<i class="hh-island"></i>',
  back: '<span class="hh-cam"><b></b><b></b><b></b><b></b><i></i><i></i></span>' + '<span class="hh-name">Lyra</span>',
});
