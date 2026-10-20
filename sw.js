// Service worker: guarda todo en caché para que la app ande sin internet.
// Cambiá VERSION cada vez que cambien los archivos para que se actualicen.
const VERSION = 'metrica-v1';
const ARCHIVOS = [
    './',
    'index.html',
    'estilos.css',
    'manifest.webmanifest',
    'palabras.js',
    'palabras-simples.js',
    'js/app.js',
    'js/logica/diccionario.js',
    'js/logica/generador.js',
    'js/logica/rimas.js',
    'js/logica/silabas.js',
    'js/logica/sesiones.js',
    'js/logica/freestyle.js',
    'iconos/icono.svg',
    'iconos/icono-180.png',
    'iconos/icono-192.png',
    'iconos/icono-512.png',
];

self.addEventListener('install', evento => {
    evento.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
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
