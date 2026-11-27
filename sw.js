const VERSION = "notenapp-v4";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];
const RUNTIME_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  const network = fetch(event.request)
    .then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => cached || Response.error());
  event.waitUntil(network);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, STATIC_CACHE));
  } else if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
  }
  // Alles andere (Supabase-API) geht direkt ins Netz, nie in den Cache.
});