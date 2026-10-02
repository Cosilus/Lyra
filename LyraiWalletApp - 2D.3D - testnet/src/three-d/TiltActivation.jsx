import { useState } from "react";
import { createPortal } from "react-dom";

export const TILT_KEY = "lyra_tilt_v1";

// True on phones/tablets (touch only, no mouse), where 3D is driven by
// the physical tilt of the device instead of the pointer.
export function isTouchOnly() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
}

// iOS asks for motion access with a prompt that must come from a tap.
export function needsMotionPermission() {
  return typeof window !== "undefined"
    && typeof window.DeviceOrientationEvent !== "undefined"
    && typeof window.DeviceOrientationEvent.requestPermission === "function";
}

export function rememberTilt(on) {
  try { localStorage.setItem(TILT_KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
}
export function tiltRemembered() {
  try { return localStorage.getItem(TILT_KEY) === "on"; } catch { return false; }
}

// Asks for sensor access if needed. Resolves to { ok, error }.
export async function requestTilt() {
  if (typeof window === "undefined" || typeof window.DeviceOrientationEvent === "undefined") {
    return { ok: false, error: "This browser doesn't provide a motion sensor." };
  }
  if (!window.isSecureContext) {
    return { ok: false, error: "Tilt Mode needs a secure (HTTPS) connection." };
  }
  try {
    if (needsMotionPermission()) {
      const result = await window.DeviceOrientationEvent.requestPermission();
      if (result !== "granted") return { ok: false, error: "Motion access was declined." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Couldn't turn on the motion sensor." };
  }
}

// Shown on touch devices when 3D is on and tilt isn't active yet. The
// wallet never depends on it: "Stay in 2D" is always one tap away.
export function TiltActivation({ onEnabled, onStay2d }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function enable() {
    setBusy(true);
    setError(null);
    const r = await requestTilt();
    setBusy(false);
    if (r.ok) onEnabled();
    else setError(r.error);
  }

  return createPortal(
    <div className="tilt-overlay" role="dialog" aria-modal="true" aria-label="Tilt Mode">
      <div className="tilt-card">
        <div className="tilt-icon" aria-hidden="true">◇</div>
        <h2>Explore Lyra in 3D</h2>
        <p>Tilt your phone to move through your wallet.</p>
        <button type="button" className="tilt-enable" onClick={enable} disabled={busy} autoFocus>
          Enable Tilt Mode
        </button>
        <button type="button" className="tilt-2d" onClick={onStay2d}>Stay in 2D</button>
        {error && <p className="tilt-error">{error}</p>}
        <small>Motion sensors are optional.</small>
      </div>
    </div>,
    document.body
  );
}
