// Lyra web app service worker: keeps the app itself (its page, scripts,
// styles and images) on the device, so it opens at once and installs as an
// app. It never touches anything else: balances, prices, Lyra's answers and
// transactions always come live from the network (other origins are not
// even looked at). vite.app.config.js fills in the build stamp and the list.
const CACHE = "lyra-app-mvcam3ao";
const SHELL = ["./","./index.html","./manifest.webmanifest","./logo.svg","./favicon.svg","./icon-192.png","./icon-512.png","./assets/ApplicationChecker-D45DS4LQ.js","./assets/BufferGeometryUtils-DjsgMeey.js","./assets/ccip-7OrrJJcN.js","./assets/DefaultTransportService-Di7MIuR8.js","./assets/events-DQ172AOg.js","./assets/GLTFLoader-OVlyQfqU.js","./assets/index--E7EwxBt.js","./assets/index-B9GKZJFx.css","./assets/index-BVbqL9UX.js","./assets/index-C9ldFw4V.js","./assets/index-CedSH-p0.js","./assets/index-CRSP-RLZ.js","./assets/index-CSYERH1Z.js","./assets/index-CUIIEsb3.js","./assets/index-D84yXz30.js","./assets/index-DC7YpfXA.js","./assets/index-IJlQQefv.js","./assets/index-xcSdVC1B.js","./assets/p256-CwcgCKlq.js","./assets/three.module-BT1pP-6r.js","./assets/TransportConnectedDevice-DE_2b2YD.js","./assets/___vite-browser-external_commonjs-proxy-CgQBAYU-.js"];

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
