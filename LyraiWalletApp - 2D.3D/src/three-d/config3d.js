// Tunable knobs for the optional 3D interface (see Box3D.jsx).
// Ported from the standalone lyra-wallet-3d prototype.

export const PARALLAX = {
  maxTiltDeg: 10,
  maxShiftPx: 0,
  spring: { stiffness: 120, damping: 18, mass: 0.6 },
  idleDriftDeg: 2.5,
  idleDriftPeriodMs: 9000,
};

export const DOCK = {
  // |nx| at which the tilt "catches" and a side menu opens.
  thresholdNx: 0.58,
  // ny (-1 = top of viewport) at which the assets menu opens. Kept
  // tight: the balance card's own refresh button sits around -0.79 at
  // a typical window height, so anything looser mis-triggers on it.
  thresholdNy: 0.88,
  itemStaggerMs: 130,
  itemStepPx: 52,
};

export const TOP_DOCK = { tiltDeg: 14, scale: 0.9, shiftYPx: 46 };

// Same footprint as the 2D .frame (420 wide, up to 820 tall / 94vh).
export const BOX = {
  depthPx: 600,
  widthPx: 420,
  maxHeightPx: 820,
  minHeightPx: 560,
  viewportFraction: 0.94,
  radiusPx: 34,
};

export const REDUCED_MOTION_SCALE = 0.15;
