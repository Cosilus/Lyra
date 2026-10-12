// True on phones/tablets (touch only, no mouse): the 3D menus open with a
// swipe there instead of the mouse reaching an edge (see useParallax3d).
export function isTouchOnly() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
}
