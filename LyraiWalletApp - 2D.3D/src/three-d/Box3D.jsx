import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { BOX, DOCK } from "./config3d.js";
import { useParallax3d } from "./useParallax3d.js";
import { Tour3D, TOUR_STEPS } from "./Tour3D.jsx";
import "./three-d.css";

function computeBoxHeight() {
  return Math.max(BOX.minHeightPx, Math.min(BOX.maxHeightPx, Math.round(window.innerHeight * BOX.viewportFraction)));
}

function useBoxHeight() {
  const [h, setH] = useState(computeBoxHeight);
  useEffect(() => {
    const onResize = () => setH(computeBoxHeight());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return h;
}

function SideMenu({ side, items, position, spotIndex }) {
  const centerIndex = (items.length - 1) / 2;
  const show = side === position;
  return (
    <nav className={`d3-side-menu d3-side-menu--${position}${show ? " d3-side-menu--show" : ""}`} aria-hidden={!show}>
      {items.map((item, i) => (
        <button
          key={item.label}
          className={`d3-side-item${spotIndex === i ? " d3-side-item--spot" : ""}`}
          type="button"
          aria-label={item.label}
          data-label={item.label}
          tabIndex={show ? 0 : -1}
          onClick={item.onClick}
          style={{
            // Only the entrance is staggered; hover must answer at once.
            "--delay": `${Math.abs(i - centerIndex) * DOCK.itemStaggerMs}ms`,
            "--offset": i - centerIndex,
          }}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
}

function AssetsTopMenu({ show, spot, assets, onMouseEnter, onMouseLeave }) {
  return (
    <div
      className={`d3-assets-menu${show ? " d3-assets-menu--show" : ""}${spot ? " d3-assets-menu--spot" : ""}`}
      aria-hidden={!show}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="d3-assets-label">Assets</div>
      <div className="d3-assets-grid">
        {assets.length === 0 && <div className="d3-assets-empty">No assets yet.</div>}
        {assets.map((a) => (
          <div className="d3-atm-pill" key={a.symbol}>
            <span className="d3-atm-icon-wrap">
              <span className="d3-atm-icon" style={{ background: a.color }}>{a.symbol[0]}</span>
              <span className="d3-atm-tooltip">{a.name}</span>
            </span>
            <span className="d3-atm-value-wrap">
              <span className="d3-atm-usd">
                {(a.balance * a.usdPrice).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
              </span>
              <span className="d3-atm-tooltip">
                {a.balance.toLocaleString("en-US", { maximumFractionDigits: 4 })} {a.symbol}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The optional 3D interface: wraps the REAL wallet frame (`children`)
// in a parallax shadow box. Reaching the left/right window edge docks
// the box and opens a side menu (leftItems / rightItems), reaching the
// top edge opens the assets menu. `paused` freezes it flat (e.g. while
// a real modal is open on top).
export function Box3D({ children, leftItems, rightItems, assets, paused, tourActive = false, onTourDone, tiltEnabled = false }) {
  const height = useBoxHeight();
  const [tourStep, setTourStep] = useState(0);
  useEffect(() => {
    if (tourActive) setTourStep(0);
  }, [tourActive]);
  const step = tourActive ? TOUR_STEPS[tourStep] : null;
  const forcedDock = step ? step.dock : null;
  const assetsMenuHoveredRef = useRef(false);
  const isAssetsMenuHovered = useCallback(() => assetsMenuHoveredRef.current, []);
  const { rotateX, rotateY, shiftX, shiftY, scale, dockedSide } = useParallax3d(paused, isAssetsMenuHovered, forcedDock, tiltEnabled);

  return (
    <div className="d3-scene">
      <div className="d3-stage" style={{ width: BOX.widthPx, height }}>
      <SideMenu side={dockedSide} items={leftItems} position="left" spotIndex={step?.dock === "left" ? step.index : -1} />
      <SideMenu side={dockedSide} items={rightItems} position="right" spotIndex={step?.dock === "right" ? step.index : -1} />
      <AssetsTopMenu
        show={dockedSide === "top"}
        spot={step?.dock === "top"}
        assets={assets}
        onMouseEnter={() => { assetsMenuHoveredRef.current = true; }}
        onMouseLeave={() => { assetsMenuHoveredRef.current = false; }}
      />
      <motion.div
        className="d3-box"
        style={{ width: BOX.widthPx, height, rotateX, rotateY, x: shiftX, y: shiftY, scale }}
      >
        <div className="d3-room" style={{ transform: `translateZ(-${BOX.depthPx / 2}px)` }}>
          <div
            className="d3-face d3-face--back"
            style={{ width: BOX.widthPx, height, transform: `rotateY(180deg) translateZ(${BOX.depthPx / 2}px)` }}
          />
          <div
            className="d3-face d3-face--front"
            style={{
              width: BOX.widthPx,
              height,
              transform: `translateZ(${BOX.depthPx / 2}px)`,
              // While docked the box is at max tilt and real pointer
              // hit-testing inside a rotated preserve-3d face is
              // unreliable (clicks land on the wrong element), and the
              // user is reaching for the side menu anyway.
              pointerEvents: dockedSide ? "none" : undefined,
            }}
          >
            {children}
          </div>
        </div>
      </motion.div>
      </div>
      {tourActive && (
        <Tour3D
          step={tourStep}
          total={TOUR_STEPS.length}
          onNext={() => (tourStep >= TOUR_STEPS.length - 1 ? onTourDone?.() : setTourStep((n) => n + 1))}
          onBack={() => setTourStep((n) => Math.max(0, n - 1))}
          onSkip={() => onTourDone?.()}
        />
      )}
    </div>
  );
}
