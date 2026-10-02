import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // @safe-global/protocol-kit and @safe-global/api-kit (used for the
    // multisig feature) pull in Node-oriented dependencies (Buffer,
    // stream, node-fetch's http/https/zlib/url internals) that Vite
    // doesn't polyfill for the browser by default, only this one
    // (Buffer) is actually reached at runtime, the rest just needed to
    // resolve at build time.
    nodePolyfills({ include: ["buffer"] }),
  ],
});
