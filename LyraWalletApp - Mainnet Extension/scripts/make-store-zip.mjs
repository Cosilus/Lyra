// Builds the zip you upload to the Chrome Web Store / Edge Add-ons:
//   1. reads VITE_API_URL from .env (the public MAINNET backend, https://...)
//   2. refuses to continue if it still points at localhost
//   3. rebuilds dist/ with that URL baked in
//   4. narrows manifest.json host_permissions to the hosts the extension really calls
//   5. runs the static checks and writes lyra-extension-mainnet-<version>.zip next to package.json (needs Python on the PATH)
//
//   npm run store
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

const env = fs.existsSync(path.join(root, ".env")) ? fs.readFileSync(path.join(root, ".env"), "utf8") : "";
const api = (env.match(/^VITE_API_URL=(.+)$/m) || [])[1]?.trim();
if (!api || !/^https:\/\//.test(api) || /localhost|127\.0\.0\.1/.test(api)) {
  console.error("\nVITE_API_URL in .env must be the public https:// address of the MAINNET backend (not localhost).\n  Deploy LyraiWalletApp - 2D.3D (render.yaml) first, then e.g. VITE_API_URL=https://<your-service>.onrender.com\n");
  process.exit(1);
}
const apiOrigin = new URL(api).origin;

run("npm run build");

// Everything the extension calls from the browser (RPCs, Circle kits, Safe). The backend does the rest.
// Custom RPCs from .env (VITE_ETH_RPC_URL...) replace the public ones.
const envOrigin = (name) => {
  const v = (env.match(new RegExp("^" + name + "=(.+)$", "m")) || [])[1]?.trim();
  try { return v ? new URL(v).origin : null; } catch { return null; }
};
const hosts = [...new Set([
  apiOrigin,
  // the native coin price when Lyra's server can't be reached
  "https://api.coingecko.com",
  "https://rpc.plasma.to",
  envOrigin("VITE_ETH_RPC_URL") || "https://ethereum-rpc.publicnode.com",
  envOrigin("VITE_BASE_RPC_URL") || "https://mainnet.base.org",
  envOrigin("VITE_POLYGON_RPC_URL") || "https://polygon.drpc.org",
  "https://rpc.mainnet.arc.io",
  "https://rpc.hyperliquid.xyz",
  // gathering funds from other chains (consolidation)
  "https://arb1.arbitrum.io",
  "https://mainnet.optimism.io",
  "https://bsc-dataseed.binance.org",
  "https://api.avax.network",
  // swaps (KyberSwap), predictions (Polymarket), Circle kits and Gateway, Safe multisig
  "https://aggregator-api.kyberswap.com",
  "https://clob.polymarket.com",
  "https://*.circle.com",
  "https://api.safe.global",
])].map((h) => h + "/*");

const mPath = path.join(root, "dist", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(mPath, "utf8"));
manifest.host_permissions = hosts;
fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2));
console.log("\nhost_permissions narrowed to:\n  " + hosts.join("\n  "));

run("npm run check");

const zip = path.join(root, `lyra-extension-mainnet-${manifest.version}.zip`);
if (fs.existsSync(zip)) fs.rmSync(zip);
// Python's zipfile, not PowerShell's Compress-Archive: that one writes backslashes in the entry names
// ("assets\x.js"), which the Chrome Web Store can reject. Needs Python on the PATH.
run(`python scripts/zip-dir.py "${path.join(root, "dist")}" "${zip}"`);
console.log("\nReady to upload: " + zip);
