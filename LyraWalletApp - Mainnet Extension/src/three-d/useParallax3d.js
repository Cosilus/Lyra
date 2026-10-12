import { useEffect, useRef, useState } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { BOX, CARD_DOCK, DOCK, PARALLAX, REDUCED_MOTION_SCALE, SIDE_DOCK, TOP_DOCK } from "./config3d.js";
import { IS_CARD } from "../cardBridge.js";
import { IS_APP } from "../platform.js";

// Where the box goes when docked to a side: it moves away from the menu and shrinks a bit.
function sidePose(side) {
  const vw = window.innerWidth >= 240 ? window.innerWidth : 360; // same guard as Box3D's viewportSize()
  const boxW = vw <= BOX.fillBelowPx || IS_APP ? vw : Math.min(BOX.widthPx, vw - 16);
  const scale = Math.max(SIDE_DOCK.minScale, Math.min(SIDE_DOCK.scale, (vw - SIDE_DOCK.menuSpacePx) / boxW));
  const freeEachSide = (vw - boxW * scale) / 2;
  const shift = Math.max(0, SIDE_DOCK.menuSpacePx - freeEachSide);
  return { scale, shiftX: (side === "right" ? -1 : 1) * shift };
}

// Mouse position (or a swipe on touch screens) -> box pose. The box stays flat while
// the pointer moves over it; only reaching an edge "docks" it: the tilt
// catches at its max and dockedSide ("left" | "right" | "top") is
// reported so the caller can open a menu.
// `paused` freezes everything flat (used while a real modal is open).
export function useParallax3d(paused = false, isTopMenuHovered, forcedDock = null) {
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
    // In the floating card the wallet never moves: only the menu opens.
    if (forcedDock && IS_CARD) {
      rawRotateY.set(0);
      rawShiftX.set(0);
      rawRotateX.set(0);
      rawShiftY.set(0);
      rawScale.set(1);
      dockedRef.current = forcedDock;
      setDockedSide(forcedDock);
      return;
    }
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
        const pose = sidePose(forcedDock);
        rawRotateY.set((forcedDock === "right" ? -1 : 1) * PARALLAX.maxTiltDeg * f);
        rawShiftX.set(pose.shiftX * f);
        rawScale.set(1 - (1 - pose.scale) * f);
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
        // Stay docked while the pointer is still on that same side, past the release line.
        if (Math.abs(nx) >= DOCK.releaseNx && (nx > 0) === (docked === "right")) return;
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
        const pose = sidePose(side);
        rawRotateY.set((side === "right" ? -1 : 1) * PARALLAX.maxTiltDeg * s);
        rawShiftX.set(pose.shiftX * s);
        rawScale.set(1 - (1 - pose.scale) * s);
      } else if (ny <= -DOCK.thresholdNy) {
        dockedRef.current = "top";
        setDockedSide("top");
        rawRotateX.set(TOP_DOCK.tiltDeg * s);
        rawShiftY.set(TOP_DOCK.shiftYPx * s);
        rawScale.set(1 - (1 - TOP_DOCK.scale) * s);
      }
    };

    // Floating card (extension on a website): the wallet stays still, the menus
    // open outside it. A menu opens when the mouse reaches that edge of the
    // wallet and stays open while the mouse is on the menu or near that edge.
    const handleCardPosition = (x, y) => {
      const stage = document.querySelector(".d3-stage");
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      const docked = dockedRef.current;
      if (docked === "left" && x < r.left + CARD_DOCK.holdPx) return;
      if (docked === "right" && x > r.right - CARD_DOCK.holdPx) return;
      if (docked === "top" && (y < r.top + CARD_DOCK.holdPx || isTopMenuHovered?.())) return;

      let side = null;
      if (x < r.left + CARD_DOCK.edgePx) side = "left";
      else if (x > r.right - CARD_DOCK.edgePx) side = "right";
      else if (y < r.top + CARD_DOCK.edgePx) side = "top";
      if (side !== docked) {
        dockedRef.current = side;
        setDockedSide(side);
      }
    };


    const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
    let cleanupPointer;

    if (IS_CARD) {
      const onMove = (e) => handleCardPosition(e.clientX, e.clientY);
      const onLeave = () => releaseDock();
      const onEdge = (e) => {
        const side = e.detail;
        if (dockedRef.current === side) return;
        dockedRef.current = side;
        setDockedSide(side);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("lyra-pointer-left", onLeave);
      window.addEventListener("lyra-pointer-edge", onEdge);
      window.addEventListener("blur", onLeave);
      cleanupPointer = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("lyra-pointer-left", onLeave);
        window.removeEventListener("lyra-pointer-edge", onEdge);
        window.removeEventListener("blur", onLeave);
      };
    } else if (hasFinePointer && !IS_APP) {
      const onMove = (e) => {
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = (e.clientY / window.innerHeight) * 2 - 1;
        handlePosition(nx, ny);
      };
      const onLeave = () => {
        releaseDock();
        resetFlat();
      };
      // In the floating card, leaving the wallet for the page is reported
      // by cardBridge.js ("lyra-pointer-left"): the frame itself gets no
      // reliable leave event then.
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerleave", onLeave);
      window.addEventListener("lyra-pointer-left", onLeave);
      window.addEventListener("blur", onLeave);
      cleanupPointer = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("lyra-pointer-left", onLeave);
        window.removeEventListener("blur", onLeave);
      };
    } else {
      // Phones, tablets and the web app: the menus open only with a swipe.
      // From the left edge toward the middle opens the left menu, from the
      // right the right one, down from the upper part of the screen the
      // assets. Swiping back, or tapping the wallet, closes it. A finger
      // (touch events, which the browser doesn't cancel when it scrolls) or,
      // in the web app on a computer, a mouse drag.
      const close = () => { releaseDock(); resetFlat(); };
      const scrollsVertically = (el) => {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          const oy = getComputedStyle(n).overflowY;
          if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return true;
        }
        return false;
      };
      let start = null;
      const begin = (x, y, target) => { start = { x, y, target }; };
      const finish = (x, y) => {
        const s = start;
        start = null;
        if (!s) return;
        const dx = x - s.x;
        const dy = y - s.y;
        const target = s.target instanceof Element ? s.target : null;
        const inMenu = !!target?.closest(".d3-side-menu, .d3-assets-menu");
        const docked = dockedRef.current;
        if (Math.hypot(dx, dy) < 10) {
          // a tap on the pushed-aside wallet brings it back
          if (docked && !inMenu && target?.closest(".d3-scene")) close();
          return;
        }
        if (target?.closest("input, textarea, [contenteditable='true']")) return;
        const horizontal = Math.abs(dx) > 48 && Math.abs(dx) > 1.4 * Math.abs(dy);
        const vertical = Math.abs(dy) > 56 && Math.abs(dy) > 1.4 * Math.abs(dx);
        if (docked) {
          if ((docked === "left" && horizontal && dx < 0) || (docked === "right" && horizontal && dx > 0) || (docked === "top" && vertical && dy < 0)) close();
          return;
        }
        if (inMenu) return;
        if (horizontal) handlePosition(dx > 0 ? -1 : 1, 0);
        else if (vertical && dy > 0 && s.y < window.innerHeight * 0.4 && !scrollsVertically(target)) handlePosition(0, -1);
      };
      const onTouchStart = (e) => {
        if (e.touches.length !== 1) { start = null; return; }
        begin(e.touches[0].clientX, e.touches[0].clientY, e.target);
      };
      const onTouchEnd = (e) => { if (e.changedTouches.length) finish(e.changedTouches[0].clientX, e.changedTouches[0].clientY); };
      const onTouchCancel = () => { start = null; };
      const onMouseDown = (e) => { if (e.pointerType === "mouse" && e.button === 0) begin(e.clientX, e.clientY, e.target); };
      const onMouseUp = (e) => { if (e.pointerType === "mouse") finish(e.clientX, e.clientY); };
      window.addEventListener("touchstart", onTouchStart, { passive: true });
      window.addEventListener("touchend", onTouchEnd, { passive: true });
      window.addEventListener("touchcancel", onTouchCancel, { passive: true });
      window.addEventListener("pointerdown", onMouseDown);
      window.addEventListener("pointerup", onMouseUp);
      cleanupPointer = () => {
        window.removeEventListener("touchstart", onTouchStart);
        window.removeEventListener("touchend", onTouchEnd);
        window.removeEventListener("touchcancel", onTouchCancel);
        window.removeEventListener("pointerdown", onMouseDown);
        window.removeEventListener("pointerup", onMouseUp);
      };
    }

    return () => {
      media.removeEventListener("change", onChange);
      cleanupPointer?.();
    };
  }, [paused, forcedDock, rawRotateX, rawRotateY, rawShiftX, rawShiftY, rawScale, isTopMenuHovered]);

  return { rotateX, rotateY, shiftX, shiftY, scale, dockedSide };
}
