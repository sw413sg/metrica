// Service worker: guarda todo en caché para que la app ande sin internet.
// Cambiá VERSION cada vez que cambien los archivos, sumando 0.1: así el teléfono baja la versión
// nueva la próxima vez que abra la app con internet (y la app se recarga sola).
// El número es el que se ve en Ajustes > Versión.
const VERSION = 'metrica-4.6';
const ARCHIVOS = [
    './',
    'index.html',
    'estilos.css',
    'manifest.webmanifest',
    'palabras.js',
    'palabras-simples.js',
    'frecuencias.js',
    'sinonimos.js',
    'js/app.js',
    'js/beats.js',
    'js/efectos.js',
    'js/logica/diccionario.js',
    'js/logica/generador.js',
    'js/logica/rimas.js',
    'js/logica/silabas.js',
    'js/logica/sesiones.js',
    'js/logica/freestyle.js',
    'js/logica/compra.js',
    'js/logica/secciones.js',
    'js/logica/ortografia.js',
    'js/logica/libreta.js',
    'js/logica/sinonimos.js',
    'js/logica/apariencia.js',
    'js/logica/musica.js',
    'js/logica/ambiente.js',
    'js/logica/recientes.js',
    'iconos/icono.svg',
    'iconos/icono-180.png',
    'iconos/icono-192.png',
    'iconos/icono-512.png',
    'beats/boom-bap-bateria.mp3',
    'beats/boom-bap-jazz.mp3',
    'beats/trap-grave.mp3',
    'beats/trap-seco.mp3',
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
    // Solo lo de la app: los reproductores de música (YouTube, SoundCloud) van directo a internet.
    if (evento.request.method !== 'GET' || new URL(evento.request.url).origin !== location.origin) return;
    evento.respondWith(caches.match(evento.request).then(guardado => guardado || fetch(evento.request)));
});
