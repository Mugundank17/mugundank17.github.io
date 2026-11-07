/*
 * Countdown service worker — makes the site installable and usable offline.
 *
 * Site files and data: network first, so every update you publish shows up the
 * next time the app is opened online; the last copy is kept for offline use.
 * Posters and artwork: served from cache when available (they never change).
 */
const SITE = "countdown-site-v4";
const IMAGES = "countdown-images-v1";
const MAX_IMAGES = 400;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SITE).then((c) => c.addAll(["./", "index.html", "style.css", "app.js", "tickets.js", "providers/release.js", "providers/anilist.js", "providers/tvmaze.js", "providers/musicbrainz.js", "movies.js", "icons/icon-192.png"]).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![SITE, IMAGES].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trimImages() {
  const c = await caches.open(IMAGES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_IMAGES; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // TMDB posters / backdrops / photos: cache first.
  if ((url.hostname === "image.tmdb.org" && !url.pathname.includes("/original/")) || url.hostname === "s4.anilist.co" || url.hostname === "static.tvmaze.com" || url.hostname === "coverartarchive.org" || url.hostname.endsWith(".archive.org")) {
    e.respondWith((async () => {
      const c = await caches.open(IMAGES);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") { c.put(req, res.clone()); trimImages(); }
        return res;
      } catch (_) { return hit || Response.error(); }
    })());
    return;
  }

  // Our own files: network first, fall back to the saved copy when offline.
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(SITE);
      try {
        const res = await fetch(req, { cache: "no-cache" });
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch (_) {
        return (await c.match(req, { ignoreSearch: true })) ||
          (req.mode === "navigate" ? await c.match("index.html") : Response.error());
      }
    })());
  }
});
