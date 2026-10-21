import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerLink, moverSegundos, cambiarVolumen } from '../js/logica/musica.js';

test('links de YouTube en todas sus formas', () => {
    const esperado = { fuente: 'youtube', id: 'dQw4w9WgXcQ', inicio: 0 };
    for (const link of [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
        'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM',
        'https://youtube.com/shorts/dQw4w9WgXcQ',
        '  https://www.youtube.com/embed/dQw4w9WgXcQ  ',
    ]) assert.deepEqual(leerLink(link), esperado, link);
});

test('YouTube con minuto de inicio', () => {
    assert.equal(leerLink('https://youtu.be/dQw4w9WgXcQ?t=90').inicio, 90);
    assert.equal(leerLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s').inicio, 90);
});

test('links de SoundCloud', () => {
    assert.deepEqual(leerLink('https://soundcloud.com/artista/tema?si=abc&utm_source=x'), { fuente: 'soundcloud', url: 'https://soundcloud.com/artista/tema' });
    assert.deepEqual(leerLink('https://m.soundcloud.com/artista/tema'), { fuente: 'soundcloud', url: 'https://soundcloud.com/artista/tema' });
    assert.deepEqual(leerLink('https://on.soundcloud.com/AbC123'), { fuente: 'soundcloud', url: 'https://on.soundcloud.com/AbC123' });
});

test('lo que no es un link de música no sirve', () => {
    for (const texto of ['', 'hola', 'https://spotify.com/track/1', 'https://youtube.com/watch?v=corto', 'https://soundcloud.com/', 'javascript:alert(1)'])
        assert.equal(leerLink(texto), null, texto);
});

test('adelantar, atrasar y volumen no se pasan de los bordes', () => {
    assert.equal(moverSegundos(5, -10, 200), 0);
    assert.equal(moverSegundos(195, 10, 200), 200);
    assert.equal(moverSegundos(50, 10, 200), 60);
    assert.equal(moverSegundos(50, 10, 0), 60); // sin duración conocida
    assert.equal(cambiarVolumen(95, 10), 100);
    assert.equal(cambiarVolumen(5, -10), 0);
});
