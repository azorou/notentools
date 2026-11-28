const VERSION = "notenapp-v6";
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

// Eigene Dateien: immer erst Netz (frisch, auch am GitHub-Pages-Cache vorbei), offline aus dem Cache.
// So passen index.html, app.js und styles.css nach einem Update immer zusammen.
async function networkFirst(event) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const res = await fetch(event.request, { cache: "no-cache" });
    if (res && res.ok) cache.put(event.request, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(event.request)) || (await caches.match(event.request)) || Response.error();
  }
}

// Fremde Bibliotheken/Schriften: schnell aus dem Cache, im Hintergrund aktualisieren.
async function staleWhileRevalidate(event) {
  const cache = await caches.open(RUNTIME_CACHE);
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
    event.respondWith(fetch(req, { cache: "no-cache" }).catch(() => caches.match("./index.html")));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(event));
  } else if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event));
  }
  // Alles andere (Supabase-API) geht direkt ins Netz, nie in den Cache.
});
