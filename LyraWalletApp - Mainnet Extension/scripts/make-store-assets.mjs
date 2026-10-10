// Makes the images the Chrome Web Store asks for, from the real extension:
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

fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
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
const PANEL_W = 400, PANEL_H = 752;   // the side panel as it will sit in the 1280x800 window
const panel = {};

async function openApp(mode) {
  await viewport(PANEL_W, PANEL_H, 2);
  await go(APP + "/index.html");
  await ev(`localStorage.setItem("lyra_ui_mode_v1", "${mode}"); localStorage.setItem("lyra_3d_tour_seen_v1", "1"); 1`);
  await go(APP + "/index.html");
  await ev(PAGE_HELPERS + "1");
}
async function dismissExtras(mode) {
  // After a wallet is created or unlocked: pick the view on the chooser, skip the 3D tour.
  await ev(`(async () => { await __sleep(700);
    if (document.body.innerText.includes("Choose your wallet experience")) {
      const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(mode === "3d" ? "Choose 3D" : "Choose 2D")});
      el && el.click(); await __sleep(2500);
    }
    const skip = __btn("Skip tour"); if (skip) { skip.click(); await __sleep(900); }
    1 })()`);
}
async function createWalletIfNeeded(mode) {
  const state = await ev(`(async () => { await __sleep(1200);
    if (!localStorage.getItem("plasma_wallet_v2")) return "create";
    return document.body.innerText.includes("Locked Wallet") ? "unlock" : "ready"; })()`);
  if (state === "create") {
    await ev(`(async () => { __btn("Create wallet").click(); await __sleep(800);
      const pw = document.querySelectorAll("input[type=password]"); __set(pw[0], "${PASSWORD}"); __set(pw[1], "${PASSWORD}"); await __sleep(300);
      __btn("Secure the wallet").click(); await __sleep(5000); 1 })()`);
  } else if (state === "unlock") {
    await ev(`(async () => { const pw = document.querySelector("input[type=password]"); pw.focus(); __set(pw, "${PASSWORD}"); 1 })()`);
    await press("Enter", "Enter"); await sleep(4000);
  }
  await dismissExtras(mode);
}
async function ask(text, maxMs = 60000) {
  await ev(`(async () => { const i = document.querySelector('input[placeholder^="Message Lyra"], textarea[placeholder^="Message Lyra"]'); i.focus(); __set(i, ${JSON.stringify(text)}); 1 })()`);
  await press("Enter", "Enter");
  const t0 = Date.now(); let last = "", stable = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(1500);
    const txt = await ev(`document.body.innerText`);
    stable = txt === last ? stable + 1 : 0; last = txt;
    if (stable >= 4 && txt.length > 0 && !/working|thinking|reading/i.test(txt.slice(-400))) break;
  }
  await sleep(800);
}

console.log("1/ 3D view, chat");
await openApp("3d");
await createWalletIfNeeded("3d");
await ev(`__move(0, 0); 1`);
await ask("What is a stablecoin, and why do people use them?");
panel.chat3d = await shot();

console.log("2/ 3D view, side menu open");
await ev(`__move(0.92, 0); 1`); await sleep(1600);
panel.menu3d = await shot();

console.log("3/ 3D view, assets menu open");
await ev(`__move(0, -0.97); 1`); await sleep(1600);
panel.assets3d = await shot();
await ev(`__move(0, 0); 1`); await sleep(800);

console.log("4/ 2D view with the menu");
await openApp("2d");
await createWalletIfNeeded("2d");
await ev(`document.querySelector(".circle-menu-trigger")?.click(); 1`); await sleep(1500);
panel.menu2d = await shot();

// ------------------------------------------------------------ compose the images
const b64 = (buf) => "data:image/png;base64," + buf.toString("base64");
const icon = b64(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons", "icon-128.png")));
await viewport(1280, 800, 1);

const frame = (img, headline, sub) => `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; } body { width: 1280px; height: 800px; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; background: #0D0916; color: #F3EBFF; }
  .win { position: absolute; inset: 0; background: radial-gradient(900px 600px at 25% 20%, #2b1d52 0%, #130c24 55%, #0D0916 100%); }
  .bar { height: 42px; background: #191226; border-bottom: 1px solid #2a1d4a; display: flex; align-items: center; gap: 8px; padding: 0 16px; }
  .bar i { width: 12px; height: 12px; border-radius: 50%; background: #3a2d5c; } .bar .url { margin-left: 18px; height: 26px; width: 420px; border-radius: 13px; background: #231a36; }
  .page { position: absolute; left: 72px; top: 160px; width: 700px; }
  .page h1 { font-size: 52px; line-height: 1.1; font-weight: 700; letter-spacing: -.01em; }
  .page p { margin-top: 18px; font-size: 22px; line-height: 1.5; color: #c9bde6; max-width: 560px; }
  .pill { display: inline-block; margin-top: 26px; padding: 8px 16px; border-radius: 999px; background: #2a1d4a; border: 1px solid #4a3690; font-size: 15px; color: #C4B0FF; letter-spacing: .06em; text-transform: uppercase; }
  .logo { position: absolute; left: 72px; top: 76px; width: 56px; height: 56px; border-radius: 12px; }
  .panel { position: absolute; right: 0; top: 42px; width: ${PANEL_W}px; height: ${PANEL_H + 6}px; border-left: 1px solid #2a1d4a; background: #0D0916; box-shadow: -18px 0 50px rgba(0,0,0,.45); }
  .panel img { width: ${PANEL_W}px; height: ${PANEL_H}px; display: block; }
</style><div class="win"><div class="bar"><i></i><i></i><i></i><div class="url"></div></div>
<img class="logo" src="${icon}"><div class="page"><h1>${headline}</h1><p>${sub}</p><span class="pill">Non-custodial · you confirm every move</span></div>
<div class="panel"><img src="${img}"></div></div>`;

const compose = async (html, w, h) => {
  await viewport(w, h, 1);
  await cdp.send("Page.navigate", { url: "about:blank" }); await sleep(300);
  await ev(`document.open(); document.write(${JSON.stringify(html)}); document.close(); 1`); await sleep(700);
  return shot({ x: 0, y: 0, width: w, height: h });
};

const shots = [
  ["01-chat", panel.chat3d, "Say what you want.<br>Lyra handles the chain.", "Ask questions about Web3, or tell Lyra what to do. You confirm every transaction."],
  ["02-3d-menu", panel.menu3d, "Move your mouse.<br>The wallet moves with you.", "An immersive 3D view: the actions open on the side as you reach the edge."],
  ["03-assets", panel.assets3d, "Your assets,<br>at a glance.", "Reach the top edge to see the tokens you hold, each with its logo."],
  ["04-2d-menu", panel.menu2d, "Prefer it flat?<br>Switch to the classic view.", "The same wallet, the same Lyra: choose 2D or 3D any time, even by asking."],
];
for (const [name, img, h, s] of shots) {
  fs.writeFileSync(path.join(OUT, "screenshots", name + ".png"), await compose(frame(b64(img), h, s), 1280, 800));
  console.log("wrote screenshots/" + name + ".png");
}

const tile = (w, h) => `<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; } body { width: ${w}px; height: ${h}px; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; color: #F3EBFF;
  background: radial-gradient(${w}px ${h}px at 22% 30%, #3a2a66 0%, #150e26 55%, #0D0916 100%); display: flex; align-items: center; justify-content: center; gap: ${Math.round(h * .08)}px; }
  img { width: ${Math.round(h * .42)}px; height: ${Math.round(h * .42)}px; border-radius: ${Math.round(h * .08)}px; }
  b { display: block; font-size: ${Math.round(h * .24)}px; line-height: 1; letter-spacing: -.01em; }
  span { display: block; margin-top: ${Math.round(h * .04)}px; font-size: ${Math.round(h * .075)}px; color: #C4B0FF; letter-spacing: .08em; text-transform: uppercase; }
  small { display: block; margin-top: ${Math.round(h * .03)}px; font-size: ${Math.round(h * .062)}px; color: #b4a7cc; }
</style><img src="${icon}"><div><b>Lyra</b><span>The wallet you talk to</span><small>Non-custodial · real networks</small></div>`;
fs.writeFileSync(path.join(OUT, "promo-tile-440x280.png"), await compose(tile(440, 280), 440, 280));
fs.writeFileSync(path.join(OUT, "marquee-1400x560.png"), await compose(tile(1400, 560), 1400, 560));
console.log("wrote promo-tile-440x280.png and marquee-1400x560.png");

cdp.close(); chrome.kill();
await sleep(500);
fs.rmSync(profile, { recursive: true, force: true });
console.log("done:", OUT);
