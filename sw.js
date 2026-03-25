/**
 * MHNET VENDAS — SERVICE WORKER V200
 * PWA instalável com cache inteligente
 */
const CACHE = 'mhnet-v200';
const BYPASS = ['script.google.com','generativelanguage.googleapis.com','nominatim.openstreetmap.org','callmebot.com'];
const PRECACHE = ['./', './index.html', './app.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.startsWith('chrome-extension') || BYPASS.some(b => url.includes(b))) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.ok && e.request.method === 'GET') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => null);
      if (cached) { network; return cached; }
      return network.then(res => res || new Response(
        '{"status":"error","message":"offline"}',
        { headers: { 'Content-Type': 'application/json' } }
      ));
    })
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
