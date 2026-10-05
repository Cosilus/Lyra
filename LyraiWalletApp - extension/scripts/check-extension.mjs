// Static checks on dist/ before loading the extension in Chrome:
//  - manifest.json is valid MV3 and every file it names exists
//  - index.html has no inline script (MV3 forbids them)
//  - the JS bundle has no eval / new Function / remote <script> loading
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
let failed = 0;
const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { failed++; console.log("  FAIL " + m); };

const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
manifest.manifest_version === 3 ? ok("manifest_version 3") : bad("manifest_version must be 3");
const named = [manifest.side_panel?.default_path, manifest.background?.service_worker, "overlay.js", "request.html", "providerBackground.js", ...(manifest.content_scripts || []).flatMap((c) => c.js), ...(manifest.web_accessible_resources || []).flatMap((r) => r.resources).filter((f) => !f.includes("*")), ...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {})].filter(Boolean);
for (const f of named) fs.existsSync(path.join(dist, f)) ? ok("file exists: " + f) : bad("missing file: " + f);

for (const page of [manifest.side_panel.default_path, "request.html"]) {
  const html = fs.readFileSync(path.join(dist, page), "utf8");
  const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/\bsrc=/.test(m[1]) && m[2].trim());
  inline.length === 0 ? ok("no inline script in " + page) : bad(inline.length + " inline script(s) in " + page);
  /<script[^>]+src=["']https?:/.test(html) ? bad("remote script in " + page) : ok("no remote script in " + page);
}

const assets = path.join(dist, "assets");
const js = fs.readdirSync(assets).filter((f) => f.endsWith(".js"));
let size = 0, hits = [];
for (const f of js) {
  const text = fs.readFileSync(path.join(assets, f), "utf8");
  size += text.length;
  for (const [name, re] of [["eval(", /\beval\s*\(/g], ["new Function(", /new\s+Function\s*\(/g], ["importScripts(http", /importScripts\(\s*["']https?:/g]]) {
    const n = (text.match(re) || []).length;
    if (n) hits.push(`${f}: ${name} x${n}`);
  }
}
console.log(`  info ${js.length} js files, ${(size / 1e6).toFixed(1)} MB`);
if (hits.length) {
  console.log("  WARN code that Chrome's extension CSP blocks (it only fails if it actually runs):");
  hits.forEach((h) => console.log("       " + h));
} else ok("no eval / new Function in the bundle");

console.log(failed ? `\n${failed} check(s) failed` : "\nAll static checks passed");
process.exit(failed ? 1 : 0);
