import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Si un archivo que usa la app no está en la caché del service worker,
// la app se rompe sin internet. Este test avisa cuando alguien se olvida de sumarlo.
const sw = fs.readFileSync('sw.js', 'utf8');
const enCache = new Set([...sw.match(/const ARCHIVOS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]));

test('todos los archivos de js/ están en la caché', () => {
    const archivos = fs.readdirSync('js', { recursive: true }).filter(a => a.endsWith('.js')).map(a => 'js/' + a.replaceAll('\\', '/'));
    for (const archivo of archivos) assert.ok(enCache.has(archivo), `falta ${archivo} en sw.js`);
});

test('todo lo que carga index.html y el manifest está en la caché', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const usados = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map(m => m[1]);
    const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
    for (const archivo of [...usados, ...manifest.icons.map(i => i.src)]) {
        assert.ok(enCache.has(archivo), `falta ${archivo} en sw.js`);
    }
});

test('todo lo que está en la caché existe', () => {
    for (const archivo of enCache) {
        if (archivo !== './') assert.ok(fs.existsSync(archivo), `${archivo} no existe`);
    }
});

test('los beats grabados están en la caché y pesan menos de 1.5 MB', () => {
    for (const archivo of ['beats/boom-bap-bateria.mp3', 'beats/boom-bap-jazz.mp3', 'beats/trap-grave.mp3', 'beats/trap-seco.mp3']) {
        assert.ok(enCache.has(archivo), `falta ${archivo} en sw.js`);
        const peso = fs.statSync(archivo).size;
        assert.ok(peso > 1000 && peso < 1.5 * 1024 * 1024, `${archivo} pesa ${peso}`);
    }
});

test('la versión es un número con un decimal, como se ve en Ajustes', () => {
    assert.match(sw.match(/const VERSION = '([^']+)'/)[1], /^metrica-\d+\.\d+$/);
});
