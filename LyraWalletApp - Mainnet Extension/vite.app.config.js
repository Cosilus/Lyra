import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Web-app build (PWA) for phones and tablets: the same wallet as the extension,
// installable from the browser ("Add to Home Screen"), in dist-app/.
//   npm run build:app
// Mode "app" turns on src/platform.js's IS_APP. Every url stays relative
// (base "./"), so dist-app/ can be served from any folder, e.g. the site's /app/.
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "dist-app");

// public/ also holds the extension's own files; the web app has no use for them
const EXTENSION_ONLY = ["manifest.json", "background.js", "contentBridge.js", "inpage.js", "overlay.js", "providerBackground.js", "mic.html", "mic.js"];

function lyraApp() {
  return {
    name: "lyra-app",
    transformIndexHtml(html) {
      return html
        .replace('<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
          '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />')
        .replace('<meta name="theme-color" content="#080D0B" />', [
          '<meta name="theme-color" content="#0B0814" />',
          '<meta name="description" content="Lyra, the AI crypto wallet: say what you want, Lyra handles the chain." />',
          '<link rel="manifest" href="./manifest.webmanifest" />',
          '<link rel="icon" href="./favicon.svg" type="image/svg+xml" />',
          '<link rel="apple-touch-icon" href="./apple-touch-icon.png" />',
          '<meta name="mobile-web-app-capable" content="yes" />',
          '<meta name="apple-mobile-web-app-capable" content="yes" />',
          '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
          '<meta name="apple-mobile-web-app-title" content="Lyra" />',
        ].join("\n    "))
        .replace("<title>Lyra - ICW</title>", "<title>Lyra</title>")
        .replace('<html lang="fr">', '<html lang="en">');
    },
    closeBundle() {
      for (const f of EXTENSION_ONLY) fs.rmSync(path.join(outDir, f), { force: true });
      fs.copyFileSync(path.join(here, "app", "manifest.webmanifest"), path.join(outDir, "manifest.webmanifest"));
      fs.copyFileSync(path.join(here, "app", "apple-touch-icon.png"), path.join(outDir, "apple-touch-icon.png"));
      // the service worker, stamped with this build so a new version replaces the old cache
      const assets = fs.readdirSync(path.join(outDir, "assets")).map(f => `./assets/${f}`);
      const sw = fs.readFileSync(path.join(here, "app", "sw.js"), "utf8")
        .replace("__BUILD__", Date.now().toString(36))
        .replace("__SHELL__", JSON.stringify(["./", "./index.html", "./manifest.webmanifest", "./logo.svg", "./favicon.svg", ...assets]));
      fs.writeFileSync(path.join(outDir, "sw.js"), sw);
    },
  };
}

export default defineConfig({
  base: "./",
  mode: "app",
  plugins: [react(), nodePolyfills({ include: ["buffer"] }), lyraApp()],
  build: {
    outDir,
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
