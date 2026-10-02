const CACHE_NAME = "salary-calendar-offline-v52";
const CACHE_PREFIX = "salary-calendar-offline-";
const FILES = [
  "./index.html",
  "./styles.css?v=pwa-sync-v47",
  "./workspace-ui.css?v=pwa-sync-v47",
  "./tax-table-2026.js?v=pwa-sync-v47",
  "./app.js?v=pwa-sync-v47",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  ...["settings", "chevron-left", "chevron-right", "calendar-days", "notebook-pen", "chart-no-axes-column", "chevron-down", "list", "plus", "clock", "copy"].map(name => `./icons/${name}.svg`)
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const scope = new URL("./", self.location.href);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const indexUrl = new URL("./index.html", scope).href;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(indexUrl, response.clone());
          return response;
        }
        return await cache.match(indexUrl) || response;
      } catch {
        return await cache.match(indexUrl) || Response.error();
      }
    })());
    return;
  }
  const allowed = FILES.some((path) => new URL(path, scope).href === url.href);
  if (!allowed) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
