// Service worker: guarda todo en caché para que la app ande sin internet.
// Cambiá VERSION cada vez que cambien los archivos: así el teléfono baja la versión
// nueva la próxima vez que abra la app con internet (y la app se recarga sola).
const VERSION = 'metrica-v13';
const ARCHIVOS = [
    './',
    'index.html',
    'estilos.css',
    'manifest.webmanifest',
    'palabras.js',
    'palabras-simples.js',
    'frecuencias.js',
    'js/app.js',
    'js/beats.js',
    'js/logica/diccionario.js',
    'js/logica/generador.js',
    'js/logica/rimas.js',
    'js/logica/silabas.js',
    'js/logica/sesiones.js',
    'js/logica/freestyle.js',
    'js/logica/compra.js',
    'iconos/icono.svg',
    'iconos/icono-180.png',
    'iconos/icono-192.png',
    'iconos/icono-512.png',
];

self.addEventListener('install', evento => {
    // cache: 'reload' saltea la caché del navegador, para no guardar archivos viejos.
    const pedidos = ARCHIVOS.map(archivo => new Request(archivo, { cache: 'reload' }));
    evento.waitUntil(caches.open(VERSION).then(cache => cache.addAll(pedidos)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => {
    evento.waitUntil(caches.keys()
        .then(claves => Promise.all(claves.filter(c => c !== VERSION).map(c => caches.delete(c))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', evento => {
    if (evento.request.method !== 'GET') return;
    evento.respondWith(caches.match(evento.request).then(guardado => guardado || fetch(evento.request)));
});
