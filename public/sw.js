const CACHE_NAME = "amar-doctor-v1-offline";
const OFFLINE_URLS = [
  "/",
  "/symptoms",
  // Pre-cached on install so the offline symptom checker is available from the
  // first app load, not only after the user has happened to visit it online.
  "/symptoms/finder",
  "/chat",
  "/prescription",
  // The medicine catalogue, hub network and flight maths are all module-level
  // literals, so the whole compose flow works with no network once this route
  // and its chunk are cached.
  "/drone",
  "/map",
  "/camps/new",
  "/emergency",
  "/manifest.json",
  "/favicon.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch((err) => {
        console.warn("Service worker cache add error (can happen during dev build):", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // API responses are served cache-first below, which is wrong for live data:
  // the medical camp list would keep showing yesterday's camps (and miss ones
  // posted since). Let these go straight to the network.
  if (new URL(event.request.url).pathname.startsWith("/api/")) return;

  // Full-page navigations (the HTML document itself) must be network-first.
  // Cache-first here serves a stale page shell whose text/markup can lag the
  // JS chunks the browser just fetched fresh, which throws a hydration
  // mismatch on any content change (e.g. a relabeled nav link) and, for real
  // visitors, means a deploy never becomes visible until the cache happens to
  // be evicted. The cache is still updated and still used as the offline
  // fallback, just no longer preferred while online.
  const isNavigation =
    event.request.mode === "navigate" || event.request.destination === "document";

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (JS/CSS/images/fonts) are content-hashed by Next.js, so a
  // cached copy can never be stale relative to a given URL — cache-first here
  // is both correct and what keeps the app fast offline.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
