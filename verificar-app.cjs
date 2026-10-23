// Prueba la app en un navegador a ancho de iPhone (390x844), claro y oscuro.
// Uso: node verificar-app.cjs  (necesita playwright instalado)
const {chromium} = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const tipos = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.md': 'text/plain', '.mp3': 'audio/mpeg'};
// Para simular que se publicó una versión nueva, se le agrega esto al final de sw.js.
let versionNueva = '';
const servidor = http.createServer((req, res) => {
    const archivo = path.join(__dirname, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(archivo, (err, datos) => {
        if (err) { res.writeHead(404); return res.end(); }
        if (archivo.endsWith('sw.js')) datos = datos + versionNueva;
        res.writeHead(200, {'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream'});
        res.end(datos);
    });
});

(async () => {
    await new Promise(r => servidor.listen(0, r));
    const url = `http://localhost:${servidor.address().port}/`;
    const browser = await chromium.launch();
    for (const tema of ['light', 'dark']) {
        const page = await browser.newPage({viewport: {width: 390, height: 844}, colorScheme: tema, hasTouch: true, isMobile: true});
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('console', m => m.type() === 'error' && errores.push(m.text()));
        await page.goto(url);
        await page.evaluate(() => navigator.serviceWorker.ready);
        // Las sílabas por verso arrancan apagadas; acá se prenden para verificar el conteo.
        assert.equal(await page.locator('#mostrar-silabas').isChecked(), false);
        await page.evaluate(() => localStorage.setItem('metrica.alternar-silabas', 'true'));
        await page.reload();

        assert.equal(await page.locator('#pantalla-letras').isVisible(), true);
        assert.equal(await page.locator('#letras-vacio').isVisible(), true);
        await page.screenshot({path: `capturas/letras-${tema}.png`});

        await page.locator('#nueva-letra').click();
        assert.equal(await page.locator('#vista-editor').isVisible(), true);
        assert.equal(await page.locator('#barra-pestanas').isVisible(), false);
        await page.locator('#editor-titulo').fill('Sacred Geometry');
        // Lo que va entre paréntesis no rima: riman "fin" y "seguir", no "(al)".
        await page.locator('#editor-texto').fill('Llegamos al fin (al)\nno pude seguir');
        assert.deepEqual(await page.locator('#editor-fondo mark').evaluateAll(ms => ms.map(m => m.className + ':' + m.textContent)),
            ['rima-0 suave:fin', 'rima-0 suave:guir']);
        assert.equal(await page.locator('#editor-fondo').textContent(), 'Llegamos al fin (al)\nno pude seguir');
        // Un verso entero entre paréntesis sí rima: "cuánto" y "pensando" con "dejarnos".
        await page.locator('#editor-texto').fill('(hace cuánto estás pensando en dejarnos)');
        assert.deepEqual(await page.locator('#editor-fondo mark').evaluateAll(ms => ms.map(m => m.textContent)), ['cuánto', 'sando', 'jarnos']);
        // Multisilábicas: "no hay ca-MI-no" / "se hace ca-MI-no" riman desde "ca", y "al an-DAR" / "vista a-TRÁS" desde "al".
        await page.locator('#editor-texto').fill('Caminante, no hay camino,\nse hace camino al andar.\nAl andar se hace camino\ny al volver la vista atrás');
        assert.deepEqual(await page.locator('#silabas div').allTextContents(), ['8', '8', '8', '8']);
        assert.deepEqual(await page.locator('#editor-fondo mark').evaluateAll(ms => ms.map(m => m.className + ':' + m.textContent)),
            ['rima-0:camino', 'rima-1 suave:al', 'rima-1 suave:andar', 'rima-1 suave:dar', 'rima-0:camino', 'rima-1 suave:ta', 'rima-1 suave:atrás']);
        // Mientras se escribe no hay sugerencias: aparecen solo al tocar una palabra.
        assert.equal(await page.locator('#sugerencias').isVisible(), false);
        await page.locator('#editor-texto').evaluate(t => { t.value += '\ndetrás'; t.dispatchEvent(new Event('input')); });
        assert.match(await page.locator('#editor-texto').inputValue(), /atrás\ndetrás$/);
        assert.equal(await page.locator('#editor-fondo mark').count(), 8);
        // Con «detrás», «atrás» pasa a rimar consonante (fondo lleno); «andar» sigue asonante (suave).
        assert.deepEqual(await page.locator('#editor-fondo mark').evaluateAll(ms => ms.map(m => m.className)),
            ['rima-0', 'rima-1 suave', 'rima-1 suave', 'rima-1 suave', 'rima-0', 'rima-1', 'rima-1', 'rima-1']);
        const fondoRima = selector => page.locator(`#editor-fondo ${selector}`).first().evaluate(m => getComputedStyle(m).backgroundColor);
        assert.notEqual(await fondoRima('mark.rima-1.suave'), await fondoRima('mark.rima-1:not(.suave)'));
        await page.locator('#alternar-colores').click();
        assert.equal(await page.locator('#editor-fondo mark').count(), 0);
        await page.locator('#alternar-colores').click();
        // Tocar una palabra muestra rimas para cambiarla, también en el medio del verso.
        const original = await page.locator('#editor-texto').inputValue();
        await page.locator('#editor-texto').evaluate(t => {
            t.focus();
            t.setSelectionRange(t.value.indexOf('andar') + 2, t.value.indexOf('andar') + 2);
            t.dispatchEvent(new MouseEvent('click'));
        });
        assert.equal(await page.locator('.sugerencias-etiqueta').textContent(), 'Cambiar «andar»:');
        const otra = await page.locator('.sugerencia').first().textContent();
        await page.locator('.sugerencia').first().click();
        assert.ok((await page.locator('#editor-texto').inputValue()).includes(`se hace camino al ${otra}.`));
        await page.screenshot({path: `capturas/editor-cambiar-${tema}.png`});
        await page.locator('#editor-texto').evaluate(t => {
            t.setSelectionRange(t.value.indexOf('Caminante') + 3, t.value.indexOf('Caminante') + 3);
            t.dispatchEvent(new MouseEvent('click'));
        });
        assert.equal(await page.locator('.sugerencias-etiqueta').textContent(), 'Cambiar «Caminante»:');
        const otra2 = await page.locator('.sugerencia').first().textContent();
        await page.locator('.sugerencia').first().click();
        assert.ok((await page.locator('#editor-texto').inputValue()).startsWith(`${otra2[0].toUpperCase() + otra2.slice(1)}, no hay`));
        // Tocar «Cambiar» muestra sinónimos en vez de rimas, y tocar uno cambia la palabra.
        await page.locator('#editor-texto').evaluate(t => {
            t.setSelectionRange(t.value.indexOf('camino') + 2, t.value.indexOf('camino') + 2);
            t.dispatchEvent(new MouseEvent('click'));
        });
        assert.equal(await page.locator('.sugerencias-etiqueta').textContent(), 'Cambiar «camino»:');
        await page.locator('.sugerencias-alternar').click();
        assert.equal(await page.locator('.sugerencias-etiqueta').textContent(), 'Sinónimos «camino»:');
        const sinonimos = await page.locator('.sugerencia').allTextContents();
        assert.ok(sinonimos.includes('senda'), sinonimos.join(', '));
        await page.screenshot({path: `capturas/editor-sinonimos-${tema}.png`});
        await page.locator('.sugerencias-alternar').click();
        assert.equal(await page.locator('.sugerencias-etiqueta').textContent(), 'Cambiar «camino»:');
        await page.locator('.sugerencias-alternar').click();
        await page.locator('.sugerencia', {hasText: /^senda$/}).click();
        assert.ok((await page.locator('#editor-texto').inputValue()).includes('no hay senda,'));
        // Una palabra sin tilde no se marca, pero rima y cuenta como si tuviera la tilde.
        await page.locator('#editor-texto').evaluate(t => { t.value += '\nte busco desde el balcon'; t.dispatchEvent(new Event('input')); });
        assert.equal(await page.locator('#editor-fondo mark.error').count(), 0);
        assert.equal((await page.locator('#silabas div').allTextContents()).at(-1), '8'); // balcón es aguda
        await page.locator('#editor-texto').evaluate(t => {
            t.setSelectionRange(t.value.length - 3, t.value.length - 3);
            t.dispatchEvent(new MouseEvent('click'));
        });
        assert.equal(await page.locator('.sugerencias-etiqueta').textContent(), 'Cambiar «balcon»:');
        assert.ok((await page.locator('.sugerencia').allTextContents()).includes('corazón'));
        await page.locator('#editor-texto').evaluate((t, v) => { t.value = v; t.dispatchEvent(new Event('input')); }, original);
        // Un verso largo se parte en dos renglones: su número de sílabas queda a su altura
        // y el siguiente verso arranca al lado de su número.
        await page.locator('#editor-texto').evaluate(t => { t.value += '\nY te hice un tema cada día por si quieres recordar lo nuestro\ny te hago un tema'; t.dispatchEvent(new Event('input')); });
        const filas = await page.locator('#silabas div').evaluateAll(fs => fs.slice(-2).map(f => Math.round(f.getBoundingClientRect().top)));
        const versos = await page.locator('#editor-fondo > span').evaluateAll(vs => vs.slice(-2).map(v => Math.round(v.getClientRects()[0].top)));
        assert.ok(filas.every((f, i) => Math.abs(f - versos[i]) <= 2), `${filas} vs ${versos}`);
        assert.ok(versos[1] - versos[0] >= 40, 'el verso largo ocupa dos renglones');
        await page.screenshot({path: `capturas/editor-verso-largo-${tema}.png`});
        await page.locator('#editor-texto').evaluate((t, v) => { t.value = v; t.dispatchEvent(new Event('input')); }, original);
        // Tocar un renglón vacío ofrece marcar la parte de la letra.
        await page.locator('#editor-texto').evaluate(t => {
            t.value += '\n\nverso nuevo';
            t.dispatchEvent(new Event('input'));
            const vacio = t.value.indexOf('\n\n') + 1;
            t.setSelectionRange(vacio, vacio);
            t.dispatchEvent(new MouseEvent('click'));
        });
        assert.equal(await page.locator('.sugerencias-etiqueta').textContent(), 'Marcar:');
        assert.deepEqual(await page.locator('.sugerencia').allTextContents(), ['Intro', 'Estribillo', 'Hook', 'Verso', 'Final']);
        // Si se desliza la letra o se cierra el teclado, la barra se va.
        const tocarVacio = () => page.locator('#editor-texto').evaluate(t => {
            t.focus();
            const vacio = t.value.indexOf('\n\n') + 1;
            t.setSelectionRange(vacio, vacio);
            t.dispatchEvent(new MouseEvent('click'));
        });
        await page.locator('.editor').dispatchEvent('wheel');
        assert.equal(await page.locator('#sugerencias').isVisible(), false, 'deslizar la saca');
        await tocarVacio();
        await page.locator('#editor-texto').evaluate(t => t.blur());
        assert.equal(await page.locator('#sugerencias').isVisible(), false, 'cerrar el teclado la saca');
        await tocarVacio();
        assert.equal(await page.locator('#sugerencias').isVisible(), true);
        // Deslizar poco deja el teclado; deslizar bastante lo cierra.
        const deslizar = dy => page.locator('.editor').evaluate((e, dy) => {
            const toque = y => new Touch({identifier: 1, target: e, clientY: y});
            e.dispatchEvent(new TouchEvent('touchstart', {touches: [toque(400)]}));
            e.dispatchEvent(new TouchEvent('touchmove', {touches: [toque(400 - dy)]}));
        }, dy);
        await deslizar(60);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'editor-texto', 'poco no cierra el teclado');
        await deslizar(200);
        assert.notEqual(await page.evaluate(() => document.activeElement.id), 'editor-texto', 'bastante cierra el teclado');
        await tocarVacio();
        await page.locator('.sugerencia', {hasText: 'Estribillo'}).click();
        assert.match(await page.locator('#editor-texto').inputValue(), /detrás\n\n\[Estribillo\]\nverso nuevo$/);
        assert.equal(await page.locator('#editor-fondo mark.seccion').textContent(), '[Estribillo]');
        assert.deepEqual((await page.locator('#silabas div').allTextContents()).slice(-2), ['', '4']);
        await page.screenshot({path: `capturas/editor-seccion-${tema}.png`});
        await page.locator('#editor-texto').evaluate((t, v) => { t.value = v; t.dispatchEvent(new Event('input')); }, original);
        // Los renglones llegan hasta abajo aunque la letra sea larga.
        await page.locator('#editor-texto').evaluate(t => { t.value += '\nverso'.repeat(40); t.dispatchEvent(new Event('input')); });
        assert.ok(await page.evaluate(() => document.querySelector('.editor-capas').offsetHeight >= document.querySelector('#editor-texto').offsetHeight));
        // Al bajar, el título se va con el texto y arriba quedan solo los botones.
        await page.locator('.editor').evaluate(e => { e.scrollTop = 400; });
        assert.ok((await page.locator('#editor-titulo').boundingBox()).y < 0, 'el título se escondió');
        assert.ok((await page.locator('#abrir-ajustes-libreta').boundingBox()).y >= 0, 'los botones siguen a la vista');
        await page.screenshot({path: `capturas/editor-bajando-${tema}.png`});
        await page.locator('.editor').evaluate(e => { e.scrollTop = 0; });
        await page.locator('#editor-texto').evaluate((t, v) => { t.value = v; t.dispatchEvent(new Event('input')); }, original);
        await page.screenshot({path: `capturas/editor-${tema}.png`});
        // Con el teclado abierto (se ven 500 px), la barra de sugerencias queda pegada arriba.
        await page.locator('#editor-texto').evaluate(t => {
            t.setSelectionRange(t.value.indexOf('andar') + 2, t.value.indexOf('andar') + 2);
            t.dispatchEvent(new MouseEvent('click'));
        });
        await page.evaluate(() => {
            document.documentElement.style.setProperty('--alto-visible', '500px');
            document.body.classList.add('teclado-abierto');
        });
        const barra = await page.locator('#sugerencias').boundingBox();
        assert.equal(Math.round(barra.y + barra.height), 500);
        await page.screenshot({path: `capturas/editor-teclado-${tema}.png`});
        await page.evaluate(() => {
            document.documentElement.style.setProperty('--alto-visible', innerHeight + 'px');
            document.body.classList.remove('teclado-abierto');
        });
        // Música: la nota abre la hoja para pegar un link; un link que no sirve avisa.
        await page.locator('#abrir-musica').click();
        assert.equal(await page.locator('#hoja-musica').isVisible(), true);
        // Solo el cajón de vidrio: sin fondo oscuro, sin hoja opaca, título ni cruz.
        assert.equal(await page.locator('#hoja-musica').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)');
        assert.equal(await page.locator('#hoja-musica .hoja').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)');
        assert.equal(await page.locator('#hoja-musica h2, #cerrar-musica').count(), 0);
        assert.match(await page.locator('#fs-cajon').evaluate(e => getComputedStyle(e).backdropFilter), /blur/);
        await page.waitForTimeout(400); // la hoja sube con una animación
        const cajonHoja = await page.locator('#fs-cajon').boundingBox();
        assert.equal(Math.round(cajonHoja.x), 16, JSON.stringify(cajonHoja));
        assert.ok(Math.abs(cajonHoja.y + cajonHoja.height - 836) <= 2, JSON.stringify(cajonHoja));
        await page.screenshot({path: `capturas/libreta-cajon-musica-${tema}.png`});
        await page.locator('#fs-link').fill('https://spotify.com/track/1');
        await page.locator('#fs-pegar').click();
        assert.match(await page.locator('#fs-link-aviso').textContent(), /no es de YouTube ni de SoundCloud/);
        // Con un link de YouTube aparece el banner (acá con un YouTube de mentira, sin internet).
        await page.route('https://www.youtube.com/iframe_api', ruta => ruta.fulfill({contentType: 'text/javascript', body: `
            window.YT = { PlayerState: { PLAYING: 1 }, Player: function (lugar, o) {
                const p = window.__yt = this; p.t = 30; p.vol = 0; p.pausado = true;
                p.setVolume = v => { p.vol = v; };
                p.playVideo = () => { p.pausado = false; o.events.onStateChange({ data: 1 }); };
                p.pauseVideo = () => { p.pausado = true; o.events.onStateChange({ data: 2 }); };
                p.getVideoData = () => ({ title: 'Tema de prueba' });
                p.getCurrentTime = () => p.t; p.getDuration = () => 200; p.seekTo = s => { p.t = s; };
                p.destroy = () => { window.__ytCerrado = true; };
                setTimeout(() => o.events.onReady({ target: p }));
            } };
            setTimeout(() => onYouTubeIframeAPIReady());`}));
        await page.locator('#fs-link').fill('https://youtu.be/dQw4w9WgXcQ');
        await page.locator('#fs-pegar').click();
        assert.equal(await page.locator('#hoja-musica').isVisible(), false);
        await page.locator('#reproductor-titulo', {hasText: 'Tema de prueba'}).waitFor();
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'Pausar');
        assert.equal(await page.evaluate(() => window.__yt.vol), 70);
        assert.equal((await page.locator('#reproductor-fuente').textContent()).trim(), 'YouTube');
        assert.equal(
            await page.locator('#musica-play').evaluate(e => getComputedStyle(e).backgroundColor),
            await page.locator('#reproductor-titulo').evaluate(e => getComputedStyle(e).color),
        );
        // Un video suelto no tiene a qué canción pasar: las flechas quedan apagadas.
        assert.equal(await page.locator('#musica-siguiente').getAttribute('aria-disabled'), 'true');
        assert.equal(await page.locator('#musica-anterior').getAttribute('aria-disabled'), 'true');
        // La barra: soltar en la mitad del tema deja el tiempo en 100 s.
        const pista = await page.locator('#musica-pista').boundingBox();
        await page.mouse.move(pista.x + pista.width / 2, pista.y + pista.height / 2);
        await page.mouse.down();
        assert.equal(await page.locator('#reproductor').evaluate(e => e.classList.contains('arrastrando')), true);
        assert.equal(Math.round(parseFloat(await page.locator('#musica-pista .reproductor-riel').evaluate(e => getComputedStyle(e).height))), 8);
        assert.equal(Math.round(parseFloat(await page.locator('.reproductor-punto').evaluate(e => getComputedStyle(e).width))), 22);
        assert.ok(Number(await page.locator('#musica-tiempo').evaluate(e => getComputedStyle(e).fontWeight)) >= 700);
        await page.mouse.up();
        assert.ok(Math.abs(await page.evaluate(() => window.__yt.t) - 100) < 2);
        assert.equal((await page.locator('#musica-tiempo').textContent()).trim(), '1:40');
        assert.equal(Math.round(parseFloat(await page.locator('#musica-pista .reproductor-riel').evaluate(e => getComputedStyle(e).height))), 4);
        // La tarjeta queda abajo, con 16 px a los costados y 8 px del borde. El video mide 200×200, radio 14, sin nada encima.
        const banner = await page.locator('#reproductor').boundingBox();
        assert.equal(Math.round(banner.x), 16, JSON.stringify(banner));
        assert.equal(Math.round(banner.width), 358, JSON.stringify(banner));
        assert.ok(Math.abs(banner.height - 252) <= 2, JSON.stringify(banner));
        assert.ok(Math.abs(banner.y + banner.height - 836) <= 2, JSON.stringify(banner));
        const marco = await page.locator('#reproductor-marco').boundingBox();
        assert.equal(Math.round(marco.width), 200, JSON.stringify(marco));
        assert.equal(Math.round(marco.height), 200, JSON.stringify(marco));
        assert.equal(await page.locator('#reproductor-marco').evaluate(e => getComputedStyle(e).overflow), 'hidden');
        assert.equal(await page.locator('#reproductor-marco').evaluate(e => getComputedStyle(e).borderRadius), '14px');
        assert.equal(await page.locator('#reproductor-marco').evaluate(e => {
            const r = e.getBoundingClientRect();
            const encima = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return e.contains(encima);
        }), true);
        assert.equal(Math.round((await page.locator('#musica-play').boundingBox()).width), 52);
        const aire = await page.locator('.editor-cuerpo').evaluate(e => parseFloat(getComputedStyle(e).paddingBottom));
        assert.ok(aire >= banner.height + 16, String(aire));
        // Plegar esconde el video y pausa. Para volver a sonar hay que mostrar el video.
        await page.locator('#musica-plegar').click();
        assert.equal(await page.locator('#reproductor-marco').isVisible(), false);
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'Reproducir');
        assert.equal(await page.locator('#musica-play').getAttribute('aria-disabled'), 'true');
        assert.equal(await page.evaluate(() => window.__yt.pausado), true);
        assert.equal((await page.locator('#reproductor-fuente').textContent()).trim(), 'YouTube · en pausa');
        assert.equal((await page.locator('#musica-mostrar').textContent()).trim(), 'Mostrar video para reproducir');
        // Achicado, la tarjeta explica por qué YouTube no puede seguir sonando.
        assert.equal(await page.locator('#musica-nota-youtube').textContent(), 'Los videos no se pueden minimizar por política de YouTube');
        assert.equal(await page.locator('#musica-nota-youtube').isVisible(), true);
        const plegado = await page.locator('#reproductor').boundingBox();
        assert.ok(Math.abs(plegado.height - 184) <= 4, JSON.stringify(plegado.height));
        await page.locator('#musica-mostrar').click();
        assert.equal(await page.locator('#reproductor-marco').isVisible(), true);
        assert.equal(await page.locator('#musica-nota-youtube').isVisible(), false);
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'Pausar');
        // Con el teclado abierto la tarjeta se va y YouTube queda en pausa. Al cerrarlo no sigue solo.
        await page.evaluate(() => document.body.classList.add('teclado-abierto'));
        await page.waitForFunction(() => window.__yt.pausado);
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        await page.evaluate(() => document.body.classList.remove('teclado-abierto'));
        assert.equal(await page.locator('#reproductor').isVisible(), true);
        assert.equal(await page.evaluate(() => window.__yt.pausado), true);
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'Reproducir');
        await page.screenshot({path: `capturas/editor-musica-${tema}.png`});
        await page.locator('#musica-cerrar').click();
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        assert.equal(await page.evaluate(() => window.__ytCerrado), true);
        // SoundCloud: el iframe oficial queda fuera de vista. Play, pausa y la barra lo manejan.
        await page.route('https://w.soundcloud.com/player/api.js', ruta => ruta.fulfill({contentType: 'text/javascript', body: `
            window.SC = { Widget: function (el) {
                const w = window.__sc = { el, vol: 0, paused: true, pos: 0 };
                w.bind = (ev, fn) => { w['on' + ev] = fn; };
                w.play = () => { w.paused = false; w.onPLAY?.(); };
                w.pause = () => { w.paused = true; w.onPAUSE?.(); };
                w.setVolume = v => { w.vol = v; };
                w.getPosition = cb => cb(w.pos);
                w.getDuration = cb => cb(180000);
                w.seekTo = ms => { w.pos = ms; };
                w.getSounds = cb => cb([{}]);
                w.getCurrentSound = cb => cb({ title: 'Tema nube' });
                setTimeout(() => w.onREADY?.());
                return w;
            } };
            window.SC.Widget.Events = { READY: 'READY', PLAY: 'PLAY', PAUSE: 'PAUSE', FINISH: 'FINISH', ERROR: 'ERROR', PLAY_PROGRESS: 'PLAY_PROGRESS' };`}));
        await page.locator('#abrir-musica').click();
        await page.locator('#fs-link').fill('https://soundcloud.com/artista/tema');
        await page.locator('#fs-pegar').click();
        await page.locator('#reproductor-titulo', {hasText: 'Tema nube'}).waitFor();
        assert.equal(await page.locator('#reproductor-marco').isVisible(), false);
        assert.equal(await page.locator('#musica-plegar').isVisible(), false);
        assert.equal(await page.locator('#musica-mostrar').isVisible(), false);
        assert.equal((await page.locator('#reproductor-fuente').textContent()).trim(), 'SoundCloud');
        const nube = await page.locator('#reproductor').boundingBox();
        assert.ok(Math.abs(nube.height - 92) <= 2, JSON.stringify(nube));
        assert.equal(Math.round(nube.x), 16, JSON.stringify(nube));
        assert.equal(Math.round((await page.locator('#musica-play').boundingBox()).width), 40);
        const oculto = await page.locator('#reproductor-oculto iframe').boundingBox();
        assert.ok(oculto.x + oculto.width < 0, JSON.stringify(oculto));
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        const pistaNube = await page.locator('#musica-pista').boundingBox();
        await page.mouse.click(pistaNube.x + pistaNube.width / 2, pistaNube.y + pistaNube.height / 2);
        assert.ok(Math.abs(await page.evaluate(() => window.__sc.pos) - 90000) < 2000);
        await page.evaluate(() => document.body.classList.add('teclado-abierto'));
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        await page.evaluate(() => document.body.classList.remove('teclado-abierto'));
        await page.locator('#musica-play').click();
        assert.equal(await page.evaluate(() => window.__sc.paused), true);
        await page.locator('#musica-play').click();
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        // Con la canción de la libreta en pausa, el play de la bandeja de Freestyle la toma
        // para la ronda: no suma un beat encima (se duplicaba el audio).
        await page.locator('#musica-play').click();
        await page.evaluate(() => document.querySelector('#barra-pestanas [data-pestana="freestyle"]').click());
        assert.equal(await page.locator('#fs-play').isVisible(), true);
        await page.locator('#fs-play').click();
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        assert.equal(await page.evaluate(() => document.body.classList.contains('beat-sonando')), false);
        assert.equal(await page.locator('#fs-play').isVisible(), false);
        assert.equal(await page.locator('#pantalla-freestyle').evaluate(e => e.classList.contains('con-link')), true);
        await page.waitForFunction(() => document.getElementById('fs-cuenta').textContent !== '1:00');
        await page.evaluate(() => document.querySelector('#barra-pestanas [data-pestana="letras"]').click());
        await page.locator('#musica-cerrar').click();
        // El link corto de la app (on.soundcloud.com) se resuelve por oEmbed antes del widget.
        // ?si=, utm y m.soundcloud.com no: el widget recibe el path en soundcloud.com.
        const pedidosOembed = [];
        await page.route('https://soundcloud.com/oembed**', ruta => {
            pedidosOembed.push(new URL(ruta.request().url()).searchParams.get('url'));
            return ruta.fulfill({contentType: 'application/json', body: JSON.stringify({
                html: '<iframe src="https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F2416843668&amp;show_artwork=true"></iframe>',
            })});
        });
        await page.locator('#abrir-musica').click();
        await page.locator('#fs-link').fill('https://on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ');
        await page.locator('#fs-pegar').click();
        await page.locator('#reproductor-titulo', {hasText: 'Tema nube'}).waitFor();
        const srcCorto = new URL(await page.locator('#reproductor-oculto iframe').getAttribute('src'));
        assert.equal(srcCorto.searchParams.get('url'), 'https://api.soundcloud.com/tracks/2416843668');
        assert.equal(srcCorto.searchParams.get('auto_play'), 'false');
        assert.deepEqual(pedidosOembed, ['https://on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ']);
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        await page.locator('#musica-cerrar').click();
        for (const [link, canonica] of [
            ['https://soundcloud.com/swa13sg/tenchnosad_88bpm-f-ambkr?si=3F1AE1E53E9D468E99ECFEE926575E8D&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing', 'https://soundcloud.com/swa13sg/tenchnosad_88bpm-f-ambkr'],
            ['https://m.soundcloud.com/swa13sg/tenchnosad_88bpm-f-ambkr?si=abc', 'https://soundcloud.com/swa13sg/tenchnosad_88bpm-f-ambkr'],
        ]) {
            await page.locator('#abrir-musica').click();
            await page.locator('#fs-link').fill(link);
            await page.locator('#fs-pegar').click();
            await page.locator('#reproductor-titulo', {hasText: 'Tema nube'}).waitFor();
            const src = new URL(await page.locator('#reproductor-oculto iframe').getAttribute('src'));
            assert.equal(src.searchParams.get('url'), canonica, link);
            assert.equal(await page.evaluate(() => window.__sc.paused), false, link);
            await page.locator('#musica-cerrar').click();
        }
        assert.deepEqual(pedidosOembed, ['https://on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ']);
        await page.unroute('https://soundcloud.com/oembed**');
        // Si salís del editor mientras SoundCloud carga, el READY no tiene que dar play.
        await page.unroute('https://w.soundcloud.com/player/api.js');
        await page.evaluate(() => { delete window.SC; });
        await page.route('https://w.soundcloud.com/player/api.js', ruta => ruta.fulfill({contentType: 'text/javascript', body: `
            window.SC = { Widget: function (el) {
                const w = window.__sc = { el, plays: 0, paused: true };
                w.bind = (ev, fn) => { w['on' + ev] = fn; };
                w.play = () => { w.plays++; w.paused = false; w.onPLAY?.(); };
                w.pause = () => { w.paused = true; w.onPAUSE?.(); };
                w.setVolume = () => {};
                w.getPosition = cb => cb(0);
                w.getDuration = cb => cb(180000);
                w.seekTo = () => {};
                w.getSounds = cb => cb([{}]);
                w.getCurrentSound = cb => cb({ title: 'Tardío' });
                window.__scListo = () => w.onREADY?.();
                return w;
            } };
            window.SC.Widget.Events = { READY: 'READY', PLAY: 'PLAY', PAUSE: 'PAUSE', FINISH: 'FINISH', ERROR: 'ERROR', PLAY_PROGRESS: 'PLAY_PROGRESS' };`}));
        await page.locator('#abrir-musica').click();
        await page.locator('#fs-link').fill('https://soundcloud.com/artista/tarda');
        await page.locator('#fs-pegar').click();
        await page.waitForFunction(() => window.__scListo);
        await page.locator('#editor-atras').click();
        await page.evaluate(() => window.__scListo());
        // Fuera de la libreta la tarjeta sigue a la vista, arriba de la barra, y suena.
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        assert.equal(await page.locator('#reproductor').isVisible(), true);
        const tarjetaLista = await page.locator('#reproductor').boundingBox();
        assert.ok(Math.abs(tarjetaLista.y + tarjetaLista.height - (844 - 86)) <= 2, `arriba de la barra: ${JSON.stringify(tarjetaLista)}`);
        // En Ajustes no se ve, pero SoundCloud sigue sonando.
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        assert.equal(await page.locator('#reproductor').isVisible(), true);
        await page.screenshot({path: `capturas/rimas-reproductor-${tema}.png`});
        await page.locator('#barra-pestanas [data-pestana="letras"]').click();
        await page.locator('#lista-letras .tarjeta-letra button').click();
        assert.equal(await page.locator('#vista-editor').isVisible(), true);
        await page.locator('#musica-cerrar').click();
        // Si cerrás YouTube en «Cargando…», la API que llega después no crea el reproductor.
        await page.unroute('https://www.youtube.com/iframe_api');
        await page.evaluate(() => { delete window.YT; delete window.__ytNacio; delete window.__ytSono; });
        await page.route('https://www.youtube.com/iframe_api', ruta => ruta.fulfill({contentType: 'text/javascript', body: `
            window.__ytArmar = () => {
                window.YT = { PlayerState: { PLAYING: 1 }, Player: function (lugar, o) {
                    window.__ytNacio = true;
                    const p = this;
                    p.playVideo = () => { window.__ytSono = true; };
                    p.pauseVideo = () => {};
                    p.setVolume = () => {};
                    p.getVideoData = () => ({ title: 'No debería existir' });
                    p.getCurrentTime = () => 0; p.getDuration = () => 10; p.seekTo = () => {};
                    p.destroy = () => {};
                    setTimeout(() => o.events.onReady({ target: p }));
                } };
                onYouTubeIframeAPIReady();
            };`}));
        await page.locator('#abrir-musica').click();
        await page.locator('#fs-link').fill('https://youtu.be/dQw4w9WgXcQ');
        await page.locator('#fs-pegar').click();
        await page.locator('#reproductor-titulo', {hasText: 'Cargando…'}).waitFor();
        await page.waitForFunction(() => window.__ytArmar);
        await page.locator('#musica-cerrar').click();
        await page.evaluate(() => window.__ytArmar());
        assert.equal(await page.evaluate(() => window.__ytNacio ?? null), null);
        assert.equal(await page.evaluate(() => window.__ytSono ?? null), null);
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        // Un error de YouTube no lo pisa el cambio de estado, y Reproducir queda deshabilitado.
        await page.evaluate(() => { delete window.YT; delete window.__ytPlay; });
        await page.unroute('https://www.youtube.com/iframe_api');
        await page.route('https://www.youtube.com/iframe_api', ruta => ruta.fulfill({contentType: 'text/javascript', body: `
            window.YT = { PlayerState: { PLAYING: 1, BUFFERING: 3 }, Player: function (lugar, o) {
                const p = window.__yt = this;
                p.playVideo = () => { window.__ytPlay = (window.__ytPlay || 0) + 1; o.events.onStateChange({ data: 1 }); };
                p.pauseVideo = () => {};
                p.setVolume = () => {};
                p.getVideoData = () => ({ title: 'Tema que no va' });
                p.getCurrentTime = () => 0; p.getDuration = () => 10; p.seekTo = () => {};
                p.destroy = () => {};
                setTimeout(() => {
                    o.events.onError({ data: 150 });
                    o.events.onStateChange({ data: 1 });
                });
            } };
            setTimeout(() => onYouTubeIframeAPIReady());`}));
        await page.locator('#abrir-musica').click();
        await page.locator('#fs-link').fill('https://youtu.be/dQw4w9WgXcQ');
        await page.locator('#fs-pegar').click();
        await page.locator('#reproductor-titulo', {hasText: 'No se pudo reproducir este video'}).waitFor();
        assert.equal((await page.locator('#reproductor-titulo').textContent()).trim(), 'No se pudo reproducir este video');
        assert.equal(await page.locator('#musica-play').getAttribute('aria-disabled'), 'true');
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'No se puede reproducir');
        assert.equal(await page.locator('#musica-play').evaluate(e => getComputedStyle(e).pointerEvents), 'none');
        await page.locator('#musica-play').evaluate(b => b.click());
        assert.equal(await page.evaluate(() => window.__ytPlay || 0), 0);
        await page.locator('#musica-cerrar').click();
        // Sin internet, avisa.
        await page.context().setOffline(true);
        await page.locator('#abrir-musica').click();
        assert.match(await page.locator('#fs-link-aviso').textContent(), /Sin internet/);
        await page.mouse.click(195, 100);
        assert.equal(await page.locator('#hoja-musica').isVisible(), false);
        await page.context().setOffline(false);
        // Una canción del teléfono suena sola y la hoja se cierra.
        await page.locator('#abrir-musica').click();
        await page.locator('#fs-archivo').setInputFiles(path.join(__dirname, 'beats/boom-bap-jazz.mp3'));
        await page.locator('#reproductor-titulo', {hasText: 'boom-bap-jazz'}).waitFor();
        assert.equal(await page.locator('#hoja-musica').isVisible(), false);
        await page.waitForFunction(() => document.querySelector('#reproductor-oculto audio')?.paused === false);
        await page.locator('#musica-cerrar').click();
        // Los renglones arrancan prendidos y se apagan.
        assert.match(await page.locator('.editor-cuerpo').evaluate(e => getComputedStyle(e).backgroundImage), /repeating-linear-gradient/);
        // De borde a borde, como un cuaderno, y el texto a 16px del borde, como en Keep.
        assert.deepEqual(await page.locator('.editor-cuerpo').evaluate(e => [e.getBoundingClientRect().left, e.getBoundingClientRect().right]), [0, 390]);
        assert.equal(await page.locator('#editor-titulo').evaluate(e => e.getBoundingClientRect().left), 16);
        await page.locator('#alternar-renglones').click();
        assert.equal(await page.locator('.editor-cuerpo').evaluate(e => getComputedStyle(e).backgroundImage), 'none');
        await page.locator('#alternar-renglones').click();
        // Rimas internas: se pintan las palabras del medio que riman consonante con otras cercanas.
        const textoAntes = await page.locator('#editor-texto').inputValue();
        const escribir = texto => page.locator('#editor-texto').evaluate((t, v) => { t.value = v; t.dispatchEvent(new Event('input')); }, texto);
        const marcas = () => page.locator('#editor-fondo mark').evaluateAll(ms => ms.map(m => m.className + ':' + m.textContent));
        // Arrancan en 2 versos: se pasa a 4 para este ejemplo.
        await page.locator('#abrir-ajustes-libreta').click();
        assert.equal(await page.locator('[data-ajuste="internas"] [aria-selected="true"]').textContent(), '2 versos');
        await page.locator('[data-ajuste="internas"] [data-opcion="cuatro"]').click();
        await page.locator('#cerrar-ajustes-libreta').click();
        await escribir('tengo un camino y un destino\nla luna me mira\nvengo de lejos');
        assert.deepEqual(await marcas(), ['rima-0:tengo', 'rima-1:mino', 'rima-1:tino', 'rima-0:vengo', 'rima-0 suave:lejos']);
        await page.screenshot({path: `capturas/editor-internas-${tema}.png`});
        // Cada terminación con su color, sin repetir aunque haya muchas, y siempre el mismo en toda la letra.
        await escribir(['canción', 'luna', 'casa', 'vida', 'mesa', 'fuego', 'amigo', 'mundo', 'corazón', 'fortuna', 'nada', 'risa', 'besa', 'juego', 'trigo', 'segundo'].join('\n'));
        const clases = await page.locator('#editor-fondo mark').evaluateAll(ms => ms.map(m => m.className.replace(' suave', '')));
        assert.equal(new Set(clases.slice(0, 8)).size, 8, clases.join());
        assert.deepEqual(clases.slice(8), clases.slice(0, 8));
        const fondos = await page.locator('#editor-fondo mark').evaluateAll(ms => ms.slice(0, 8).map(m => getComputedStyle(m).backgroundColor));
        assert.equal(new Set(fondos).size, 8, fondos.join());
        await page.screenshot({path: `capturas/editor-colores-${tema}.png`});
        await escribir('tengo un camino y un destino\nla luna me mira\nvengo de lejos');
        await page.locator('#abrir-ajustes-libreta').click();
        await page.locator('[data-ajuste="internas"] [data-opcion="dos"]').click();
        assert.deepEqual(await marcas(), ['rima-0:mino', 'rima-0:tino', 'rima-1 suave:vengo', 'rima-1 suave:lejos'], 'a 2 versos, tengo y vengo quedan lejos');
        await page.locator('[data-ajuste="internas"] [data-opcion="no"]').click();
        assert.deepEqual(await marcas(), []);
        await page.locator('[data-ajuste="internas"] [data-opcion="cuatro"]').click();
        await page.locator('#cerrar-ajustes-libreta').click();
        await escribir(textoAntes);
        // La ruedita abre los ajustes de la libreta: sílabas, tamaño, separación y fuente.
        await page.locator('#abrir-ajustes-libreta').click();
        assert.equal(await page.locator('#ajustes-libreta').isVisible(), true);
        await page.locator('#mostrar-silabas').click();
        // Tamaño y separaciones: barras de 10 puntos imantados.
        assert.equal(await page.locator('#ajustes-libreta .fila-deslizador').count(), 3);
        assert.equal(await page.locator('#ajustes-libreta .fila-deslizador').first().locator('.puntos-deslizador span').count(), 10);
        assert.equal(await page.locator('input[data-ajuste="tamano"]').inputValue(), '3', 'el tamaño arranca en el punto 4');
        await page.locator('input[data-ajuste="tamano"]').fill('7');
        await page.locator('input[data-ajuste="separacion"]').fill('7');
        await page.locator('[data-ajuste="fuente"] [data-opcion="serif"]').click();
        await page.locator('input[data-ajuste="letras"]').fill('1');
        await page.screenshot({path: `capturas/ajustes-libreta-${tema}.png`});
        await page.locator('#cerrar-ajustes-libreta').click();
        const estiloTexto = () => page.locator('#editor-texto').evaluate(t => [getComputedStyle(t).fontSize, getComputedStyle(t).lineHeight, getComputedStyle(t).fontFamily]);
        assert.deepEqual((await estiloTexto()).slice(0, 2), ['20px', '35px']);
        assert.match((await estiloTexto())[2], /serif/);
        // Letras más juntas, igual en el texto y en la copia que pinta las rimas.
        const espaciado = await page.evaluate(() => ['editor-texto', 'editor-fondo'].map(id => getComputedStyle(document.getElementById(id)).letterSpacing));
        assert.equal(espaciado[0], espaciado[1]);
        assert.ok(parseFloat(espaciado[0]) < 0, espaciado[0]);
        assert.equal(await page.locator('#silabas').isVisible(), false);
        await page.screenshot({path: `capturas/editor-grande-serif-${tema}.png`});
        // Todo se recuerda después de recargar.
        await page.locator('#editor-atras').click();
        assert.equal(await page.locator('#barra-pestanas').isVisible(), true);
        await page.reload();
        await page.locator('#lista-letras .tarjeta-letra button').click();
        assert.deepEqual((await estiloTexto()).slice(0, 2), ['20px', '35px']);
        assert.equal(await page.locator('#silabas').isVisible(), false);
        await page.locator('#abrir-ajustes-libreta').click();
        assert.equal(await page.locator('[data-ajuste="fuente"] [aria-selected="true"]').textContent(), 'Serif');
        await page.locator('#mostrar-silabas').click();
        await page.locator('input[data-ajuste="tamano"]').fill('4');
        await page.locator('input[data-ajuste="separacion"]').fill('3');
        await page.locator('[data-ajuste="fuente"] [data-opcion="sistema"]').click();
        await page.locator('input[data-ajuste="letras"]').fill('5');
        await page.locator('#ajustes-libreta').click({position: {x: 10, y: 10}});
        assert.equal(await page.locator('#ajustes-libreta').isVisible(), false);
        assert.deepEqual((await estiloTexto()).slice(0, 2), ['17px', '23px']);
        assert.equal(await page.locator('#silabas').isVisible(), true);
        await page.locator('#editor-atras').click();

        // La letra queda guardada, también después de recargar.
        assert.equal(await page.locator('#lista-letras .titulo-letra').textContent(), 'Sacred Geometry');
        assert.match(await page.locator('#lista-letras .texto-letra').textContent(), /^Caminante, no hay camino,/);
        assert.match(await page.locator('#lista-letras .fecha-letra').textContent(), /^\d\d\/\d\d$/);
        await page.reload();
        assert.equal(await page.locator('#lista-letras .tarjeta-letra').count(), 1);
        await page.screenshot({path: `capturas/letras-guardadas-${tema}.png`});
        await page.locator('#lista-letras .tarjeta-letra button').click();
        assert.match(await page.locator('#editor-texto').inputValue(), /^Caminante[\s\S]*detrás$/);
        assert.equal(await page.locator('#editor-fondo mark').count(), 8);
        // Al entrar a una letra empezada no se abre el teclado: no hay nada enfocado.
        assert.equal(await page.evaluate(() => document.activeElement.id), '');
        // Borrar está abajo de todo en la ruedita y pide confirmación.
        await page.locator('#abrir-ajustes-libreta').click();
        await page.locator('#borrar-letra').click();
        assert.equal(await page.locator('#confirmar-borrado').isVisible(), true);
        await page.locator('#cancelar-borrado').click();
        assert.equal(await page.locator('#vista-editor').isVisible(), true);
        await page.locator('#borrar-letra').click();
        await page.locator('#aceptar-borrado').click();
        assert.equal(await page.locator('#ajustes-libreta').isVisible(), false);
        assert.equal(await page.locator('#letras-vacio').isVisible(), true);
        assert.equal(await page.locator('#lista-letras .tarjeta-letra').count(), 0);

        // Para borrar: mantener apretada la tarjeta y arrastrarla al tacho que aparece arriba.
        await page.locator('#nueva-letra').click();
        await page.locator('#editor-titulo').fill('Para borrar');
        await page.locator('#editor-atras').click();
        const tarjeta = page.locator('#lista-letras .tarjeta-letra button');
        assert.equal(await page.locator('#tacho').isVisible(), false);
        const caja = await tarjeta.boundingBox();
        // Soltarla en otro lado la deja como estaba y no la abre.
        await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(600);
        assert.equal(await page.locator('#tacho').isVisible(), true);
        await page.mouse.move(caja.x + caja.width / 2 + 5, caja.y + caja.height / 2 + 200, {steps: 5});
        await page.mouse.up();
        await page.waitForTimeout(400);
        assert.equal(await page.locator('#vista-editor').isVisible(), false);
        assert.equal(await tarjeta.count(), 1);
        assert.equal(await page.locator('#tacho').isVisible(), false);
        // Al tacho: se borra.
        const caja2 = await tarjeta.boundingBox();
        await page.mouse.move(caja2.x + caja2.width / 2, caja2.y + caja2.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(800); // que termine de aparecer el tacho
        const tacho = await page.locator('#tacho').boundingBox();
        await page.mouse.move(tacho.x + tacho.width / 2, tacho.y + tacho.height / 2, {steps: 8});
        assert.match(await page.locator('#tacho').getAttribute('class'), /encima/);
        await page.screenshot({path: `capturas/letras-tacho-${tema}.png`});
        await page.mouse.up();
        // Antes de borrar pregunta; "Cancelar" la deja como estaba.
        assert.equal(await page.locator('#confirmar-borrado').isVisible(), true);
        assert.match(await page.locator('#confirmar-borrado-texto').textContent(), /«Para borrar»/);
        await page.waitForTimeout(300);
        await page.screenshot({path: `capturas/letras-confirmar-${tema}.png`});
        await page.locator('#cancelar-borrado').click();
        await page.waitForTimeout(400);
        assert.equal(await page.locator('#confirmar-borrado').isVisible(), false);
        assert.equal(await page.locator('#lista-letras .tarjeta-letra').count(), 1);
        const caja3 = await tarjeta.boundingBox();
        await page.mouse.move(caja3.x + caja3.width / 2, caja3.y + caja3.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(800);
        const tacho2 = await page.locator('#tacho').boundingBox();
        await page.mouse.move(tacho2.x + tacho2.width / 2, tacho2.y + tacho2.height / 2, {steps: 8});
        await page.mouse.up();
        await page.locator('#aceptar-borrado').click();
        await page.waitForTimeout(500);
        assert.equal(await page.locator('#lista-letras .tarjeta-letra').count(), 0);
        // Un toque común sigue abriendo la letra (ver arriba): acá ya no queda ninguna.

        // Rimas: 6 palabras al azar que cambian solas; escribir una palabra las cambia por rimas.
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        assert.equal(await page.locator('.palabra').count(), 6);
        assert.equal(await page.locator('#barra-pestanas [data-pestana="palabras"]').count(), 0);
        await page.screenshot({path: `capturas/rimas-azar-${tema}.png`});
        await page.locator('#buscar-rima').fill('canción');
        const tarjetas = await page.locator('.palabra').allTextContents();
        assert.equal(tarjetas.length, 6);
        assert.ok(tarjetas.every(p => /[oó]n$/.test(p)), tarjetas.join());
        const consonantes = await page.locator('#resultados-rimas .celda').allTextContents();
        assert.equal(consonantes.length, 100);
        assert.ok(consonantes.slice(0, 5).includes('corazón'), consonantes.slice(0, 5).join());
        assert.ok(consonantes.every(p => /[oó]n$/.test(p)));
        assert.equal(await page.locator('#rimas-vacio').isVisible(), false);
        await page.screenshot({path: `capturas/rimas-${tema}.png`});
        await page.locator('#tipo-rima [data-tipo="asonante"]').click();
        assert.equal(await page.locator('#tipo-rima [data-tipo="asonante"]').getAttribute('aria-selected'), 'true');
        const asonantes = await page.locator('#resultados-rimas .celda').allTextContents();
        assert.ok(asonantes.length > 0 && !asonantes.some(p => consonantes.includes(p)));
        assert.ok((await page.locator('.palabra').allTextContents()).every(p => asonantes.includes(p)));
        await page.screenshot({path: `capturas/rimas-asonante-${tema}.png`});
        // Favoritas: la estrella guarda la palabra y aparece sin búsqueda.
        const primera = asonantes[0];
        await page.locator('#resultados-rimas .estrella').first().click();
        assert.equal(await page.locator('#resultados-rimas .estrella').first().getAttribute('aria-pressed'), 'true');
        await page.locator('#buscar-rima').fill('');
        assert.equal(await page.locator('#encabezado-resultados').textContent(), 'Favoritas');
        assert.deepEqual(await page.locator('#resultados-rimas .celda').allTextContents(), [primera]);
        await page.screenshot({path: `capturas/favoritas-${tema}.png`});
        await page.locator('#resultados-rimas .celda-boton').first().click();
        assert.equal(await page.locator('#buscar-rima').inputValue(), primera);
        await page.locator('#buscar-rima').fill('xyz');
        assert.match(await page.locator('#rimas-vacio').textContent(), /No encontré rimas asonantes/);
        assert.equal(await page.locator('.palabra').count(), 0);
        await page.locator('#tipo-rima [data-tipo="consonante"]').click();
        await page.locator('#buscar-rima').fill('');
        // Tocar una tarjeta la guarda en favoritas; pausar y palabras simples.
        await page.locator('#pausar-palabras').click();
        const tocada = await page.locator('.palabra').first().textContent();
        await page.locator('.palabra').first().click();
        assert.equal(await page.locator('.palabra').first().getAttribute('aria-pressed'), 'true');
        assert.ok((await page.locator('#resultados-rimas .celda').allTextContents()).includes(tocada));
        await page.locator('#pausar-palabras').click();
        await page.locator('#palabras-simples').check();
        assert.match(await page.locator('#palabras-total').textContent(), /20\.000 palabras disponibles/);

        // Los links que sonaron en la libreta quedan en los recientes del cajón (es el mismo).
        assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('metrica.recientes') ?? '[]').length) > 0, 'la libreta suma recientes');
        await page.evaluate(() => localStorage.removeItem('metrica.recientes'));
        await page.reload();
        // Freestyle: bandeja de duración, beats, el reloj cuenta para atrás y el aro se llena.
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
        const pantallaFs = page.locator('#pantalla-freestyle');
        for (const sel of ['.linea-compas', '#fs-proxima', '#fs-bpm', '#fs-tiempos', '#fs-empezar']) {
            assert.equal(await pantallaFs.locator(sel).count(), 0, sel);
        }
        assert.equal(await pantallaFs.getByText('Tocá').count(), 0);
        assert.equal(await pantallaFs.getByText(/Compás/).count(), 0);
        assert.deepEqual(await page.locator('#fs-duraciones .chip-fs').allTextContents(), ['1 min', '1:30', '2 min', '★ Ilimitado']);
        assert.equal(await page.locator('#fs-duraciones [data-duracion="60"]').getAttribute('aria-checked'), 'true');
        assert.equal(await page.locator('#fs-cuenta').textContent(), '1:00');
        await page.locator('#fs-duraciones [data-duracion="90"]').click();
        assert.equal(await page.locator('#fs-cuenta').textContent(), '1:30');
        await page.locator('#fs-duraciones [data-duracion="120"]').click();
        assert.equal(await page.locator('#fs-cuenta').textContent(), '2:00');
        await page.locator('#fs-duraciones [data-duracion="60"]').click();
        const ilimitado = page.locator('#fs-duraciones [data-duracion="ilimitado"]');
        assert.equal(await ilimitado.getAttribute('aria-disabled'), 'true');
        assert.equal(await ilimitado.getAttribute('aria-checked'), 'false');
        // aria-disabled no frena el toque en el navegador: abre el paywall. Playwright sí lo trata como deshabilitado.
        await ilimitado.click({ force: true });
        assert.equal(await page.locator('#paywall').isVisible(), true);
        await page.locator('#cerrar-paywall').click();
        assert.equal(await page.locator('#paywall').isVisible(), false);
        assert.equal(await page.locator('#fs-duraciones [data-duracion="60"]').getAttribute('aria-checked'), 'true');
        // Beats: dos botones, Boombap y Trap, uno al lado del otro, con puntitos. Deslizar cambia de beat.
        const ORDEN_BEATS = { Boombap: ['boom-bap-bateria', 'boom-bap-jazz', 'boom-bap-clasico'], Trap: ['trap-seco', 'trap-grave', 'trap-clasico'] };
        const deslizarBeat = async (genero, paso) => {
            const caja = await page.locator(`#fs-beats [data-genero="${genero}"]`).boundingBox();
            await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
            await page.mouse.down();
            await page.mouse.move(caja.x + caja.width / 2 - paso * 50, caja.y + caja.height / 2, {steps: 5});
            await page.mouse.up();
        };
        // Parar una ronda: el círculo pausa y la flecha vuelve todo al principio.
        const pararFs = async () => {
            await page.locator('#fs-reloj').click();
            await page.locator('#fs-reiniciar').click();
        };
        const elegirBeatFs = async id => {
            const genero = id.startsWith('trap') ? 'Trap' : 'Boombap';
            for (let i = 0; i < 4; i++) {
                const actual = await page.locator(`#fs-beats [data-genero="${genero}"]`).getAttribute('data-beat');
                if (actual === id) break;
                await deslizarBeat(genero, Math.sign(ORDEN_BEATS[genero].indexOf(id) - ORDEN_BEATS[genero].indexOf(actual)));
            }
            const boton = page.locator(`#fs-beats [data-genero="${genero}"]`);
            if (await boton.getAttribute('aria-checked') !== 'true') await boton.click();
            assert.equal(await boton.getAttribute('data-beat'), id);
            assert.equal(await boton.getAttribute('aria-checked'), 'true');
        };
        assert.deepEqual(await page.locator('#fs-beats .nombre-beat').allTextContents(), ['Boombap 1', 'Trap 1']);
        assert.equal(await page.locator('#fs-beats [data-genero="Boombap"]').getAttribute('aria-checked'), 'true');
        assert.equal(await page.locator('#fs-beats [data-genero="Boombap"]').getAttribute('data-beat'), 'boom-bap-bateria');
        assert.equal(await page.locator('#fs-beats [data-genero="Boombap"] .puntos-beat span').count(), 3);
        const botonesBeat = await page.locator('#fs-beats .beat-fs').evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(r => ({y: r.y, h: r.height, x: r.x, w: r.width})));
        assert.equal(botonesBeat[0].y, botonesBeat[1].y, 'uno al lado del otro');
        assert.ok(botonesBeat[0].h >= 54 && botonesBeat[1].x > botonesBeat[0].x + botonesBeat[0].w, JSON.stringify(botonesBeat));
        // Deslizar Boombap a la izquierda pasa a Boombap 2 y lo elige; el punto activo es el segundo.
        await deslizarBeat('Boombap', 1);
        assert.equal(await page.locator('#fs-beats [data-genero="Boombap"] .nombre-beat').textContent(), 'Boombap 2');
        assert.equal(await page.locator('#fs-beats [data-genero="Boombap"] .puntos-beat span:nth-child(2)').getAttribute('class'), 'activo');
        await deslizarBeat('Boombap', -1);
        assert.equal(await page.locator('#fs-beats [data-genero="Boombap"] .nombre-beat').textContent(), 'Boombap 1');
        // Tocar Trap lo elige (Trap 1) y Boombap queda sin elegir.
        await page.locator('#fs-beats [data-genero="Trap"]').click();
        assert.equal(await page.locator('#fs-beats [data-genero="Trap"]').getAttribute('aria-checked'), 'true');
        assert.equal(await page.locator('#fs-beats [data-genero="Boombap"]').getAttribute('aria-checked'), 'false');
        await page.screenshot({path: `capturas/freestyle-beats-${tema}.png`});
        await elegirBeatFs('trap-clasico');
        // Sin link, el cajón del link va abajo de todo, pegado a la barra de pestañas. Sin recientes es solo el campo.
        const cajonFs = await page.locator('#fs-cajon').boundingBox();
        const barraPestanas = await page.locator('#barra-pestanas').boundingBox();
        const aireLink = barraPestanas.y - (cajonFs.y + cajonFs.height);
        assert.ok(aireLink >= 4 && aireLink <= 14, `aire entre el cajón y la barra: ${aireLink}`);
        assert.ok(cajonFs.height <= 64, `sin recientes el cajón se achica: ${cajonFs.height}`);
        const campoLink = await page.locator('#fs-link').boundingBox();
        const okLink = await page.locator('#fs-pegar').boundingBox();
        const buscarLink = await page.locator('#fs-buscar').boundingBox();
        assert.ok(Math.abs(campoLink.y - okLink.y) <= 1 && buscarLink.x > okLink.x, 'Buscar va al lado de OK');
        assert.equal(await page.locator('#fs-buscar').textContent(), 'Buscar');
        // El texto de ayuda entra entero en el campo.
        assert.ok(await page.locator('#fs-link').evaluate(e => { e.value = e.placeholder; const entra = e.scrollWidth <= e.clientWidth; e.value = ''; return entra; }), 'el texto del campo entra');
        assert.equal(await page.locator('#fs-recientes-caja').isVisible(), false);
        await page.screenshot({path: `capturas/freestyle-cajon-${tema}.png`});
        assert.equal(await page.locator('#fs-pegar').textContent(), 'OK');
        assert.equal(await page.locator('#fs-link').getAttribute('placeholder'), 'SoundCloud / YouTube / Playlist');
        assert.ok(await page.locator('#fs-link').evaluate(e => e.scrollHeight <= e.clientHeight + 1), 'el texto del campo entra');
        assert.equal(await page.locator('#fs-play').isVisible(), true);
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        await page.locator('#fs-palabra .tonica').waitFor();
        const palabra1 = await page.locator('#fs-palabra').textContent();
        await page.locator('#fs-play').click();
        assert.equal(await page.locator('#fs-play').getAttribute('aria-label'), 'Pausar');
        await page.waitForFunction(() => {
            const [m, s] = document.getElementById('fs-cuenta').textContent.split(':').map(Number);
            return m * 60 + s <= 58;
        }, null, {timeout: 4000});
        assert.ok(Number(await page.locator('#fs-reloj').evaluate(r => r.style.getPropertyValue('--avance'))) > 0);
        await page.waitForFunction(p => document.getElementById('fs-palabra').textContent !== p, palabra1, {timeout: 8000});
        const cuenta = await page.locator('#fs-cuenta').textContent();
        const segundosCuenta = cuenta.split(':').reduce((m, s) => m * 60 + Number(s), 0);
        assert.ok(segundosCuenta < 58 && segundosCuenta > 40, cuenta);
        // La barrita de abajo de la palabra se vacía mientras dura la palabra.
        const escalaBarra = () => page.locator('#fs-barra-palabra').evaluate(e => new DOMMatrix(getComputedStyle(e).transform).a);
        assert.equal(await page.locator('#fs-barra-palabra').isVisible(), true);
        const escala1 = await escalaBarra();
        await page.waitForTimeout(600);
        const escala2 = await escalaBarra();
        assert.ok(escala2 < escala1 && escala2 > 0, `${escala1} -> ${escala2}`);
        const barraCaja = await page.locator('#fs-barra-palabra').boundingBox();
        const palabraCaja = await page.locator('#fs-palabra').boundingBox();
        assert.ok(barraCaja.y > palabraCaja.y + palabraCaja.height - 2 && barraCaja.y < palabraCaja.y + palabraCaja.height + 16, 'abajo de la palabra');
        // Jugando, el título se va sin mover nada; al parar vuelve.
        const tituloFs = page.locator('#pantalla-freestyle .titulo-grande');
        await page.waitForTimeout(400);
        assert.equal(await tituloFs.evaluate(e => getComputedStyle(e).visibility), 'hidden');
        const aroJugando = (await page.locator('#fs-reloj').boundingBox()).y;
        // Jugando, la bandeja de tiempos se hunde en el cajón de abajo y queda un resplandor chico.
        const bandejaFs = page.locator('.bandeja-fs');
        assert.equal(await bandejaFs.evaluate(e => getComputedStyle(e).opacity), '0');
        assert.equal(await page.locator('#fs-play').isVisible(), false);
        assert.equal(await page.locator('#fs-resplandor').isVisible(), true);
        // El resplandor solo se mira: tocarlo no abre la bandeja.
        assert.equal(await page.locator('#fs-resplandor').evaluate(e => getComputedStyle(e).pointerEvents), 'none');
        // Con un beat de la app sonando, el reproductor chico ocupa el lugar de los botones
        // de beats y del cajón del link, pegado a la barra de pestañas.
        assert.equal(await page.locator('#fs-sonando').isVisible(), true);
        assert.equal(await page.locator('#fs-elegir').isVisible(), false);
        assert.equal(await page.locator('#fs-cajon').isVisible(), false);
        const sonandoCaja = await page.locator('#fs-sonando').boundingBox();
        assert.ok(Math.abs(sonandoCaja.y + sonandoCaja.height - (844 - 86)) <= 1, `pegado a las pestañas: ${JSON.stringify(sonandoCaja)}`);
        const tituloBeat = await page.locator('#fs-sonando-titulo').textContent();
        assert.match(await page.locator('#fs-sonando-fuente').textContent(), /^Métrica · \d+ BPM$/);
        // Al cambiar de sección el beat sigue y su reproductor queda igual, arriba de la barra;
        // en Ajustes no se ve. La ronda sigue andando: el reloj corre en las otras secciones.
        const cuentaAntes = await page.locator('#fs-cuenta').textContent();
        await page.locator('#barra-pestanas [data-pestana="letras"]').click();
        assert.deepEqual(await page.locator('#fs-sonando').boundingBox(), sonandoCaja);
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        assert.equal(await page.locator('#fs-sonando').isVisible(), false);
        const pasoEnAjustes = await page.evaluate(() => document.documentElement.dataset.pasoBeat);
        await page.waitForTimeout(600);
        assert.notEqual(await page.evaluate(() => document.documentElement.dataset.pasoBeat), pasoEnAjustes, 'en Ajustes el beat sigue');
        await page.waitForTimeout(500);
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
        assert.notEqual(await page.locator('#fs-cuenta').textContent(), cuentaAntes, 'la ronda siguió en las otras secciones');
        assert.equal(await page.locator('#fs-play').getAttribute('aria-label'), 'Pausar');
        await page.screenshot({path: `capturas/freestyle-sin-bandeja-${tema}.png`});
        // Tocar el círculo pausa: vuelve la bandeja y el reloj se frena.
        await page.locator('#fs-reloj').click();
        await page.waitForTimeout(450);
        assert.equal(await bandejaFs.evaluate(e => getComputedStyle(e).opacity), '1');
        assert.equal(await page.locator('#fs-resplandor').isVisible(), false);
        assert.equal(await page.locator('#fs-play').getAttribute('aria-label'), 'Seguir');
        const enPausa = await page.locator('#fs-cuenta').textContent();
        const pasoEnPausa = await page.evaluate(() => document.documentElement.dataset.pasoBeat);
        await page.waitForTimeout(1100);
        assert.equal(await page.locator('#fs-cuenta').textContent(), enPausa, 'en pausa el reloj no sigue');
        assert.notEqual(await page.evaluate(() => document.documentElement.dataset.pasoBeat), pasoEnPausa, 'pausar no frena el beat');
        // Mientras el beat sigue, su reproductor sigue a la vista; las flechas pasan de beat.
        assert.equal(await page.locator('#fs-sonando').isVisible(), true);
        await page.locator('#fs-beat-anterior').click();
        assert.notEqual(await page.locator('#fs-sonando-titulo').textContent(), tituloBeat);
        await page.locator('#fs-beat-siguiente').click();
        assert.equal(await page.locator('#fs-sonando-titulo').textContent(), tituloBeat);
        // La pausa del reproductor frena el beat, pero el reproductor queda a la vista: solo la cruz lo cierra.
        await page.locator('#fs-beat-pausar').click();
        assert.equal(await page.locator('#fs-sonando').isVisible(), true);
        assert.equal(await page.locator('#fs-beat-pausar').getAttribute('aria-label'), 'Reproducir');
        assert.equal(await page.locator('#fs-elegir').isVisible(), false);
        const pasoParado = await page.evaluate(() => document.documentElement.dataset.pasoBeat);
        await page.waitForTimeout(600);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.pasoBeat), pasoParado, 'la pausa del reproductor frena el beat');
        // Todo entra en la bandeja: play, reiniciar y las 4 duraciones, sin scroll.
        assert.ok(await page.locator('#fs-duraciones').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'las duraciones entran');
        const reiniciarCaja = await page.locator('#fs-reiniciar').boundingBox();
        const unMin = await page.locator('#fs-duraciones [data-duracion="60"]').boundingBox();
        assert.ok(reiniciarCaja.x + reiniciarCaja.width <= unMin.x, 'reiniciar va a la izquierda de 1 min');
        await page.locator('#fs-play').click();
        assert.equal(await page.locator('#fs-play').getAttribute('aria-label'), 'Pausar');
        await page.waitForFunction(c => document.getElementById('fs-cuenta').textContent !== c, enPausa);
        // Tocar el círculo también pausa, y tocarlo en pausa sigue.
        await page.waitForTimeout(400);
        await page.locator('#fs-reloj').click();
        assert.equal(await page.locator('#fs-play').getAttribute('aria-label'), 'Seguir');
        await page.locator('#fs-reloj').click();
        assert.equal(await page.locator('#fs-play').getAttribute('aria-label'), 'Pausar');
        await page.waitForTimeout(400);
        // El resplandor late en los kicks del beat.
        assert.ok(Number(await page.locator('#fs-efecto').getAttribute('data-golpes')) > 2, 'late con el bombo');
        // En los mp3 los kicks se leen del audio.
        const kicksMp3 = await page.evaluate(async () => {
            const { pasosDeBombo } = await import('./js/logica/ambiente.js');
            const { CATALOGO_BEATS } = await import('./js/logica/freestyle.js');
            const ctx = new OfflineAudioContext(1, 1, 44100);
            const salida = {};
            for (const beat of CATALOGO_BEATS.filter(b => b.archivo)) {
                const buffer = await ctx.decodeAudioData(await (await fetch(beat.archivo)).arrayBuffer());
                salida[beat.id] = pasosDeBombo(buffer.getChannelData(0), buffer.sampleRate, beat.bpm);
            }
            return salida;
        });
        for (const [id, pasos] of Object.entries(kicksMp3)) assert.ok(pasos.length >= 2, `${id}: ${pasos}`);
        // Las luces del aro prenden con la ronda, con el mood del género del beat.
        assert.equal(await page.locator('#fs-efecto').getAttribute('data-mood'), 'trap');
        assert.ok(await page.locator('#fs-efecto').evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }) > 1000, 'el canvas de luces dibuja algo');
        const efectoCaja = await page.locator('#fs-efecto').boundingBox();
        const aroCaja = await page.locator('#fs-reloj').boundingBox();
        assert.ok(efectoCaja.width > aroCaja.width + 60 && efectoCaja.y < aroCaja.y - 40, 'las luces salen del aro');
        assert.ok(efectoCaja.x >= -1 && efectoCaja.x + efectoCaja.width <= 391, JSON.stringify(efectoCaja));
        await page.screenshot({path: `capturas/freestyle-${tema}.png`});
        await pararFs();
        // La cruz del reproductor termina la ronda y vuelven los botones de beats y el cajón.
        await page.locator('#fs-play').click();
        await page.locator('#fs-beat-cerrar').click();
        assert.equal(await page.locator('#fs-sonando').isVisible(), false);
        assert.equal(await page.locator('#fs-elegir').isVisible(), true);
        assert.equal(await page.locator('#fs-cajon').isVisible(), true);
        assert.equal(await page.locator('#fs-play').getAttribute('aria-label'), 'Empezar');
        // Una captura por beat, para ver la forma de cada mood.
        if (tema === 'dark') for (const id of ['boom-bap-clasico', 'boom-bap-jazz', 'trap-grave']) {
            await elegirBeatFs(id);
            await page.locator('#fs-play').click();
            await page.waitForTimeout(1500);
            await page.screenshot({path: `capturas/efecto-${id}.png`});
            await pararFs();
        }
        if (tema === 'dark') await elegirBeatFs('trap-clasico');
        assert.equal(await page.locator('#fs-play').getAttribute('aria-label'), 'Empezar');
        await page.waitForTimeout(800);
        assert.equal(await tituloFs.evaluate(e => getComputedStyle(e).visibility), 'visible');
        assert.equal(await page.locator('#fs-efecto').evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }), 0, 'sin ronda, las luces se apagan');
        // Las luces van detrás del círculo, que es de vidrio.
        assert.ok(await page.locator('#fs-reloj').evaluate(e => getComputedStyle(e).backdropFilter.includes('blur')), 'el círculo es de vidrio');
        assert.ok(await page.locator('#fs-reloj').evaluate(e => Number(getComputedStyle(e).zIndex)) > await page.locator('#fs-efecto').evaluate(e => Number(getComputedStyle(e).zIndex)), 'luces detrás del círculo');
        // Ajustes > Freestyle > Efectos en 0: no se dibuja nada aunque haya ronda.
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        assert.equal(await page.locator('#cantidad-efectos').inputValue(), '5');
        // La velocidad de cambio de palabra arranca en 5 (2 compases) y se recuerda.
        assert.equal(await page.locator('#velocidad-palabras').inputValue(), '5');
        assert.equal(await page.locator('#puntos-velocidad span').count(), 10);
        await page.locator('#velocidad-palabras').fill('10');
        assert.equal(await page.locator('#valor-velocidad').textContent(), '10');
        await page.locator('#velocidad-palabras').fill('5');
        await page.locator('#cantidad-efectos').fill('0');
        assert.equal(await page.locator('#valor-efectos').textContent(), '0');
        assert.equal(await page.locator('#puntos-efectos span').count(), 11);
        await page.screenshot({path: `capturas/ajustes-efectos-${tema}.png`});
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
        await page.locator('#fs-play').click();
        await page.waitForTimeout(500);
        assert.equal(await page.locator('#fs-efecto').evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }), 0, 'con efectos en 0 no hay luces');
        await pararFs();
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        await page.locator('#cantidad-efectos').fill('10');
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
        assert.equal(await page.locator('#fs-cuenta').textContent(), '1:00');
        // Cada mp3 dura un número entero de compases: al loopear no se desfasa del reloj.
        for (const [archivo, segundos] of [
            ['beats/boom-bap-bateria.mp3', 8 * 4 * 60 / 90],
            ['beats/boom-bap-jazz.mp3', 2 * 4 * 60 / 93],
            ['beats/trap-grave.mp3', 8 * 4 * 60 / 140],
            ['beats/trap-seco.mp3', 4 * 4 * 60 / 140],
        ]) {
            const duracion = await page.evaluate(async a => {
                const ctx = new AudioContext();
                const datos = await (await fetch(a)).arrayBuffer();
                const audio = await ctx.decodeAudioData(datos);
                await ctx.close();
                return audio.duration;
            }, archivo);
            assert.ok(Math.abs(duracion - segundos) < 0.03, `${archivo} dura ${duracion}, se esperaba ${segundos}`);
        }
        // Un mp3 del catálogo se carga, suena en loop y la palabra cambia con su BPM.
        await elegirBeatFs('boom-bap-jazz');
        await page.waitForFunction(() => performance.getEntriesByType('resource').some(e => e.name.endsWith('beats/boom-bap-jazz.mp3')));
        const palabraJazz = await page.locator('#fs-palabra').textContent();
        await page.locator('#fs-play').click();
        await page.waitForFunction(() => document.documentElement.dataset.beatSonando === 'archivo');
        await page.waitForFunction(p => document.getElementById('fs-palabra').textContent !== p, palabraJazz, {timeout: 8000});
        await pararFs();
        assert.equal(await page.locator('#fs-cuenta').textContent(), '1:00');
        // Un link que no sirve avisa y no abre el reproductor.
        await page.locator('#fs-link').fill('https://spotify.com/track/1');
        await page.locator('#fs-link').press('Enter');
        assert.match(await page.locator('#fs-link-aviso').textContent(), /no es de YouTube ni de SoundCloud/);
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        assert.equal(await page.locator('#fs-play').isVisible(), true);
        // Con un link hay un solo play (el de la tarjeta de abajo) y el reloj sigue.
        await page.evaluate(() => { delete window.YT; });
        await page.unroute('https://www.youtube.com/iframe_api').catch(() => {});
        await page.route('https://www.youtube.com/iframe_api', ruta => ruta.fulfill({contentType: 'text/javascript', body: `
            window.YT = { PlayerState: { PLAYING: 1, BUFFERING: 3 }, Player: function (lugar, o) {
                const p = window.__ytFs = this; p.t = 0; p.pausado = true;
                p.setVolume = () => {};
                p.playVideo = () => { p.pausado = false; o.events.onStateChange({ data: 1 }); };
                p.pauseVideo = () => { p.pausado = true; o.events.onStateChange({ data: 2 }); };
                window.__ytFsOpciones = o.playerVars; p.indice = 0;
                p.getVideoData = () => ({ title: p.indice ? 'Beat ' + (p.indice + 1) + ' de la playlist' : 'Beat de prueba sad 88bpm' });
                p.nextVideo = () => { p.indice++; o.events.onStateChange({ data: 1 }); };
                p.previousVideo = () => { p.indice = Math.max(0, p.indice - 1); o.events.onStateChange({ data: 1 }); };
                p.getCurrentTime = () => p.t; p.getDuration = () => 200; p.seekTo = s => { p.t = s; };
                p.destroy = () => {};
                setTimeout(() => o.events.onReady({ target: p }));
            } };
            setTimeout(() => onYouTubeIframeAPIReady());`}));
        await page.locator('#fs-link').fill('https://youtu.be/dQw4w9WgXcQ');
        await page.locator('#fs-link').press('Enter');
        await page.locator('#reproductor-titulo', {hasText: 'Beat de prueba'}).waitFor();
        assert.equal(await page.locator('#fs-play').isVisible(), false);
        assert.equal(await page.locator('#fs-elegir').isVisible(), false);
        assert.equal(await page.locator('#fs-pegar-link').isVisible(), false);
        assert.equal(await page.locator('#musica-play').isVisible(), true);
        // Con el video a la vista no hay nota: aparece recién al achicarlo.
        assert.equal(await page.locator('#musica-nota-youtube').isVisible(), false);
        const plays = await page.locator('#fs-play, #musica-play').evaluateAll(els => els.filter(e => e.getClientRects().length > 0).map(e => e.id));
        assert.deepEqual(plays, ['musica-play']);
        const player = await page.locator('#reproductor').boundingBox();
        const tab = await page.locator('#barra-pestanas').boundingBox();
        assert.equal(Math.round(player.x), 16, JSON.stringify(player));
        assert.ok(player.y + player.height <= tab.y + 1, JSON.stringify({player, tab}));
        assert.ok(Math.abs(player.y + player.height - (844 - 86)) <= 2, JSON.stringify(player));
        // La bandeja de duración queda pegada arriba de la tarjeta: el aro crece para llenar el alto.
        const bandeja = await page.locator('.bandeja-fs').boundingBox();
        const aireFs = player.y - (bandeja.y + bandeja.height);
        assert.ok(aireFs >= 6 && aireFs <= 16, `aire entre bandeja y tarjeta: ${aireFs}`);
        assert.ok((await page.locator('#fs-reloj').boundingBox()).width > 180, 'el aro aprovecha el alto');
        // Las duraciones llenan la bandeja y el texto va al medio de cada una.
        const chips = await page.locator('#fs-duraciones .chip-fs').evaluateAll(els => els.map(e => getComputedStyle(e).justifyContent));
        assert.ok(chips.every(j => j === 'center'), chips.join());
        // Una palabra larga entra en una línea dentro del aro.
        await page.evaluate(() => { document.getElementById('fs-palabra').textContent = 'contrabandista'; });
        await page.setViewportSize({width: 390, height: 640});
        await page.waitForTimeout(100);
        await page.setViewportSize({width: 390, height: 844});
        await page.waitForTimeout(100);
        const larga = await page.locator('#fs-palabra').evaluate(e => ({ancho: e.scrollWidth, libre: e.clientWidth, alto: e.offsetHeight, letra: parseFloat(getComputedStyle(e).fontSize)}));
        assert.ok(larga.ancho <= larga.libre && larga.alto < larga.letra * 1.5, JSON.stringify(larga));
        await page.waitForFunction(() => {
            const [m, s] = document.getElementById('fs-cuenta').textContent.split(':').map(Number);
            return m * 60 + s <= 58;
        }, null, {timeout: 4000});
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'Pausar');
        await page.locator('#musica-play').click();
        assert.equal(await page.evaluate(() => window.__ytFs.pausado), true);
        const congelada = await page.locator('#fs-cuenta').textContent();
        await page.waitForTimeout(700);
        assert.equal(await page.locator('#fs-cuenta').textContent(), congelada, 'en pausa el reloj no sigue');
        await page.locator('#musica-play').click();
        await page.waitForFunction(c => document.getElementById('fs-cuenta').textContent !== c, congelada);
        // Con un link, el mood sale del título del tema.
        assert.equal(await page.locator('#fs-efecto').getAttribute('data-mood'), 'sad');
        await page.waitForTimeout(400);
        assert.ok(await page.locator('#fs-efecto').evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }) > 1000, 'con link también hay luces');
        // Con un link el resplandor no late, y nunca se ve adentro del círculo.
        const golpesLink = await page.locator('#fs-efecto').getAttribute('data-golpes');
        await page.waitForTimeout(1500);
        assert.equal(await page.locator('#fs-efecto').getAttribute('data-golpes'), golpesLink, 'con link no late');
        const anillos = await page.evaluate(() => {
            const c = document.getElementById('fs-efecto'), caja = c.getBoundingClientRect(), aro = document.getElementById('fs-reloj').getBoundingClientRect();
            const escala = c.width / caja.width, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            const cx = aro.left + aro.width / 2 - caja.left, cy = aro.top + aro.height / 2 - caja.top, r = aro.width / 2;
            const suma = (desde, hasta) => { let total = 0; for (let a = 0; a < 360; a += 3) for (let k = desde; k <= hasta; k += 0.05) {
                const x = Math.round((cx + Math.cos(a * Math.PI / 180) * r * k) * escala), y = Math.round((cy + Math.sin(a * Math.PI / 180) * r * k) * escala);
                total += d[(y * c.width + x) * 4 + 3] || 0; } return total; };
            return { adentro: suma(0.75, 0.95), afuera: suma(1.05, 1.25) };
        });
        assert.ok(anillos.adentro * 4 < anillos.afuera, JSON.stringify(anillos));
        await page.screenshot({path: `capturas/freestyle-link-${tema}.png`});
        await page.locator('#musica-cerrar').click();
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        assert.equal(await page.locator('#fs-play').isVisible(), true);
        assert.equal(await page.locator('#fs-elegir').isVisible(), true);
        assert.equal(await page.locator('#fs-link').inputValue(), '');
        // Una playlist de YouTube: las flechas de la tarjeta pasan de canción.
        await page.evaluate(() => { document.getElementById('fs-link').value = 'https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG'; });
        await page.locator('#fs-pegar').click();
        await page.locator('#reproductor-titulo', {hasText: 'Beat de prueba'}).waitFor();
        assert.deepEqual(await page.evaluate(() => [window.__ytFsOpciones.listType, window.__ytFsOpciones.list]), ['playlist', 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG']);
        assert.equal(await page.locator('#musica-siguiente').getAttribute('aria-disabled'), 'false');
        await page.locator('#musica-siguiente').click();
        await page.locator('#reproductor-titulo', {hasText: 'Beat 2 de la playlist'}).waitFor();
        await page.locator('#musica-siguiente').click();
        await page.locator('#reproductor-titulo', {hasText: 'Beat 3 de la playlist'}).waitFor();
        await page.locator('#musica-anterior').click();
        await page.locator('#reproductor-titulo', {hasText: 'Beat 2 de la playlist'}).waitFor();
        await page.screenshot({path: `capturas/freestyle-playlist-${tema}.png`});
        await page.locator('#musica-cerrar').click();
        // El link corto de SoundCloud se resuelve igual que en Letras, y sigue habiendo un solo play.
        await page.evaluate(() => { delete window.SC; });
        await page.unroute('https://w.soundcloud.com/player/api.js').catch(() => {});
        await page.route('https://w.soundcloud.com/player/api.js', ruta => ruta.fulfill({contentType: 'text/javascript', body: `
            window.SC = { Widget: function (el) {
                const w = window.__scFs = { el, paused: true };
                w.bind = (ev, fn) => { w['on' + ev] = fn; };
                w.play = () => { w.paused = false; w.onPLAY?.(); };
                w.pause = () => { w.paused = true; w.onPAUSE?.(); };
                w.setVolume = () => {};
                w.getPosition = cb => cb(0);
                w.getDuration = cb => cb(180000);
                w.seekTo = () => {};
                w.getSounds = cb => cb([{}]);
                w.getCurrentSound = cb => cb({ title: 'Beat nube RAGE', artwork_url: 'https://i1.sndcdn.com/artworks-prueba-large.jpg' });
                setTimeout(() => w.onREADY?.());
                return w;
            } };
            window.SC.Widget.Events = { READY: 'READY', PLAY: 'PLAY', PAUSE: 'PAUSE', FINISH: 'FINISH', ERROR: 'ERROR', PLAY_PROGRESS: 'PLAY_PROGRESS' };`}));
        await page.route('https://i1.sndcdn.com/**', ruta => ruta.fulfill({path: path.join(__dirname, 'iconos/icono-192.png')}));
        await page.route('https://soundcloud.com/oembed**', ruta => ruta.fulfill({contentType: 'application/json', body: JSON.stringify({
            html: '<iframe src="https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F2416843668&amp;show_artwork=true"></iframe>',
        })}));
        await page.locator('#fs-link').fill('https://on.soundcloud.com/0T0WGNd6Vxu9Wam1NZ');
        await page.locator('#fs-link').press('Enter');
        await page.locator('#reproductor-titulo', {hasText: 'Beat nube'}).waitFor();
        const srcBeat = new URL(await page.locator('#reproductor-oculto iframe').getAttribute('src'));
        assert.equal(srcBeat.searchParams.get('url'), 'https://api.soundcloud.com/tracks/2416843668');
        assert.equal(await page.locator('#fs-play').isVisible(), false);
        assert.equal(await page.locator('#musica-play').isVisible(), true);
        const playsNube = await page.locator('#fs-play, #musica-play').evaluateAll(els => els.filter(e => e.getClientRects().length > 0).map(e => e.id));
        assert.deepEqual(playsNube, ['musica-play']);
        // SoundCloud arranca achicado (pedido de Swa); la flechita lo agranda.
        assert.equal(await page.locator('#reproductor-marco').isVisible(), false, 'SoundCloud arranca achicado');
        await page.locator('#musica-agrandar').click();
        const beatNube = await page.locator('#reproductor').boundingBox();
        const tabNube = await page.locator('#barra-pestanas').boundingBox();
        assert.ok(beatNube.y + beatNube.height <= tabNube.y + 1, JSON.stringify({beatNube, tabNube}));
        // En Freestyle, SoundCloud va en grande con la portada en el cuadro del video.
        assert.equal(await page.locator('#reproductor-marco img').getAttribute('src'), 'https://i1.sndcdn.com/artworks-prueba-t500x500.jpg');
        const portada = await page.locator('#reproductor-marco').boundingBox();
        assert.equal(Math.round(portada.width), 200);
        const bandejaNube = await page.locator('.bandeja-fs').boundingBox();
        const aireNube = beatNube.y - (bandejaNube.y + bandejaNube.height);
        assert.ok(aireNube >= 6 && aireNube <= 16, `aire entre bandeja y tarjeta: ${aireNube}`);
        assert.equal(await page.locator('#fs-efecto').getAttribute('data-mood'), 'rage');
        await page.screenshot({path: `capturas/freestyle-nube-${tema}.png`});
        // Achicarlo no lo pausa: vuelve al formato chico y sigue sonando.
        await page.locator('#musica-plegar').click();
        assert.equal(await page.locator('#reproductor-marco').isVisible(), false);
        assert.equal(await page.evaluate(() => window.__scFs.paused), false);
        assert.equal(Math.round((await page.locator('#musica-play').boundingBox()).width), 40);
        const bandejaChica = await page.locator('.bandeja-fs').boundingBox();
        const chica = await page.locator('#reproductor').boundingBox();
        assert.ok(chica.y - (bandejaChica.y + bandejaChica.height) <= 16, 'la bandeja baja con la tarjeta chica');
        await page.screenshot({path: `capturas/freestyle-nube-chico-${tema}.png`});
        await page.locator('#musica-agrandar').click();
        assert.equal(await page.locator('#reproductor-marco').isVisible(), true);
        assert.equal(await page.evaluate(() => window.__scFs.paused), false);
        await page.locator('#musica-cerrar').click();
        assert.equal(await page.locator('#fs-play').isVisible(), true);
        await page.unroute('https://soundcloud.com/oembed**').catch(() => {});
        // Recientes: los últimos (hasta 10), con el título acortado y de dónde vienen. El cajón llega como mucho al alto del reproductor.
        assert.equal((await page.locator('#fs-recientes-caja summary').textContent()).trim(), 'Recientes');
        // Arranca plegado: se abre tocándolo.
        assert.equal(await page.locator('#fs-recientes-caja').evaluate(d => d.open), false);
        await page.locator('#fs-recientes-caja summary').click();
        const cajonLleno = await page.locator('#fs-cajon').boundingBox();
        assert.ok(cajonLleno.height > 150 && cajonLleno.height <= 252, `alto del cajón con 3 recientes: ${cajonLleno.height}`);
        assert.ok(Math.abs(cajonLleno.y + cajonLleno.height - (844 - 86)) <= 2, 'pegado arriba de la barra');
        assert.deepEqual(await page.locator('#fs-recientes .usar-reciente').allTextContents(), [
            'Beat nube RAGE (SCLOUD)', 'Beat de prueba sad 88bpm (YT)', 'Beat de prueba sad 88bpm (YT)',
        ]);
        // Buscar: un beat del teléfono suena en el mismo reproductor y queda primero en recientes.
        await page.locator('#fs-archivo').setInputFiles(path.join(__dirname, 'beats/boom-bap-jazz.mp3'));
        await page.locator('#reproductor-titulo', {hasText: 'boom-bap-jazz'}).waitFor();
        assert.equal((await page.locator('#reproductor-fuente').textContent()).trim(), 'Del teléfono');
        assert.equal(await page.locator('#fs-play').isVisible(), false);
        await page.waitForFunction(() => document.querySelector('#reproductor-oculto audio')?.paused === false);
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'Pausar');
        await page.waitForFunction(() => document.getElementById('fs-cuenta').textContent !== '1:00');
        await page.screenshot({path: `capturas/freestyle-archivo-${tema}.png`});
        // Al terminarse el tiempo la canción sigue sonando, y el play de la bandeja empieza otra ronda con ella.
        await page.evaluate(() => { const ahora = performance.now.bind(performance); performance.now = () => ahora() + 120000; });
        await page.locator('#fs-palabra', {hasText: '¡Tiempo!'}).waitFor();
        await page.evaluate(() => { delete performance.now; });
        assert.equal(await page.evaluate(() => document.querySelector('#reproductor-oculto audio').paused), false);
        assert.equal(await page.locator('#fs-play').isVisible(), true);
        await page.locator('#fs-play').click();
        assert.equal(await page.locator('#fs-play').isVisible(), false);
        await page.waitForFunction(() => !['1:00', '0:00'].includes(document.getElementById('fs-cuenta').textContent));
        assert.equal(await page.evaluate(() => document.body.classList.contains('beat-sonando')), false);
        await page.locator('#musica-cerrar').click();
        assert.equal((await page.locator('#fs-recientes .usar-reciente').first().textContent()), 'boom-bap-jazz (CELULAR)');
        // Ya no se cae ninguno: entran hasta 10, y la lista se desliza sin agrandar el cajón.
        assert.equal(await page.locator('#fs-recientes .usar-reciente').count(), 4);
        assert.ok((await page.locator('#fs-cajon').boundingBox()).height <= 252);
        assert.equal(await page.locator('#fs-recientes').evaluate(e => getComputedStyle(e).overflowY), 'auto');
        // Tocar el reciente del teléfono lo vuelve a sacar de lo guardado.
        await page.locator('#fs-recientes .usar-reciente').first().click();
        await page.locator('#reproductor-titulo', {hasText: 'boom-bap-jazz'}).waitFor();
        // Elegir un reciente pliega la lista.
        assert.equal(await page.locator('#fs-recientes-caja').evaluate(d => d.open), false);
        await page.locator('#musica-cerrar').click();
        await page.locator('#fs-recientes-caja summary').click();
        // Plegar «Recientes» achica el cajón, que sigue pegado a la barra.
        const cajonAbierto = await page.locator('#fs-cajon').boundingBox();
        await page.locator('#fs-recientes-caja summary').click();
        const cajonPlegado = await page.locator('#fs-cajon').boundingBox();
        assert.ok(cajonPlegado.height < cajonAbierto.height - 80, `${cajonAbierto.height} -> ${cajonPlegado.height}`);
        assert.ok(Math.abs(cajonPlegado.y + cajonPlegado.height - (844 - 86)) <= 2, 'plegado sigue pegado a la barra');
        await page.locator('#fs-recientes-caja summary').click();
        // El título llega hasta el borde (se corta con «…») y la cruz borra el reciente.
        const filaReciente = await page.locator('#fs-recientes li').first().boundingBox();
        const cruzReciente = await page.locator('#fs-recientes .borrar-reciente').first().boundingBox();
        assert.ok(cruzReciente.x + cruzReciente.width >= filaReciente.x + filaReciente.width - 1, 'la cruz va al borde derecho');
        await page.screenshot({path: `capturas/freestyle-recientes-${tema}.png`});
        await page.locator('#fs-recientes .borrar-reciente').first().click();
        assert.equal(await page.locator('#fs-recientes .usar-reciente').count(), 3);
        assert.ok(!(await page.locator('#fs-recientes .usar-reciente').allTextContents()).some(t => t.includes('CELULAR')));

        // Cambiar de sección pliega «Recientes».
        assert.equal(await page.locator('#fs-recientes-caja').evaluate(d => d.open), true);
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
        assert.equal(await page.locator('#fs-recientes-caja').evaluate(d => d.open), false);

        for (const p of ['freestyle', 'ajustes']) {
            await page.locator(`#barra-pestanas [data-pestana="${p}"]`).click();
            assert.equal(await page.locator(`#pantalla-${p}`).isVisible(), true);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        await page.screenshot({path: `capturas/ajustes-${tema}.png`});
        // Apariencia: Oscuro y Claro mandan sobre el sistema, y se recuerda.
        const fondo = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fondo').trim());
        const fondoSistema = await fondo();
        await page.locator('button[data-apariencia="oscuro"]').click();
        assert.equal(await fondo(), '#18191b');
        await page.locator('button[data-apariencia="claro"]').click();
        assert.equal(await fondo(), '#eceff1');
        await page.reload();
        assert.equal(await fondo(), '#eceff1');
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        await page.locator('button[data-apariencia="sistema"]').click();
        assert.equal(await fondo(), fondoSistema);
        assert.equal(await page.locator('button[data-apariencia="sistema"]').getAttribute('aria-pressed'), 'true');

        // Métrica Extras: sin comprar hay publicidad y los temas de pago tienen candado.
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        assert.equal(await page.locator('#pantalla-rimas .publicidad').isVisible(), true);
        // Los temas están en la ruedita de la libreta.
        const abrirTemas = async () => {
            await page.locator('#barra-pestanas [data-pestana="letras"]').click();
            await page.locator('#nueva-letra').click();
            await page.locator('#abrir-ajustes-libreta').click();
        };
        const cerrarLibreta = async () => {
            await page.locator('#cerrar-ajustes-libreta').click();
            await page.locator('#editor-atras').click();
        };
        await abrirTemas();
        assert.equal(await page.locator('#temas-libreta .celda').count(), 6);
        assert.equal(await page.locator('#temas-libreta .marca-tema rect').count(), 4);
        await page.locator('[data-tema="pizarra"]').click();
        assert.equal(await page.locator('#paywall').isVisible(), true);
        assert.match(await page.locator('#comprar-extras').textContent(), /^Desbloquear por USD 4,99$/);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.waitForTimeout(400); // que termine de subir la hoja
        await page.screenshot({path: `capturas/paywall-${tema}.png`});
        await page.locator('#comprar-extras').scrollIntoViewIfNeeded();
        await page.screenshot({path: `capturas/paywall-abajo-${tema}.png`});
        await page.locator('#restaurar-compra').click();
        assert.match(await page.locator('#paywall-nota').textContent(), /No encontramos compras/);
        await page.locator('#cerrar-paywall').click();
        assert.equal(await page.locator('#paywall').isVisible(), false);
        assert.equal(await page.evaluate(() => document.body.dataset.libreta), 'gris');
        await cerrarLibreta();
        // Comprar: se va la publicidad, se desbloquean los temas y queda después de recargar.
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        await page.locator('.celda-extras').click();
        await page.locator('#comprar-extras').click();
        assert.equal(await page.locator('#comprar-extras').isDisabled(), true);
        await page.locator('#cerrar-paywall').click();
        // Con Extras, Ilimitado se puede elegir (sigue siendo la compra simulada).
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
        assert.equal(await page.locator('#fs-duraciones [data-duracion="ilimitado"]').getAttribute('aria-disabled'), null);
        await page.locator('#fs-duraciones [data-duracion="ilimitado"]').click();
        assert.equal(await page.locator('#paywall').isVisible(), false);
        assert.equal(await page.locator('#fs-duraciones [data-duracion="ilimitado"]').getAttribute('aria-checked'), 'true');
        assert.equal(await page.locator('#fs-cuenta').textContent(), '', 'Ilimitado sin el infinito');
        assert.equal(await page.locator('#fs-cuenta').isVisible(), false);
        await page.locator('#fs-duraciones [data-duracion="60"]').click();
        await abrirTemas();
        await page.locator('[data-tema="pizarra"]').click();
        assert.equal(await page.locator('#paywall').isVisible(), false);
        assert.equal(await page.locator('#temas-libreta .marca-tema rect').count(), 0);
        await page.screenshot({path: `capturas/ajustes-libreta-temas-${tema}.png`});
        await cerrarLibreta();
        await page.reload();
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        assert.match(await page.locator('#estado-extras').textContent(), /Comprado/);
        await page.screenshot({path: `capturas/ajustes-extras-${tema}.png`, fullPage: true});
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        assert.equal(await page.locator('#pantalla-rimas .publicidad').isVisible(), false);
        await page.locator('#barra-pestanas [data-pestana="letras"]').click();
        await page.locator('#nueva-letra').click();
        await page.locator('#editor-texto').fill('Pizarra con tiza\ny una sonrisa');
        assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('vista-editor')).backgroundColor), 'rgb(36, 51, 44)');
        await page.screenshot({path: `capturas/editor-pizarra-${tema}.png`});
        await page.locator('#abrir-ajustes-libreta').click();
        await page.locator('#borrar-letra').click();
        await page.locator('#aceptar-borrado').click();
        // Volver a la versión gratis: el tema de pago vuelve a gris y vuelve la publicidad.
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        await page.locator('#borrar-compra').click();
        assert.equal(await page.evaluate(() => document.body.dataset.libreta), 'gris');
        await abrirTemas();
        assert.equal(await page.locator('#temas-libreta .marca-tema rect').count(), 4);
        await cerrarLibreta();

        // Sin internet: recarga desde el service worker y anda todo.
        await page.context().setOffline(true);
        await page.reload();
        assert.equal(await page.locator('#pantalla-letras').isVisible(), true);
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        await page.locator('#buscar-rima').fill('luna');
        assert.ok((await page.locator('#resultados-rimas .celda').allTextContents()).includes('fortuna'));
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
        await page.locator('#fs-play').click();
        await page.locator('#fs-palabra .tonica').waitFor();
        await pararFs();
        await page.locator('#barra-pestanas [data-pestana="letras"]').click();
        await page.locator('#nueva-letra').click();
        await page.locator('#editor-titulo').fill('Sin internet');
        await page.locator('#editor-atras').click();
        assert.deepEqual(await page.locator('#lista-letras .titulo-letra').allTextContents(), ['Sin internet']);
        await page.context().setOffline(false);

        // Versión nueva publicada: la app la baja y se recarga sola, sin perder las letras.
        versionNueva = `\n// prueba ${tema}`;
        const recarga = page.waitForEvent('load');
        await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
        await recarga;
        assert.deepEqual(await page.locator('#lista-letras .titulo-letra').allTextContents(), ['Sin internet']);
        versionNueva = '';

        // Ajustes muestra la versión, y la flecha fuerza a bajarla de nuevo sin perder las letras.
        const version = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8').match(/const VERSION = 'metrica-([^']+)'/)[1];
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        await page.waitForFunction(v => document.getElementById('version').textContent === v, version);
        await page.screenshot({path: `capturas/ajustes-version-${tema}.png`});
        // Con versión nueva publicada, la flecha la baja y recarga.
        versionNueva = `\n// prueba forzada ${tema}`;
        const recargaForzada = page.waitForEvent('load');
        await page.locator('#forzar-actualizacion').click();
        await recargaForzada;
        await page.evaluate(() => navigator.serviceWorker.ready);
        // Sin versión nueva, avisa que ya está al día y no recarga.
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        await page.locator('#forzar-actualizacion').click();
        await page.waitForFunction(() => document.getElementById('version').textContent === 'Ya tenés la última');
        assert.equal(await page.locator('#forzar-actualizacion.girando').count(), 0);
        await page.waitForFunction(v => document.getElementById('version').textContent === v, version);
        versionNueva = '';
        await page.locator('#barra-pestanas [data-pestana="letras"]').click();
        assert.deepEqual(await page.locator('#lista-letras .titulo-letra').allTextContents(), ['Sin internet']);

        assert.deepEqual(errores, []);
        await page.close();
    }
    await browser.close();
    servidor.close();
    console.log('OK app: pestañas, editor, rimas, palabras, ajustes, claro/oscuro, sin desborde y sin internet.');
})().catch(e => { console.error(e); process.exit(1); });
