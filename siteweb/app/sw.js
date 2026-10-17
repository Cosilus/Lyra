// Lyra web app service worker: keeps the app itself (its page, scripts,
// styles and images) on the device, so it opens at once and installs as an
// app. It never touches anything else: balances, prices, Lyra's answers and
// transactions always come live from the network (other origins are not
// even looked at). vite.app.config.js fills in the build stamp and the list.
const CACHE = "lyra-app-mvc7gryq";
const SHELL = ["./","./index.html","./manifest.webmanifest","./logo.svg","./favicon.svg","./icon-192.png","./icon-512.png","./assets/ApplicationChecker-CrKlq3K4.js","./assets/BufferGeometryUtils-DjsgMeey.js","./assets/ccip-DOt7VprD.js","./assets/DefaultTransportService-CUkSKydl.js","./assets/GLTFLoader-OVlyQfqU.js","./assets/index-BV3xbf98.js","./assets/index-CSs8LwhS.js","./assets/index-CxHOemgW.js","./assets/index-DQXaDtb-.css","./assets/index-DuvW5YIV.js","./assets/index-HyMol-te.js","./assets/p256-BPRm3EZf.js","./assets/three.module-BT1pP-6r.js","./assets/TransportConnectedDevice-SPfyC7XN.js"];

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
