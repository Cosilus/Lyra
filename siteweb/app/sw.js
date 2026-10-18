// Lyra web app service worker: keeps the app itself (its page, scripts,
// styles and images) on the device, so it opens at once and installs as an
// app. It never touches anything else: balances, prices, Lyra's answers and
// transactions always come live from the network (other origins are not
// even looked at). vite.app.config.js fills in the build stamp and the list.
const CACHE = "lyra-app-mve936qh";
const SHELL = ["./","./index.html","./manifest.webmanifest","./logo.svg","./favicon.svg","./icon-192.png","./icon-512.png","./assets/ApplicationChecker-BMs8nCHK.js","./assets/BufferGeometryUtils-DjsgMeey.js","./assets/ccip-Bc7_OQ70.js","./assets/DefaultTransportService-C4LH2DAR.js","./assets/events-DQ172AOg.js","./assets/Geist-Variable-B48wpBRb.woff2","./assets/GLTFLoader-OVlyQfqU.js","./assets/index--E7EwxBt.js","./assets/index-3FhdSujq.js","./assets/index-9Fbm8Bdf.js","./assets/index-B22Wk21B.js","./assets/index-BDib6qsB.js","./assets/index-BgqSfrVl.js","./assets/index-BPuBq5B7.css","./assets/index-BXqDd-Iz.js","./assets/index-CedSH-p0.js","./assets/index-DMgTKdUF.js","./assets/index-DQqZS6L_.js","./assets/index-NNyjBr7A.js","./assets/p256-mSyfOmUN.js","./assets/three.module-BT1pP-6r.js","./assets/TransportConnectedDevice-CwIxnHrz.js","./assets/___vite-browser-external_commonjs-proxy-DQqv_btw.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("lyra-app-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // the page: the newest one when online, the kept one offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // scripts, styles, images: hashed or static, the kept copy is right
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
