const CACHE_NAME = 'gastos-pwa-v1';
const ASSETS = ['./', './index.html', './app.js', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  // No cachear peticiones a Supabase para tener siempre datos frescos
  if (e.request.url.includes('supabase.co')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});