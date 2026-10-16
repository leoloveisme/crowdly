/* Crowdly web app service worker: installable app + offline reading.
 *
 * - The app shell (index.html, hashed assets) is cached, so the app opens
 *   without a connection.
 * - Reads of stories, chapters, screenplays, comics, Space files, library
 *   books and uploads go to the network first and fall back to the last
 *   copy seen, so anything opened once can be read offline.
 * - Writes are never cached here; the app's own outbox (src/lib/offline.ts)
 *   queues them while offline.
 * - On logout the app asks us to drop the cached reads ("clear-api-cache").
 */
const VERSION = "v1";
const SHELL = `crowdly-shell-${VERSION}`;
const API = `crowdly-api-${VERSION}`;
const scope = new URL(self.registration.scope);

const READ_PATHS = [
  /^\/story-titles\/[^/]+$/,
  /^\/chapters$/,
  /^\/stories\/[^/]+\/branches$/,
  /^\/screenplays\/[^/]+(\/scenes)?$/,
  /^\/comics\/[^/]+$/,
  /^\/creative-spaces(\/[^/]+(\/items(\/[^/]+(\/content)?)?|\/content-items)?)?$/,
  /^\/library\/items(\/[^/]+\/(file|cover))?$/,
  /^\/reading\/positions\/[^/]+$/,
  /^\/discover\/home$/,
  /^\/shelves(\/[^/]+\/items)?$/,
  /^\/users\/[^/]+\/(stories|screenplays|comics)$/,
  /^\/uploads\//,
  /^\/auth\/me$/,
  /^\/interface-translations$/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll([scope.href, `${scope.href}manifest.webmanifest`, `${scope.href}icon-192.png`, `${scope.href}favicon.png`])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("crowdly-") && ![SHELL, API].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-api-cache") event.waitUntil(caches.delete(API));
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate" && url.href.startsWith(scope.href)) {
    // SPA: any page inside the app is index.html.
    event.respondWith(fetch(req).catch(async () => (await caches.open(SHELL)).match(scope.href)));
    return;
  }
  if (url.origin === scope.origin && url.pathname.startsWith(`${scope.pathname}assets/`)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (READ_PATHS.some((re) => re.test(url.pathname))) {
    event.respondWith(networkFirst(req, API));
  }
});
