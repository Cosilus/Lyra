// Lyra web app service worker: keeps the app itself (its page, scripts,
// styles and images) on the device, so it opens at once and installs as an
// app. It never touches anything else: balances, prices, Lyra's answers and
// transactions always come live from the network (other origins are not
// even looked at). vite.app.config.js fills in the build stamp and the list.
const CACHE = "lyra-app-mv6p3wsx";
const SHELL = ["./","./index.html","./manifest.webmanifest","./logo.svg","./favicon.svg","./assets/ApplicationChecker-BZCOihU_.js","./assets/BufferGeometryUtils-DjsgMeey.js","./assets/ccip-CqJi7nSL.js","./assets/DefaultTransportService-CaVlchRU.js","./assets/GLTFLoader-OVlyQfqU.js","./assets/index-B6nYdENz.js","./assets/index-BAzxpTrf.js","./assets/index-C8DnhBGA.js","./assets/index-ClF2Se8K.css","./assets/index-DqKRGWfd.js","./assets/index-DTAHrmph.js","./assets/p256-CO1YXyrY.js","./assets/three.module-BT1pP-6r.js","./assets/TransportConnectedDevice-B3ehiuvk.js"];

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
