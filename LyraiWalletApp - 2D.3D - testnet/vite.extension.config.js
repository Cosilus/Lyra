import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Mainnet browser extension, built from this same app (no copy of the code):
//   npm run build:ext   ->  dist-extension/  (load it in chrome://extensions, "Load unpacked")
// The wallet page is index.html (side panel, and the approval window for websites).
// extension/ holds what only the extension has: manifest, background service worker,
// and the two scripts that give websites a provider (inpage.js + content.js).
const extensionDir = path.resolve("extension");

function copyExtensionFiles() {
  return {
    name: "lyra-copy-extension-files",
    closeBundle() {
      const out = path.resolve("dist-extension");
      fs.cpSync(extensionDir, out, { recursive: true });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), nodePolyfills({ include: ["buffer"] }), copyExtensionFiles()],
  build: {
    outDir: "dist-extension",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
