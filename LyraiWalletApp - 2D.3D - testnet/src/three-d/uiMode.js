// "2d" (the classic Lyra frame) or "3d" (same wallet inside the
// parallax depth box). Stored per-device, switchable any time from
// Settings -> Interface.
const KEY = "lyra_ui_mode_v1";

export function loadUiMode() {
  try {
    return localStorage.getItem(KEY) === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

export function saveUiMode(mode) {
  try {
    localStorage.setItem(KEY, mode === "3d" ? "3d" : "2d");
  } catch {
    // storage blocked: the choice just won't persist across reloads
  }
}

// First-time 3D guided tour (once per device; replayable from Settings).
const TOUR_KEY = "lyra_3d_tour_seen_v1";

export function hasSeenTour() {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return true;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch {
    // storage blocked: the tour may show again next time, harmless
  }
}
