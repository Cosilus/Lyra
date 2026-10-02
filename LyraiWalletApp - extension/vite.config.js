import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Browser-extension build: the wallet is the side panel page (index.html), and
// public/manifest.json + public/background.js are copied to dist/ as they are.
// `base: "./"` keeps every asset url relative, so it loads from chrome-extension://<id>/.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    // Buffer for @safe-global/protocol-kit, same as the web wallet.
    nodePolyfills({ include: ["buffer"] }),
  ],
  build: {
    outDir: "dist",
    // Extension pages can't load remote code, and the store reviewers read the bundle:
    // keep it readable enough to audit, no inline scripts are produced either way.
    chunkSizeWarningLimit: 4000,
  },
});
