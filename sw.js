// Офлайн-оболочка: сайт открывается с экрана «Домой» мгновенно и без сети.
// Сервера нет — карта в localStorage, так что без сети работает всё.
const VERSION = "kom-v7";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/main.js",
  "js/anim.js",
  "js/card.js",
  "js/codec.js",
  "js/geometry.js",
  "js/marker.js",
  "js/pad.js",
  "js/store.js",
  "js/screens.js",
  "js/cardScreen.js",
  "js/backup.js",
  "js/keep.js",
  "assets/card_front_ink.png",
  "assets/card_front_white.png",
  "assets/card_back_strip.png",
  "assets/card_ring.png",
  "assets/card_logo.png",
  "assets/neucha.ttf",
  "icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Сначала сеть (свежая версия), без сети — кэш.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone(); // сразу: тело ответа читается один раз
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
  );
});
