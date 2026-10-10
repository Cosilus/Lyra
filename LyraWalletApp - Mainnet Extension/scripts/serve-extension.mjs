// Serves dist/ the way Chrome serves an extension page: with the same Content-Security-Policy as
// manifest.json ("script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"). Open it in any browser to
// see CSP errors (eval, inline scripts, remote scripts) BEFORE loading the extension for real.
//
//   npm run build && npm run serve:ext      ->  http://localhost:5195
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const csp = manifest.content_security_policy?.extension_pages || "script-src 'self'; object-src 'self'";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".wasm": "application/wasm", ".map": "application/json" };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // /_panel?w=400 shows the wallet inside a frame of that width, like Chrome's side panel
  // (resizable by the user, roughly 320 to 700px wide). Handy to judge the 3D layout at each width.
  if (p === "/_panel") {
    const w = Math.min(1200, Math.max(280, Number(new URL(req.url, "http://x").searchParams.get("w")) || 400));
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(`<!doctype html><meta charset="utf-8"><title>Lyra side panel ${w}px</title>
<body style="margin:0;background:#2b2b2f;display:flex;justify-content:flex-end;height:100vh">
<iframe src="/index.html" style="width:${w}px;height:100vh;border:0;border-left:1px solid #555;background:#000"></iframe></body>`);
  }
  if (p === "/") p = "/index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "content-security-policy": csp });
  fs.createReadStream(file).pipe(res);
}).listen(5195, () => console.log("Extension preview with the real CSP: http://localhost:5195\nCSP:", csp));
