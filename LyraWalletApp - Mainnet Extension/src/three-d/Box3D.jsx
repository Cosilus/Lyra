import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { BOX, CARD_DOCK, DOCK } from "./config3d.js";
import { useParallax3d } from "./useParallax3d.js";
import { Tour3D, tourStepsHere } from "./Tour3D.jsx";
import { TokenLogo } from "../tokenLogo.jsx";
import { EmptyWallet, TokenWithChain } from "../uiPolish.jsx";
import { IS_CARD, reportCardDock } from "../cardBridge.js";
import { IS_APP } from "../platform.js";
import "./three-d.css";

// The box is 420 x up to 820 on a normal window, but must also fit a narrow, tall
// window such as a browser side panel (about 320-480px wide): it then takes the whole
// width and height minus a small margin instead of overflowing and being cut off.
const NARROW_PX = 480;
const NARROW_MARGIN_PX = 8;

// A browser side panel can report a 0 x 0 (or tiny) window on its very first frame, before it has
// been laid out. A box sized from that is invisible, so never trust a size below these floors:
// fall back to a sane default now, and measure again as soon as the real size is known.
const MIN_VIEW_W = 240, MIN_VIEW_H = 320, FALLBACK_VIEW_W = 360, FALLBACK_VIEW_H = 640;

function viewportSize() {
  const el = document.documentElement;
  // The web app on a phone: the screen itself (the initial containing block).
  // innerWidth grows when anything overflows the page, and a box sized from
  // it overflows in turn: the wallet ended up wider than the phone, shifted.
  let vw = (IS_APP ? el.clientWidth : 0) || window.innerWidth || el.clientWidth;
  let vh = (IS_APP ? el.clientHeight : 0) || window.innerHeight || el.clientHeight;
  if (!(vw >= MIN_VIEW_W)) vw = FALLBACK_VIEW_W;
  if (!(vh >= MIN_VIEW_H)) vh = FALLBACK_VIEW_H;
  return { vw, vh };
}

function computeBoxSize() {
  // Floating card: the wallet fills its area (#root, see the card rules in three-d.css);
  // the rest of the frame is the transparent margin the menus open into.
  if (IS_CARD) {
    const root = document.getElementById("root");
    const w = root?.clientWidth || 0, h = root?.clientHeight || 0;
    return { width: w >= MIN_VIEW_W ? w : FALLBACK_VIEW_W, height: h >= MIN_VIEW_H ? h : FALLBACK_VIEW_H };
  }
  const { vw, vh } = viewportSize();
  // Side panel / phone, and the web app on any screen (tablets too): the box IS the
  // window, edge to edge (straight corners, see three-d.css).
  if (vw <= BOX.fillBelowPx || IS_APP) return { width: vw, height: vh };
  const narrow = vw <= NARROW_PX;
  const width = Math.max(280, Math.min(BOX.widthPx, vw - NARROW_MARGIN_PX * 2));
  const wanted = narrow ? vh - NARROW_MARGIN_PX * 2 : Math.round(vh * BOX.viewportFraction);
  // Keep the desktop minimum when there is room for it, never exceed the window.
  const floor = Math.min(BOX.minHeightPx, Math.max(320, vh - NARROW_MARGIN_PX * 2));
  return { width, height: Math.max(floor, Math.min(BOX.maxHeightPx, wanted)) };
}

function useBoxSize() {
  const [size, setSize] = useState(computeBoxSize);
  useEffect(() => {
    const onResize = () => setSize((prev) => {
      const next = computeBoxSize();
      return prev.width === next.width && prev.height === next.height ? prev : next;
    });
    window.addEventListener("resize", onResize);
    // The panel may only get its real size after the first paint, and a resize event is not
    // guaranteed for that: re-measure on the next frames and whenever the root element changes size.
    const raf = requestAnimationFrame(onResize);
    const t1 = setTimeout(onResize, 150);
    const t2 = setTimeout(onResize, 600);
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(onResize);
      ro.observe(document.documentElement);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
    };
  }, []);
  return size;
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

function AssetsTopMenu({ show, spot, assets, networkName, networkKey, nativeSymbol, onReceive, onMouseEnter, onMouseLeave }) {
  const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const held = assets.filter(a => a.balance > 0);
  const total = held.reduce((t, a) => t + a.balance * a.usdPrice, 0);
  return (
    <div
      className={`d3-assets-menu${show ? " d3-assets-menu--show" : ""}${spot ? " d3-assets-menu--spot" : ""}`}
      aria-hidden={!show}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="d3-assets-head">
        <div className="d3-assets-label">Assets{networkName ? ` · ${networkName}` : ""}</div>
        <div className="d3-assets-total">{usd(total)}</div>
      </div>
      {!held.length ? (
        <EmptyWallet compact networkName={networkName} nativeSymbol={nativeSymbol} onReceive={onReceive} />
      ) : (
        <div className="d3-assets-list">
          {held.map((a) => {
            const value = a.balance * a.usdPrice;
            const share = total > 0 ? Math.round((value / total) * 100) : 0;
            return (
              <div className="d3-asset-row" key={a.symbol}>
                <TokenWithChain symbol={a.symbol} networkKey={networkKey} size={30} fallbackColor={a.color} />
                <span className="d3-asset-text">
                  <b>{a.symbol}</b>
                  <span>{a.name}{total > 0 ? ` · ${share}%` : ""}</span>
                </span>
                <span className="d3-asset-value">
                  <b>{usd(value)}</b>
                  <span>{a.balance.toLocaleString("en-US", { maximumFractionDigits: 4 })} {a.symbol}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The optional 3D interface: wraps the REAL wallet frame (`children`)
// in a parallax shadow box. Reaching the left/right window edge docks
// the box and opens a side menu (leftItems / rightItems), reaching the
// top edge opens the assets menu. `paused` freezes it flat (e.g. while
// a real modal is open on top).
export function Box3D({ children, leftItems, rightItems, assets, networkName, networkKey, nativeSymbol, onReceive, paused, tourActive = false, onTourDone }) {
  const { width, height } = useBoxSize();
  const [tourStep, setTourStep] = useState(0);
  useEffect(() => {
    if (tourActive) setTourStep(0);
  }, [tourActive]);
  const tourSteps = useMemo(tourStepsHere, [tourActive]);
  const step = tourActive ? tourSteps[tourStep] : null;
  const forcedDock = step ? step.dock : null;
  const assetsMenuHoveredRef = useRef(false);
  const isAssetsMenuHovered = useCallback(() => assetsMenuHoveredRef.current, []);
  const { rotateX, rotateY, shiftX, shiftY, scale, dockedSide } = useParallax3d(paused, isAssetsMenuHovered, forcedDock);
  useEffect(() => {
    if (IS_CARD) reportCardDock(dockedSide);
  }, [dockedSide]);

  return (
    <div className={`d3-scene${dockedSide ? " d3-scene--docked" : ""}`}>
      <div
        className="d3-stage"
        style={{
          width,
          height,
          // Floating card: the wallet shrinks a little while a menu is open (the menus don't), so the
          // menus move in by as much to keep the same gap (card rules in styles.css).
          ...(IS_CARD && dockedSide && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? { "--card-dock-dx": `${(width * (1 - CARD_DOCK.scale)) / 2}px`, "--card-dock-dy": `${(height * (1 - CARD_DOCK.scale)) / 2}px` } : null),
        }}
      >
      <SideMenu side={dockedSide} items={leftItems} position="left" spotIndex={step?.dock === "left" ? step.index : -1} />
      <SideMenu side={dockedSide} items={rightItems} position="right" spotIndex={step?.dock === "right" ? step.index : -1} />
      <AssetsTopMenu
        show={dockedSide === "top"}
        spot={step?.dock === "top"}
        assets={assets}
        networkName={networkName}
        networkKey={networkKey}
        nativeSymbol={nativeSymbol}
        onReceive={onReceive}
        onMouseEnter={() => { assetsMenuHoveredRef.current = true; }}
        onMouseLeave={() => { assetsMenuHoveredRef.current = false; }}
      />
      <motion.div
        className="d3-box"
        style={{ width, height, rotateX, rotateY, x: shiftX, y: shiftY, scale }}
      >
        <div className="d3-room" style={{ transform: `translateZ(-${BOX.depthPx / 2}px)` }}>
          {/* Oversized backdrop just behind the front face: hides the thin strips a tilt opens at the
              window edges. Off-screen at rest, only used in the full-window layout (see three-d.css). */}
          <div className="d3-skirt" style={{ transform: `translateZ(${BOX.depthPx / 2 - 8}px)` }} />
          <div
            className="d3-face d3-face--back"
            style={{ width, height, transform: `rotateY(180deg) translateZ(${BOX.depthPx / 2}px)` }}
          />
          <div
            className="d3-face d3-face--front"
            style={{
              width,
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
          steps={tourSteps}
          total={tourSteps.length}
          onNext={() => (tourStep >= tourSteps.length - 1 ? onTourDone?.() : setTourStep((n) => n + 1))}
          onBack={() => setTourStep((n) => Math.max(0, n - 1))}
          onSkip={() => onTourDone?.()}
        />
      )}
    </div>
  );
}
