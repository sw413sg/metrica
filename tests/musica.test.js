import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerLink, moverSegundos, cambiarVolumen, formatoTiempo, fraccionDe, segundosEn, LADO_YOUTUBE, muestraVideo, plegarVideo, alternarReproduccion, pausarAlOcultar, urlWidgetSoundCloud } from '../js/logica/musica.js';

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

test('YouTube se muestra y SoundCloud no', () => {
    assert.equal(LADO_YOUTUBE, 200);
    assert.equal(muestraVideo('youtube'), true);
    assert.equal(muestraVideo('soundcloud'), false);
});

test('plegar un video que suena pide pausar', () => {
    assert.deepEqual(plegarVideo(true), { plegado: true, pausar: true });
    assert.deepEqual(plegarVideo(false), { plegado: true, pausar: false });
});

test('el tiempo de la barra se lee en minutos', () => {
    assert.equal(formatoTiempo(0), '0:00');
    assert.equal(formatoTiempo(72), '1:12');
    assert.equal(formatoTiempo(175), '2:55');
    assert.equal(formatoTiempo(225.9), '3:45');
    assert.equal(formatoTiempo(-4), '0:00');
    assert.equal(formatoTiempo(3661), '1:01:01');
});

test('un toque en la pista cae en los segundos del tema', () => {
    assert.equal(fraccionDe(48, 175), 48 / 175);
    assert.equal(fraccionDe(10, 0), 0);
    assert.equal(fraccionDe(-1, 100), 0);
    assert.equal(fraccionDe(150, 100), 1);
    assert.equal(segundosEn(50, 100, 200), 100);
    assert.equal(segundosEn(-10, 100, 200), 0);
    assert.equal(segundosEn(150, 100, 200), 200);
    assert.equal(segundosEn(10, 0, 200), 0);
});

test('YouTube se pausa si la tarjeta no se ve; SoundCloud sigue con el teclado', () => {
    assert.equal(pausarAlOcultar({ fuente: 'youtube', sonando: true, editor: true, teclado: true }), true);
    assert.equal(pausarAlOcultar({ fuente: 'youtube', sonando: true, editor: false, teclado: false }), true);
    assert.equal(pausarAlOcultar({ fuente: 'youtube', sonando: false, editor: true, teclado: true }), false);
    assert.equal(pausarAlOcultar({ fuente: 'youtube', sonando: true, editor: true, teclado: false }), false);
    assert.equal(pausarAlOcultar({ fuente: 'soundcloud', sonando: true, editor: true, teclado: true }), false);
    assert.equal(pausarAlOcultar({ fuente: 'soundcloud', sonando: true, editor: false, teclado: false }), true);
});

test('mostrar el video de YouTube plegado primero lo muestra', () => {
    assert.deepEqual(
        alternarReproduccion({ fuente: 'youtube', plegado: true, sonando: false }),
        { plegado: false, accion: 'reproducir' },
    );
    assert.deepEqual(
        alternarReproduccion({ fuente: 'youtube', plegado: false, sonando: true }),
        { plegado: false, accion: 'pausar' },
    );
    assert.deepEqual(
        alternarReproduccion({ fuente: 'soundcloud', plegado: true, sonando: false }),
        { plegado: true, accion: 'reproducir' },
    );
});

test('el widget de SoundCloud no pide la ficha visual', () => {
    const url = new URL(urlWidgetSoundCloud('https://soundcloud.com/artista/tema'));
    assert.equal(`${url.origin}${url.pathname}`, 'https://w.soundcloud.com/player/');
    assert.equal(url.searchParams.get('url'), 'https://soundcloud.com/artista/tema');
    assert.equal(url.searchParams.get('visual'), 'false');
    assert.equal(url.searchParams.get('auto_play'), 'true');
    assert.equal(url.searchParams.get('show_artwork'), 'false');
});

test('adelantar, atrasar y volumen no se pasan de los bordes', () => {
    assert.equal(moverSegundos(5, -10, 200), 0);
    assert.equal(moverSegundos(195, 10, 200), 200);
    assert.equal(moverSegundos(50, 10, 200), 60);
    assert.equal(moverSegundos(50, 10, 0), 60); // sin duración conocida
    assert.equal(cambiarVolumen(95, 10), 100);
    assert.equal(cambiarVolumen(5, -10), 0);
});
