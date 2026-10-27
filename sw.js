// Service worker: permite instalar o app e abrir sem internet.
// Sempre que publicar uma nova versão, aumente o número abaixo.
const CACHE = 'nossos-gastos-v4';
const ARQUIVOS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const CDNS = ['cdnjs.cloudflare.com', 'www.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Arquivos do próprio app: tenta a rede (pega atualizações) e usa o cache se estiver offline
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copia));
          return resp;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Bibliotecas (gráficos e Firebase): usa o cache primeiro
  if (CDNS.includes(url.hostname)) {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
        return resp;
      }))
    );
  }
});
