const CACHE_NAME = 'aura-shell-v1';
const APP_ROOT = new URL('./', self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(APP_ROOT);
    if (!response.ok) throw new Error(`Não foi possível instalar o AURA offline: HTTP ${response.status}`);
    const html = await response.text();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(APP_ROOT, new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }));
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|webmanifest|svg)(?:\?[^"]*)?)"/g)]
      .map((match) => new URL(match[1], APP_ROOT))
      .filter((url) => url.origin === self.location.origin)
      .map((url) => url.href);
    await cache.addAll([
      ...assets,
      new URL('icons/aura-180.png', APP_ROOT),
      new URL('icons/aura-192.png', APP_ROOT),
      new URL('icons/aura-512.png', APP_ROOT),
      new URL('icons/aura.svg', APP_ROOT),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('aura-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put(APP_ROOT, response.clone());
        return response;
      } catch {
        const cached = await caches.match(APP_ROOT);
        if (cached) return cached;
        throw new Error('AURA ainda não foi carregado neste dispositivo.');
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && url.pathname.includes('/assets/')) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
