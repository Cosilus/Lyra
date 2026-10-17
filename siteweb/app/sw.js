// Lyra web app service worker: keeps the app itself (its page, scripts,
// styles and images) on the device, so it opens at once and installs as an
// app. It never touches anything else: balances, prices, Lyra's answers and
// transactions always come live from the network (other origins are not
// even looked at). vite.app.config.js fills in the build stamp and the list.
const CACHE = "lyra-app-mvcf89ck";
const SHELL = ["./","./index.html","./manifest.webmanifest","./logo.svg","./favicon.svg","./icon-192.png","./icon-512.png","./assets/ApplicationChecker-SrPAxD7a.js","./assets/BufferGeometryUtils-DjsgMeey.js","./assets/ccip-C89Jk6LU.js","./assets/DefaultTransportService-C1siYPqt.js","./assets/events-DQ172AOg.js","./assets/GLTFLoader-OVlyQfqU.js","./assets/index--E7EwxBt.js","./assets/index-BA197Lw_.js","./assets/index-BRLjwJcR.js","./assets/index-B_L17tm1.js","./assets/index-CcuM1zOt.js","./assets/index-CedSH-p0.js","./assets/index-CXWqoN6k.js","./assets/index-Dp1jEyM9.js","./assets/index-DWLSm-hy.js","./assets/index-DZHrrQPQ.js","./assets/index-XRKVaYJi.css","./assets/index-_05ZugBE.js","./assets/p256-Jy_b2-To.js","./assets/three.module-BT1pP-6r.js","./assets/TransportConnectedDevice-DTaQ1llB.js","./assets/___vite-browser-external_commonjs-proxy-CTOBrkpL.js"];

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
