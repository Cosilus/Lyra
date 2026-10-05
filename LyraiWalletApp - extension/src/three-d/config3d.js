// Tunable knobs for the optional 3D interface (see Box3D.jsx).
// Ported from the standalone lyra-wallet-3d prototype.

export const PARALLAX = {
  maxTiltDeg: 10,
  maxShiftPx: 0,
  spring: { stiffness: 120, damping: 18, mass: 0.6 },
};

export const DOCK = {
  // |nx| at which the tilt "catches" and a side menu opens.
  thresholdNx: 0.58,
  // Once docked, the box only lets go below this |nx| (hysteresis). Without it, a pointer resting
  // right on the 0.58 line flips docked/undocked on every pixel: on a narrow side panel the side
  // menu itself starts around 0.59, so hovering its inner edge made the box and menu flicker.
  releaseNx: 0.4,
  // ny (-1 = top of viewport) at which the assets menu opens. Kept
  // tight: the balance card's own refresh button sits around -0.79 at
  // a typical window height, so anything looser mis-triggers on it.
  thresholdNy: 0.88,
  itemStaggerMs: 130,
  itemStepPx: 52,
};

// Floating card on a website (extension, see cardBridge.js): the wallet never moves, the menus
// open outside it. edgePx: how close to a wallet edge the mouse must get to open that menu;
// holdPx: the menu stays open while the mouse is within this distance of the edge (or past it,
// on the menu itself).
// scale: while a menu is open the wallet shrinks a little (the menus keep their size and move in
// to keep the same gap). The shrink itself is a CSS transition (card rules in styles.css), the
// same one the card's shadow uses in public/overlay.js, so both move as one: keep the value and
// the timing in sync with MENU_SCALE / MENU_EASE there.
export const CARD_DOCK = { edgePx: 18, holdPx: 70, scale: 0.94 };

export const TOP_DOCK = { tiltDeg: 14, scale: 0.9, shiftYPx: 46 };

// Side docking (left / right menu): like the top dock, the wallet steps aside and shrinks so it
// stays almost fully visible next to the menu instead of being covered by it.
//  - scale: the usual shrink; smaller if the window is narrow, down to minScale
//  - menuSpacePx: room kept free on the menu's side (menu 62px wide + 12px gap to the edge + room to breathe)
export const SIDE_DOCK = { scale: 0.9, minScale: 0.72, menuSpacePx: 84 };

// Same footprint as the 2D .frame (420 wide, up to 820 tall / 94vh).
export const BOX = {
  depthPx: 600,
  widthPx: 420,
  maxHeightPx: 820,
  minHeightPx: 560,
  viewportFraction: 0.94,
  radiusPx: 34,
  // At or below this window width (a browser side panel, a phone) the box fills the whole
  // window with straight edges instead of floating as a rounded card. Keep in sync with the
  // matching @media (max-width) in three-d.css.
  fillBelowPx: 560,
};

export const REDUCED_MOTION_SCALE = 0.15;
