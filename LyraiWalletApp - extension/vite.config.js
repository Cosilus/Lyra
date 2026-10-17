import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { build as esbuild } from "esbuild";

// Trezor Connect for MV3 extensions runs in the background service worker only:
// src/trezorWorker.js is bundled on its own to dist/trezorBackground.js, which
// public/background.js loads with importScripts.
const trezorWorker = () => ({
  name: "lyra-trezor-worker",
  apply: "build",
  async closeBundle() {
    await esbuild({
      entryPoints: [fileURLToPath(new URL("./src/trezorWorker.js", import.meta.url))],
      outfile: fileURLToPath(new URL("./dist/trezorBackground.js", import.meta.url)),
      bundle: true, format: "iife", platform: "browser", target: "chrome110", minify: true, legalComments: "none",
      define: { "process.env.NODE_ENV": "\"production\"", global: "globalThis" },
      logLevel: "warning",
    });
  },
});

// Browser-extension build: the wallet is the side panel page (index.html), and
// public/manifest.json + public/background.js are copied to dist/ as they are.
// `base: "./"` keeps every asset url relative, so it loads from chrome-extension://<id>/.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    // Buffer for @safe-global/protocol-kit, same as the web wallet.
    nodePolyfills({ include: ["buffer"] }),
    trezorWorker(),
  ],
  build: {
    outDir: "dist",
    // Two pages: the wallet (side panel / floating card) and the approval
    // window websites' requests open (see public/providerBackground.js).
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        request: fileURLToPath(new URL("./request.html", import.meta.url)),
      },
    },
    // Extension pages can't load remote code, and the store reviewers read the bundle:
    // keep it readable enough to audit, no inline scripts are produced either way.
    chunkSizeWarningLimit: 4000,
  },
});
