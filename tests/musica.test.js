import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerLink, moverSegundos, cambiarVolumen, formatoTiempo, fraccionDe, segundosEn, imantar, LADO_YOUTUBE, muestraVideo, plegarVideo, alternarReproduccion, pausarAlOcultar, tarjetaGrande, portadaSoundCloud, urlWidgetSoundCloud, resolverLinkSoundCloud, esLista } from '../js/logica/musica.js';

test('links de YouTube en todas sus formas', () => {
    const esperado = { fuente: 'youtube', id: 'dQw4w9WgXcQ', lista: null, inicio: 0 };
    for (const link of [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
        'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM',
        'https://youtube.com/shorts/dQw4w9WgXcQ',
        '  https://www.youtube.com/embed/dQw4w9WgXcQ  ',
    ]) assert.deepEqual(leerLink(link), esperado, link);
});

test('playlists de YouTube y sets de SoundCloud: las flechas cambian de canción', () => {
    const lista = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';
    assert.deepEqual(leerLink(`https://www.youtube.com/playlist?list=${lista}`), { fuente: 'youtube', id: null, lista, inicio: 0 });
    assert.deepEqual(leerLink(`https://youtube.com/watch?v=dQw4w9WgXcQ&list=${lista}&index=3`), { fuente: 'youtube', id: 'dQw4w9WgXcQ', lista, inicio: 0 });
    assert.equal(leerLink('https://www.youtube.com/playlist?list=corta'), null);
    assert.equal(esLista(leerLink(`https://www.youtube.com/playlist?list=${lista}`)), true);
    assert.equal(esLista(leerLink('https://youtu.be/dQw4w9WgXcQ')), false);
    assert.equal(esLista(leerLink('https://soundcloud.com/artista/sets/beats-2024')), true);
    assert.equal(esLista(leerLink('https://soundcloud.com/artista/tema')), false);
});

test('YouTube con minuto de inicio', () => {
    assert.equal(leerLink('https://youtu.be/dQw4w9WgXcQ?t=90').inicio, 90);
    assert.equal(leerLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s').inicio, 90);
});

test('links de SoundCloud', () => {
    assert.deepEqual(leerLink('https://soundcloud.com/artista/tema?si=abc&utm_source=x'), { fuente: 'soundcloud', url: 'https://soundcloud.com/artista/tema' });
    assert.deepEqual(leerLink('https://soundcloud.com/swa13sg/tenchnosad_88bpm-f-ambkr?ref=clipboard&p=i&c=1&si=3F1AE1E53E9D468E99ECFEE926575E8D&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing'), { fuente: 'soundcloud', url: 'https://soundcloud.com/swa13sg/tenchnosad_88bpm-f-ambkr' });
    assert.deepEqual(leerLink('https://m.soundcloud.com/artista/tema'), { fuente: 'soundcloud', url: 'https://soundcloud.com/artista/tema' });
    assert.deepEqual(leerLink('https://m.soundcloud.com/swa13sg/tenchnosad_88bpm-f-ambkr?si=abc'), { fuente: 'soundcloud', url: 'https://soundcloud.com/swa13sg/tenchnosad_88bpm-f-ambkr' });
    assert.deepEqual(leerLink('https://on.soundcloud.com/AbC123'), { fuente: 'soundcloud', url: 'https://on.soundcloud.com/AbC123' });
    assert.deepEqual(leerLink('https://on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ'), { fuente: 'soundcloud', url: 'https://on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ' });
    assert.deepEqual(leerLink('https://www.on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ?si=abc&utm_source=clipboard'), { fuente: 'soundcloud', url: 'https://on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ' });
});

test('el link corto de la app se resuelve por oEmbed', async () => {
    const pedidos = [];
    const pedir = async (url) => {
        pedidos.push(url);
        return {
            ok: true,
            async json() {
                return {
                    title: 'TenchnoSad_88bpm-F# ambkr by swa',
                    html: '<iframe width="100%" height="400" scrolling="no" frameborder="no" src="https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F2416843668&amp;show_artwork=true"></iframe>',
                };
            },
        };
    };
    const corto = 'https://on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ';
    assert.equal(await resolverLinkSoundCloud(corto, pedir), 'https://api.soundcloud.com/tracks/2416843668');
    assert.equal(pedidos.length, 1);
    const pedido = new URL(pedidos[0]);
    assert.equal(`${pedido.origin}${pedido.pathname}`, 'https://soundcloud.com/oembed');
    assert.equal(pedido.searchParams.get('format'), 'json');
    assert.equal(pedido.searchParams.get('url'), corto);
});

test('un link largo, con ?si= o de m.soundcloud.com no pide oEmbed', async () => {
    let pedidos = 0;
    const pedir = async () => { pedidos++; throw new Error('no tenía que pedir'); };
    const largo = leerLink('https://soundcloud.com/swa13sg/tenchnosad_88bpm-f-ambkr?si=3F1AE1E53E9D468E99ECFEE926575E8D&utm_source=clipboard');
    const movil = leerLink('https://m.soundcloud.com/forss/flickermood?si=abc&utm_medium=text');
    assert.equal(await resolverLinkSoundCloud(largo.url, pedir), 'https://soundcloud.com/swa13sg/tenchnosad_88bpm-f-ambkr');
    assert.equal(await resolverLinkSoundCloud(movil.url, pedir), 'https://soundcloud.com/forss/flickermood');
    assert.equal(pedidos, 0);
});

test('oEmbed sin una canción de SoundCloud no deja pasar otra url', async () => {
    const pedir = async () => ({
        ok: true,
        async json() { return { html: '<iframe src="https://evil.example/player?url=https%3A%2F%2Fevil.example%2Fx"></iframe>' }; },
    });
    await assert.rejects(() => resolverLinkSoundCloud('https://on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ', pedir));
    const caido = async () => ({ ok: false, async json() { return {}; } });
    await assert.rejects(() => resolverLinkSoundCloud('https://on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ', caido));
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

test('SoundCloud va en grande solo en Freestyle, y plegado va chico', () => {
    assert.equal(tarjetaGrande({ fuente: 'youtube', plegado: false, fueraDelEditor: false }), true);
    assert.equal(tarjetaGrande({ fuente: 'youtube', plegado: true, fueraDelEditor: true }), false);
    assert.equal(tarjetaGrande({ fuente: 'soundcloud', plegado: false, fueraDelEditor: true }), true);
    assert.equal(tarjetaGrande({ fuente: 'soundcloud', plegado: false, fueraDelEditor: false }), true);
    assert.equal(tarjetaGrande({ fuente: 'archivo', plegado: false }), true);
    assert.equal(tarjetaGrande({ fuente: 'archivo', plegado: true }), false);
    assert.equal(tarjetaGrande({ fuente: 'soundcloud', plegado: true, freestyle: true }), false);
});

test('la portada de SoundCloud se pide en 500×500, o la foto del artista', () => {
    assert.equal(portadaSoundCloud({ artwork_url: 'https://i1.sndcdn.com/artworks-abc-large.jpg' }), 'https://i1.sndcdn.com/artworks-abc-t500x500.jpg');
    assert.equal(portadaSoundCloud({ artwork_url: null, user: { avatar_url: 'https://i1.sndcdn.com/avatars-x-large.jpg' } }), 'https://i1.sndcdn.com/avatars-x-t500x500.jpg');
    assert.equal(portadaSoundCloud({}), null);
    assert.equal(portadaSoundCloud(null), null);
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

test('escondida (Ajustes o teclado), YouTube se pausa y lo demás sigue sonando', () => {
    assert.equal(pausarAlOcultar({ fuente: 'youtube', sonando: true, visible: false }), true);
    assert.equal(pausarAlOcultar({ fuente: 'youtube', sonando: true, visible: true }), false);
    assert.equal(pausarAlOcultar({ fuente: 'youtube', sonando: false, visible: false }), false);
    assert.equal(pausarAlOcultar({ fuente: 'soundcloud', sonando: true, visible: false }), false);
    assert.equal(pausarAlOcultar({ fuente: 'archivo', sonando: true, visible: false }), false);
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
    assert.equal(url.searchParams.get('auto_play'), 'false');
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

test('la marca de la barra imanta lo que cae cerca', () => {
    // Tema de 200 s en una pista de 200 px: 1 px = 1 s.
    assert.equal(imantar(95, 100, 200, 200), 100);
    assert.equal(imantar(116, 100, 200, 200), 100);
    assert.equal(imantar(117, 100, 200, 200), 117);
    assert.equal(imantar(50, null, 200, 200), 50);
    assert.equal(imantar(50, 40, 0, 200), 50);
});
