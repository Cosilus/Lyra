// Makes the images the Chrome Web Store asks for, from the real extension:
//   5 screenshots 1280x800 (the side panel inside a browser-looking window), a 440x280 small promo
//   tile and a 1400x560 marquee.
//
// How: starts a headless Chrome, opens the built extension (served by `npm run serve:ext` on :5195),
// creates a throwaway wallet, asks Lyra for a plan of three steps, opens the 3D menus and the 2D
// menu, then draws each panel capture into a 1280x800 "browser window" and screenshots that.
//
// A fresh wallet holds nothing, and a plan with an empty wallet only shows "not enough funds". For the
// pictures only, the page sees demo balances (1250 XPL, 250 USDT0) and a demo simulation result:
// the Plasma RPC answers for the balance reads and /api/simulate/plan are replaced inside this
// headless page. Nothing is signed or sent; Lyra's answer and the plan come from the live backend.
//
//   npm run build && npm run serve:ext      (in another terminal)
//   node scripts/make-store-assets.mjs "<output folder>"
//
// Needs Chrome (set CHROME to its path if it is not in the default place) and the live backend
// (VITE_API_URL) for Lyra's answers.
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
const REQUEST = "swap 1 XPL to USDT0, stake 20 USDT0 and send 2 XPL to Alice";

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
const until = async (expr, maxMs, label) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { if (await ev(expr)) return true; await sleep(250); }
  console.warn("  (gave up waiting for " + label + ")");
  return false;
};

// ------------------------------------------------------------ demo balances, for the pictures only
const DEMO = `(() => {
  if (window.__lyraDemo) return; window.__lyraDemo = true;
  if (!localStorage.getItem("plasma_contacts_v1")) localStorage.setItem("plasma_contacts_v1", JSON.stringify([{ name: "Alice", address: "0x8ba1f109551bD432803012645Ac136ddd64DBA72" }]));
  const realFetch = window.fetch.bind(window);
  const USDT0 = "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb";
  const NATIVE = "0x" + (1250n * 10n ** 18n).toString(16);
  const TOKEN = "0x" + (250n * 10n ** 6n).toString(16).padStart(64, "0");
  const json = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
  const fake = (m) => {
    if (m.method === "eth_getBalance") return NATIVE;
    const call = m.method === "eth_call" ? m.params?.[0] : null;
    if (call && String(call.to || "").toLowerCase() === USDT0 && String(call.data || call.input || "").startsWith("0x70a08231")) return TOKEN;
    return undefined;
  };
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/api/simulate/plan")) {
      return json({ available: true, reverted: false, fee: "0.00004", feeSymbol: "XPL", changes: [
        { symbol: "XPL", amount: "3", direction: "out" },
        { symbol: "USDT0", amount: "19.9176", direction: "out" },
        { symbol: "aPlaUSDT0", amount: "20", direction: "in" },
      ] });
    }
    if (url.startsWith("https://rpc.plasma.to") && init.body) {
      let body;
      try { body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body)); } catch { return realFetch(input, init); }
      const list = Array.isArray(body) ? body : [body];
      const answers = new Map(); const rest = [];
      for (const m of list) { const v = fake(m); if (v !== undefined) answers.set(m.id, { jsonrpc: "2.0", id: m.id, result: v }); else rest.push(m); }
      if (!answers.size) return realFetch(input, init);
      let restRes = [];
      if (rest.length) { const r = await realFetch(url, { ...init, body: JSON.stringify(rest) }); const j = await r.json(); restRes = Array.isArray(j) ? j : [j]; }
      const out = list.map((m) => answers.get(m.id) || restRes.find((x) => x.id === m.id));
      return json(Array.isArray(body) ? out : out[0]);
    }
    return realFetch(input, init);
  };
})();`;
await cdp.send("Page.enable");
await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: DEMO });

const PAGE_HELPERS = `
  window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__set = (el, v) => { const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
  window.__btn = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
  window.__any = (t) => [...document.querySelectorAll("button, [role=button], div, span")].find((b) => b.children.length === 0 && b.textContent.trim() === t);
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
      const el = __any(${JSON.stringify(mode === "3d" ? "Choose 3D" : "Choose 2D")});
      el && el.click(); await __sleep(2500);
    }
    const skip = __btn("Skip tour"); if (skip) { skip.click(); await __sleep(900); }
    1 })()`);
}
async function createWalletIfNeeded(mode) {
  const state = await ev(`(async () => { await __sleep(1200);
    if (!localStorage.getItem("plasma_wallet_v2")) return "create";
    return document.querySelector("input[type=password]") ? "unlock" : "ready"; })()`);
  if (state === "create") {
    await ev(`(async () => {
      const start = __any("Get started"); if (start) { start.click(); await __sleep(900); }
      __btn("Create wallet").click(); await __sleep(900);
      const pw = document.querySelectorAll("input[type=password]"); __set(pw[0], "${PASSWORD}"); __set(pw[1], "${PASSWORD}"); await __sleep(300);
      __btn("Secure the wallet").click(); await __sleep(5000); 1 })()`);
  } else if (state === "unlock") {
    await ev(`(async () => { const pw = document.querySelector("input[type=password]"); pw.focus(); __set(pw, "${PASSWORD}"); 1 })()`);
    await press("Enter", "Enter"); await sleep(4000);
  }
  await dismissExtras(mode);
  // the balances are read
  await until(`document.body.innerText.includes("1,250") || document.body.innerText.includes("1250")`, 15000, "the demo balance");
  await sleep(1200);
}
async function ask(text) {
  await ev(`(async () => { const i = document.querySelector("textarea.ask-input"); i.focus(); __set(i, ${JSON.stringify(text)}); 1 })()`);
  await press("Enter", "Enter");
}

console.log("3D view: wallet created");
await openApp("3d");
await createWalletIfNeeded("3d");
await ev(`__move(0, 0); 1`);

console.log("3/ 3D view, side menu open");
await ev(`__move(0.92, 0); 1`); await sleep(1600);
panel.menu3d = await shot();

console.log("4/ 3D view, assets menu open");
await ev(`__move(0, 0); 1`); await sleep(900);
await ev(`__move(0, -0.97); 1`); await sleep(1600);
panel.assets3d = await shot();
await ev(`__move(0, 0); 1`); await sleep(800);

console.log("1-2/ 3D view: the plan coming together, then the recap");
await ev(`__move(0, 0); 1`); await sleep(800);
await ask(REQUEST);
// the scene: at least two step boxes in, stars faded in
await until(`document.querySelectorAll(".ps3d-step").length > 0 && [...document.querySelectorAll(".ps3d-step")].filter(e => +getComputedStyle(e).opacity > 0.5).length >= 2`, 90000, "two steps in the 3D scene");
await sleep(700);
panel.scene = await shot();
// the recap: the scene has handed over and the hold button is there
await until(`!document.querySelector(".plan-sheet.scene-playing") && !!document.querySelector(".plan-confirm")`, 90000, "the plan recap");
await sleep(2500);
panel.plan = await shot();
await ev(`(async () => { const c = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Cancel"); c && c.click(); await __sleep(1200); 1 })()`);

console.log("5/ 2D view with the menu");
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
  ["01-plan", panel.plan, "Say it in one sentence.<br>Lyra makes the plan.", "Swap, stake and send at once: every step with its real amounts, simulated before you confirm."],
  ["02-plan-3d", panel.scene, "Watch your plan<br>come together.", "Each step is prepared live and checked off as Lyra gets it ready."],
  ["03-3d-menu", panel.menu3d, "Move your mouse.<br>The wallet moves with you.", "An immersive 3D view: the actions open on the side as you reach the edge."],
  ["04-assets", panel.assets3d, "Your assets,<br>at a glance.", "Reach the top edge to see what you hold on Plasma, Ethereum, Base, Polygon, Arc and Hyperliquid."],
  ["05-2d-menu", panel.menu2d, "Prefer it flat?<br>Switch to the classic view.", "The same wallet, the same Lyra: choose 2D or 3D any time, even by asking."],
];
for (const [name, img, h, s] of shots) {
  if (!img) { console.warn("skipped " + name); continue; }
  fs.writeFileSync(path.join(OUT, "screenshots", name + ".png"), await compose(frame(b64(img), h, s), 1280, 800));
  console.log("wrote screenshots/" + name + ".png");
}

const tile = (w, h) => `<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; } body { width: ${w}px; height: ${h}px; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; color: #F3EBFF;
  background: radial-gradient(${w}px ${h}px at 22% 30%, #3a2a66 0%, #150e26 55%, #0D0916 100%); display: flex; align-items: center; justify-content: center; gap: ${Math.round(h * .07)}px; padding: 0 ${Math.round(h * .08)}px; }
  img { width: ${Math.round(h * .42)}px; height: ${Math.round(h * .42)}px; border-radius: ${Math.round(h * .08)}px; }
  b { display: block; font-size: ${Math.round(h * .24)}px; line-height: 1; letter-spacing: -.01em; }
  span { display: block; margin-top: ${Math.round(h * .04)}px; font-size: ${Math.round(h * .058)}px; color: #C4B0FF; letter-spacing: .06em; text-transform: uppercase; }
  small { display: block; margin-top: ${Math.round(h * .03)}px; font-size: ${Math.round(h * .056)}px; color: #b4a7cc; }
</style><img src="${icon}"><div><b>Lyra</b><span>The wallet you talk to</span><small>Non-custodial · real networks</small></div>`;
fs.writeFileSync(path.join(OUT, "promo-tile-440x280.png"), await compose(tile(440, 280), 440, 280));
fs.writeFileSync(path.join(OUT, "marquee-1400x560.png"), await compose(tile(1400, 560), 1400, 560));
console.log("wrote promo-tile-440x280.png and marquee-1400x560.png");

cdp.close(); chrome.kill();
await sleep(500);
fs.rmSync(profile, { recursive: true, force: true });
console.log("done:", OUT);
