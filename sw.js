// Service Worker: macht die App offline nutzbar.
// Strategie "Netz zuerst": Online gibt es immer die neuesten Inhalte, offline den Cache.
// Bei Änderungen an der App die Versionsnummer erhöhen.
const CACHE = 'lernen-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/views/home.js',
  './js/views/subject.js',
  './js/views/flashcards.js',
  './js/views/quiz.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './data/index.json',
];

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  // Alle Fach-Dateien gleich mit ablegen, damit sie auch offline da sind.
  try {
    const res = await fetch('./data/index.json', { cache: 'no-cache' });
    const index = await res.json();
    const files = Array.isArray(index) ? index : (index.subjects || index.faecher || []);
    await cache.addAll(files.map((f) => `./data/${f}`));
  } catch {
    /* nicht kritisch */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req), timeout(5000)]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
