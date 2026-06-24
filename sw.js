/* VEYON service worker — app-shell caching + offline support.
   Caches the single-page app and the Firebase CDN modules so core practice works offline.
   Firestore/Auth network calls pass through to the SDK, which handles offline persistence. */
const CACHE = 'veyon-v1';
const SHELL = ['veyon.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Firebase SDK modules (CORS-enabled): cache-first so the app boots offline.
  const isFirebaseLib = url.host === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') >= 0;
  if (isFirebaseLib) {
    e.respondWith(
      caches.match(req).then(m => m || fetch(req).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {});
        return r;
      }).catch(() => m))
    );
    return;
  }

  // Other cross-origin (Firestore/Auth/Fonts data): let the network/SDK handle it.
  if (url.origin !== self.location.origin) return;

  // App navigations: network-first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {});
        return r;
      }).catch(() => caches.match(req).then(m => m || caches.match('veyon.html')))
    );
    return;
  }

  // Same-origin assets: cache-first with background update.
  e.respondWith(
    caches.match(req).then(m => m || fetch(req).then(r => {
      if (r && r.status === 200) {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {});
      }
      return r;
    }).catch(() => m))
  );
});
