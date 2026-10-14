// Lyra web app service worker: keeps the app itself (its page, scripts,
// styles and images) on the device, so it opens at once and installs as an
// app. It never touches anything else: balances, prices, Lyra's answers and
// transactions always come live from the network (other origins are not
// even looked at). vite.app.config.js fills in the build stamp and the list.
const CACHE = "lyra-app-mv8322dp";
const SHELL = ["./","./index.html","./manifest.webmanifest","./logo.svg","./favicon.svg","./icon-192.png","./icon-512.png","./assets/ApplicationChecker-D11n7A0x.js","./assets/BufferGeometryUtils-DjsgMeey.js","./assets/ccip-BTtRptv4.js","./assets/DefaultTransportService-Rvled9Gj.js","./assets/GLTFLoader-OVlyQfqU.js","./assets/index-B8F1L3NY.js","./assets/index-BFYYDDYA.js","./assets/index-CJ7ey0w8.css","./assets/index-CjwXpFzj.js","./assets/index-Dp5xwjul.js","./assets/index-ON86VS-l.js","./assets/p256-64kLLszX.js","./assets/three.module-BT1pP-6r.js","./assets/TransportConnectedDevice-BLEhXK_k.js"];

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
