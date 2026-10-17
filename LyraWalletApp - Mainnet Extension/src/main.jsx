import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { startCardBridge, startCloseShortcut } from "./cardBridge.js";
import { syncNetworks } from "./providerSync.js";
import { startTooltips } from "./tooltips.js";
import { startMenuMorph } from "./menuMorph.js";
import { startFadeScroll } from "./fadeScroll.js";
import { IS_APP, startApp } from "./platform.js";

startApp();
startCardBridge();
startTooltips();
startMenuMorph();
startFadeScroll();
// holding C closes the side panel; the web app has no window to close
if (!IS_APP) startCloseShortcut();
syncNetworks();

// Startup watchdog for the extension: if the panel is still empty a few seconds after load (a crash
// while rendering, or a layout that ends up invisible), show what went wrong instead of a blank
// screen, with a way out: reload, or switch to the flat 2D view and reload.
const startupErrors = [];
window.addEventListener("error", (e) => startupErrors.push(e.message || String(e.error || e)));
window.addEventListener("unhandledrejection", (e) => startupErrors.push("Promise: " + (e.reason?.message || String(e.reason))));

function showStartupProblem() {
  const root = document.getElementById("root");
  const visible = root && root.innerText.trim().length > 0 && root.getBoundingClientRect().height > 50;
  if (visible) return;
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#0b0814;color:#eee;font:13px/1.5 system-ui,sans-serif;padding:20px;overflow:auto";
  const errs = startupErrors.slice(0, 5).map((m) => "• " + m).join("\n") || "No error was reported.";
  box.innerHTML = `<h3 style="margin:0 0 8px;font-size:16px">Lyra didn't display correctly</h3>
    <p style="margin:0 0 12px;opacity:.8">Window ${window.innerWidth} x ${window.innerHeight}. Try the flat view, or reload.</p>
    <pre style="white-space:pre-wrap;background:#1a1426;padding:10px;border-radius:8px;font-size:12px"></pre>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="lyra-w-2d" style="flex:1;padding:10px;border-radius:8px;border:0;background:#b9a6ff;color:#120a24;font-weight:600">Open in 2D</button>
      <button id="lyra-w-reload" style="flex:1;padding:10px;border-radius:8px;border:1px solid #555;background:transparent;color:#eee">Reload</button>
    </div>`;
  box.querySelector("pre").textContent = errs;
  document.body.appendChild(box);
  box.querySelector("#lyra-w-2d").onclick = () => { try { localStorage.setItem("lyra_ui_mode_v1", "2d"); } catch {} location.reload(); };
  box.querySelector("#lyra-w-reload").onclick = () => location.reload();
}
setTimeout(showStartupProblem, 3500);

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);
