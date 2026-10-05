import { useEffect, useRef, useState } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { DOCK, PARALLAX, REDUCED_MOTION_SCALE, TOP_DOCK } from "./config3d.js";

// Mouse position (or device tilt) -> box pose. The box stays flat while
// the pointer moves over it; only reaching an edge "docks" it: the tilt
// catches at its max and dockedSide ("left" | "right" | "top") is
// reported so the caller can open a menu.
// `paused` freezes everything flat (used while a real modal is open).
export function useParallax3d(paused = false, isTopMenuHovered, forcedDock = null, tiltEnabled = false) {
  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);
  const rawShiftX = useMotionValue(0);
  const rawShiftY = useMotionValue(0);
  const rawScale = useMotionValue(1);

  const rotateX = useSpring(rawRotateX, PARALLAX.spring);
  const rotateY = useSpring(rawRotateY, PARALLAX.spring);
  const shiftX = useSpring(rawShiftX, PARALLAX.spring);
  const shiftY = useSpring(rawShiftY, PARALLAX.spring);
  const scale = useSpring(rawScale, PARALLAX.spring);

  const reducedRef = useRef(false);
  const dockedRef = useRef(null);
  const [dockedSide, setDockedSide] = useState(null);

  useEffect(() => {
    if (paused) {
      rawRotateY.set(0);
      rawShiftX.set(0);
      rawRotateX.set(0);
      rawShiftY.set(0);
      rawScale.set(1);
      dockedRef.current = null;
      setDockedSide(null);
      return;
    }

    // Guided tour: pin the box in a given dock pose, ignore the mouse.
    if (forcedDock) {
      const f = REDUCED_MOTION_SCALE && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? REDUCED_MOTION_SCALE : 1;
      rawScale.set(1);
      rawRotateX.set(0);
      rawShiftY.set(0);
      if (forcedDock === "top") {
        rawRotateY.set(0);
        rawRotateX.set(TOP_DOCK.tiltDeg * f);
        rawShiftY.set(TOP_DOCK.shiftYPx * f);
        rawScale.set(1 - (1 - TOP_DOCK.scale) * f);
      } else {
        rawRotateY.set((forcedDock === "right" ? -1 : 1) * PARALLAX.maxTiltDeg * f);
      }
      dockedRef.current = forcedDock;
      setDockedSide(forcedDock);
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = media.matches;
    const onChange = () => { reducedRef.current = media.matches; };
    media.addEventListener("change", onChange);
    const scaleFactor = () => (reducedRef.current ? REDUCED_MOTION_SCALE : 1);

    const resetFlat = () => {
      rawRotateY.set(0);
      rawShiftX.set(0);
      rawRotateX.set(0);
      rawShiftY.set(0);
      rawScale.set(1);
    };

    const releaseDock = () => {
      dockedRef.current = null;
      setDockedSide(null);
    };

    // Coming back from a pinned (tour) pose or a re-setup: start flat.
    releaseDock();
    resetFlat();

    const handlePosition = (nx, ny) => {
      const docked = dockedRef.current;
      if (docked === "left" || docked === "right") {
        if (Math.abs(nx) >= DOCK.thresholdNx) return;
        releaseDock();
      } else if (docked === "top") {
        if (ny <= -DOCK.thresholdNy || isTopMenuHovered?.()) return;
        releaseDock();
      }

      // No edge reached: the box stays still, no follow-the-pointer tilt.
      resetFlat();

      const s = scaleFactor();
      if (Math.abs(nx) >= DOCK.thresholdNx) {
        const side = nx > 0 ? "right" : "left";
        dockedRef.current = side;
        setDockedSide(side);
        rawRotateY.set((side === "right" ? -1 : 1) * PARALLAX.maxTiltDeg * s);
        rawShiftX.set((side === "right" ? -1 : 1) * PARALLAX.maxShiftPx * s);
      } else if (ny <= -DOCK.thresholdNy) {
        dockedRef.current = "top";
        setDockedSide("top");
        rawRotateX.set(TOP_DOCK.tiltDeg * s);
        rawShiftY.set(TOP_DOCK.shiftYPx * s);
        rawScale.set(1 - (1 - TOP_DOCK.scale) * s);
      }
    };

    const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
    let cleanupPointer;
    let cleanupOrientation;

    if (hasFinePointer) {
      const onMove = (e) => {
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = (e.clientY / window.innerHeight) * 2 - 1;
        handlePosition(nx, ny);
      };
      const onLeave = () => {
        releaseDock();
        resetFlat();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerleave", onLeave);
      window.addEventListener("blur", onLeave);
      cleanupPointer = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("blur", onLeave);
      };
    } else {
      // Touch devices: tilt is opt-in (see TiltActivation). The neutral
      // pose is however the user holds the phone at that moment, not
      // beta/gamma = 0, then gamma/beta deltas map to nx/ny.
      let neutral = null;
      const clampUnit = (v) => Math.max(-1, Math.min(1, v));
      const DEAD = 0.08;
      const onOrientation = (e) => {
        if (e.beta == null || e.gamma == null) return;
        if (!neutral) neutral = { beta: e.beta, gamma: e.gamma };
        let nx = -clampUnit((e.gamma - neutral.gamma) / 28);
        let ny = clampUnit((e.beta - neutral.beta) / 24);
        if (Math.abs(nx) < DEAD) nx = 0;
        if (Math.abs(ny) < DEAD) ny = 0;
        handlePosition(nx, ny);
      };
      // No battery spent while the page is in the background.
      const onVisibility = () => {
        if (document.visibilityState === "visible") {
          neutral = null;
          window.addEventListener("deviceorientation", onOrientation, { passive: true });
        } else {
          window.removeEventListener("deviceorientation", onOrientation);
        }
      };
      if (tiltEnabled) {
        window.addEventListener("deviceorientation", onOrientation, { passive: true });
        document.addEventListener("visibilitychange", onVisibility);
      }
      cleanupOrientation = () => {
        window.removeEventListener("deviceorientation", onOrientation);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }

    return () => {
      media.removeEventListener("change", onChange);
      cleanupPointer?.();
      cleanupOrientation?.();
    };
  }, [paused, forcedDock, tiltEnabled, rawRotateX, rawRotateY, rawShiftX, rawShiftY, rawScale, isTopMenuHovered]);

  return { rotateX, rotateY, shiftX, shiftY, scale, dockedSide };
}
