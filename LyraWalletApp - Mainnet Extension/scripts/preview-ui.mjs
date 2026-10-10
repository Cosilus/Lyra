// Dev preview: renders the new chooser / Rewards screens inside a browser-looking 1280x800 window.
// (Same machinery as make-store-assets.mjs.)
// Original header: Makes the images the Chrome Web Store asks for, from the real extension:
//   screenshots 1280x800 (the side panel inside a browser-looking window), a 440x280 small promo tile
//   and a 1400x560 marquee.
//
// How: starts a headless Chrome, opens the built extension (served by `npm run serve:ext` on :5195),
// creates a throwaway wallet, talks to Lyra, hovers the 3D edges, then draws each panel capture into
// a 1280x800 "browser window" and screenshots that.
//
//   npm run build && npm run serve:ext      (in another terminal)
//   node scripts/make-store-assets.mjs "<output folder>"
//
// Needs Chrome (set CHROME to its path if it is not in the default place) and the live backend
// (VITE_API_URL) for the chat answer.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(process.argv[2] || "store-assets");
const APP = process.env.APP_URL || "http://localhost:5195";
const CHROME = process.env.CHROME || [
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error("Chrome not found: set the CHROME environment variable.");
const PASSWORD = "Store-Shots-9f3kQ!";   // throwaway wallet, local headless profile only
const PORT = 9333;

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ headless Chrome + a tiny CDP client
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-shots-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--remote-allow-origins=*",
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--disable-web-security", "--force-color-profile=srgb", "about:blank",
], { stdio: "ignore" });

async function connect() {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
    if (!target) await sleep(250);
  }
  if (!target) throw new Error("Chrome did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { ok, ko } = pending.get(d.id); pending.delete(d.id); d.error ? ko(new Error(d.error.message)) : ok(d.result); }
  };
  const send = (method, params = {}) => new Promise((ok, ko) => { const i = ++id; pending.set(i, { ok, ko }); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, close: () => ws.close() };
}

const cdp = await connect();
const ev = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("page error: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const go = async (url) => { await cdp.send("Page.navigate", { url }); await sleep(2500); };
const viewport = (w, h, dpr = 1) => cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
const shot = async (clip) => Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })).data, "base64");
const press = async (key, code) => { for (const type of ["keyDown", "keyUp"]) await cdp.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: key === "Enter" ? 13 : 0 }); };

const PAGE_HELPERS = `
  window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__set = (el, v) => { const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
  window.__btn = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
  window.__move = (nx, ny) => window.dispatchEvent(new PointerEvent("pointermove", { clientX: (nx + 1) / 2 * innerWidth, clientY: (ny + 1) / 2 * innerHeight, bubbles: true }));
`;

// ------------------------------------------------------------ drive the app
const PANEL_W = 400, PANEL_H = 752;
const panel = {};

async function openApp(mode, reset = false) {
  await viewport(PANEL_W, PANEL_H, 2);
  await go(APP + "/index.html");
  await ev(`${reset ? 'localStorage.removeItem("plasma_wallet_v2"); localStorage.removeItem("lyra_ui_mode_v1");' : ""} ${mode ? `localStorage.setItem("lyra_ui_mode_v1", "${mode}");` : ""} localStorage.setItem("lyra_3d_tour_seen_v1", "1"); 1`);
  await go(APP + "/index.html");
  await ev(PAGE_HELPERS + "1");
}
async function unlockIfNeeded() {
  const locked = await ev(`document.body.innerText.includes("Locked Wallet")`);
  if (locked) {
    await ev(`(() => { const pw = document.querySelector("input[type=password]"); pw.focus(); __set(pw, "${PASSWORD}"); 1 })()`);
    await press("Enter", "Enter"); await sleep(4000);
  }
}

console.log("a/ new wallet -> chooser (3D selected)");
await openApp(null, true);
await ev(`(async () => { await __sleep(1000); __btn("Create wallet").click(); await __sleep(800);
  const pw = document.querySelectorAll("input[type=password]"); __set(pw[0], "${PASSWORD}"); __set(pw[1], "${PASSWORD}"); await __sleep(300);
  __btn("Secure the wallet").click(); await __sleep(5000); 1 })()`);
panel.chooser3d = await shot();

console.log("b/ swap to 2D: mid animation, then settled");
await ev(`[...document.querySelectorAll(".ic-pill button")].find((b) => b.textContent === "2D").click(); 1`);
await sleep(170);
panel.chooserMid = await shot();
await sleep(900);
panel.chooser2d = await shot();

console.log("c/ pick 2D, open the menu, open Rewards");
await ev(`document.querySelector(".ic-card-cta").click(); 1`); await sleep(2500);
await ev(`document.querySelector(".circle-menu-trigger").click(); 1`); await sleep(1500);
panel.menu2d = await shot();
await ev(`document.querySelector('.circle-menu-item[aria-label="Rewards"]').click(); 1`); await sleep(1000);
panel.rewards2d = await shot();

console.log("d/ 3D: left menu with Rewards, then the Rewards panel");
await openApp("3d");
await unlockIfNeeded();
await ev(`__move(-0.95, 0); 1`); await sleep(1800);
panel.menu3d = await shot();
await ev(`document.querySelector('.d3-side-menu--left .d3-side-item[aria-label="Rewards"]').click(); 1`); await sleep(1200);
panel.rewards3d = await shot();

// ------------------------------------------------------------ compose
const b64 = (buf) => "data:image/png;base64," + buf.toString("base64");
const icon = b64(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons", "icon-128.png")));
await viewport(1280, 800, 1);
const frame = (img, headline, sub) => `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; } body { width: 1280px; height: 800px; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; background: #0D0916; color: #F3EBFF; }
  .win { position: absolute; inset: 0; background: radial-gradient(900px 600px at 25% 20%, #2b1d52 0%, #130c24 55%, #0D0916 100%); }
  .bar { height: 42px; background: #191226; border-bottom: 1px solid #2a1d4a; display: flex; align-items: center; gap: 8px; padding: 0 16px; }
  .bar i { width: 12px; height: 12px; border-radius: 50%; background: #3a2d5c; } .bar .url { margin-left: 18px; height: 26px; width: 420px; border-radius: 13px; background: #231a36; }
  .page { position: absolute; left: 72px; top: 160px; width: 700px; }
  .page h1 { font-size: 50px; line-height: 1.1; font-weight: 700; letter-spacing: -.01em; }
  .page p { margin-top: 18px; font-size: 22px; line-height: 1.5; color: #c9bde6; max-width: 560px; }
  .logo { position: absolute; left: 72px; top: 76px; width: 56px; height: 56px; border-radius: 12px; }
  .panel { position: absolute; right: 0; top: 42px; width: ${PANEL_W}px; height: ${PANEL_H + 6}px; border-left: 1px solid #2a1d4a; background: #0D0916; box-shadow: -18px 0 50px rgba(0,0,0,.45); }
  .panel img { width: ${PANEL_W}px; height: ${PANEL_H}px; display: block; }
</style><div class="win"><div class="bar"><i></i><i></i><i></i><div class="url"></div></div>
<img class="logo" src="${icon}"><div class="page"><h1>${headline}</h1><p>${sub}</p></div>
<div class="panel"><img src="${img}"></div></div>`;
const compose = async (html) => {
  await cdp.send("Page.navigate", { url: "about:blank" }); await sleep(300);
  await ev(`document.open(); document.write(${JSON.stringify(html)}); document.close(); 1`); await sleep(700);
  return shot({ x: 0, y: 0, width: 1280, height: 800 });
};
const list = [
  ["1-chooser-3d", panel.chooser3d, "1. The chooser:<br>3D selected", "The 2D | 3D pill on top, the 3D card in front and the 2D card peeking out behind it."],
  ["2-chooser-swap", panel.chooserMid, "2. Switching:<br>the cards swap", "Mid-animation: the front card swings out over the other one."],
  ["3-chooser-2d", panel.chooser2d, "3. 2D selected", "Now the 2D card is in front, the 3D card waits behind."],
  ["4-menu-2d", panel.menu2d, "4. 2D menu", "Six buttons now: Rewards is the last one, still clear of the logo."],
  ["5-rewards-2d", panel.rewards2d, "5. Rewards (2D)", "Gift icon, every interaction is recorded, Community Airdrop coming soon."],
  ["6-menu-3d", panel.menu3d, "6. 3D left menu", "Rewards, with its gift icon, at the very bottom under Settings."],
  ["7-rewards-3d", panel.rewards3d, "7. Rewards (3D)", "The same panel over the 3D wallet."],
];
for (const [name, img, h, s] of list) {
  fs.writeFileSync(path.join(OUT, name + ".png"), await compose(frame(b64(img), h, s)));
  console.log("wrote " + name + ".png");
}
cdp.close(); chrome.kill();
await sleep(500);
fs.rmSync(profile, { recursive: true, force: true });
console.log("done:", OUT);
