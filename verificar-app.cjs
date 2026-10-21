// Prueba la app en un navegador a ancho de iPhone (390x844), claro y oscuro.
// Uso: node verificar-app.cjs  (necesita playwright instalado)
const {chromium} = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const tipos = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.md': 'text/plain'};
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

        assert.equal(await page.locator('#pantalla-letras').isVisible(), true);
        assert.equal(await page.locator('#letras-vacio').isVisible(), true);
        await page.screenshot({path: `capturas/letras-${tema}.png`});

        await page.locator('#nueva-letra').click();
        assert.equal(await page.locator('#vista-editor').isVisible(), true);
        assert.equal(await page.locator('#barra-pestanas').isVisible(), false);
        await page.locator('#editor-titulo').fill('Sacred Geometry');
        await page.locator('#editor-texto').fill('Caminante, no hay camino,\nse hace camino al andar.\nAl andar se hace camino\ny al volver la vista atrás');
        assert.deepEqual(await page.locator('#silabas div').allTextContents(), ['8', '8', '8', '8']);
        assert.deepEqual(await page.locator('#editor-fondo mark').evaluateAll(ms => ms.map(m => m.className + ':' + m.textContent)),
            ['rima-0:mino', 'rima-1 suave:dar', 'rima-0:mino', 'rima-1 suave:trás']);
        // Mientras se escribe no hay sugerencias: aparecen solo al tocar una palabra.
        assert.equal(await page.locator('#sugerencias').isVisible(), false);
        await page.locator('#editor-texto').evaluate(t => { t.value += '\ndetrás'; t.dispatchEvent(new Event('input')); });
        assert.match(await page.locator('#editor-texto').inputValue(), /atrás\ndetrás$/);
        assert.equal(await page.locator('#editor-fondo mark').count(), 5);
        // Con «detrás», «atrás» pasa a rimar consonante (fondo lleno); «andar» sigue asonante (suave).
        assert.deepEqual(await page.locator('#editor-fondo mark').evaluateAll(ms => ms.map(m => m.className)),
            ['rima-0', 'rima-1 suave', 'rima-0', 'rima-1', 'rima-1']);
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
        assert.ok(versos[1] - versos[0] >= 46, 'el verso largo ocupa dos renglones');
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
        await page.locator('#link-musica').fill('https://spotify.com/track/1');
        await page.locator('#escuchar-musica').click();
        assert.match(await page.locator('#musica-aviso').textContent(), /no es de YouTube ni de SoundCloud/);
        // Con un link de YouTube aparece el banner (acá con un YouTube de mentira, sin internet).
        await page.route('https://www.youtube.com/iframe_api', ruta => ruta.fulfill({contentType: 'text/javascript', body: `
            window.YT = { PlayerState: { PLAYING: 1 }, Player: function (lugar, o) {
                const p = window.__yt = this; p.t = 30; p.vol = 0;
                p.setVolume = v => { p.vol = v; };
                p.playVideo = () => o.events.onStateChange({ data: 1 });
                p.pauseVideo = () => o.events.onStateChange({ data: 2 });
                p.getVideoData = () => ({ title: 'Tema de prueba' });
                p.getCurrentTime = () => p.t; p.getDuration = () => 200; p.seekTo = s => { p.t = s; };
                p.destroy = () => { window.__ytCerrado = true; };
                setTimeout(() => o.events.onReady({ target: p }));
            } };
            setTimeout(() => onYouTubeIframeAPIReady());`}));
        await page.locator('#link-musica').fill('https://youtu.be/dQw4w9WgXcQ');
        await page.locator('#escuchar-musica').click();
        assert.equal(await page.locator('#hoja-musica').isVisible(), false);
        await page.locator('#reproductor-titulo', {hasText: 'Tema de prueba'}).waitFor();
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'Pausar');
        assert.equal(await page.evaluate(() => window.__yt.vol), 70);
        await page.locator('#musica-play').click();
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'Reproducir');
        await page.locator('#musica-adelantar').click();
        assert.equal(await page.evaluate(() => window.__yt.t), 40);
        await page.locator('#musica-atrasar').click();
        await page.locator('#musica-atrasar').click();
        assert.equal(await page.evaluate(() => window.__yt.t), 20);
        await page.locator('#musica-subir').click();
        assert.equal(await page.evaluate(() => window.__yt.vol), 80);
        assert.match(await page.locator('#reproductor-fuente').textContent(), /YouTube · volumen 80%/);
        // El banner queda abajo, adentro de la pantalla y sin tapar el texto.
        const banner = await page.locator('#reproductor').boundingBox();
        assert.ok(banner.y + banner.height <= 844 && banner.y > 600, JSON.stringify(banner));
        await page.screenshot({path: `capturas/editor-musica-${tema}.png`});
        await page.locator('#musica-cerrar').click();
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        assert.equal(await page.evaluate(() => window.__ytCerrado), true);
        // Sin internet, avisa.
        await page.context().setOffline(true);
        await page.locator('#abrir-musica').click();
        assert.match(await page.locator('#musica-aviso').textContent(), /Sin internet/);
        await page.locator('#cerrar-musica').click();
        await page.context().setOffline(false);
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
        await escribir('tengo un camino y un destino\nla luna me mira\nvengo de lejos');
        assert.deepEqual(await marcas(), ['rima-0:tengo', 'rima-1:mino', 'rima-1:tino', 'rima-0:vengo']);
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
        assert.deepEqual(await marcas(), ['rima-0:mino', 'rima-0:tino'], 'a 2 versos, tengo y vengo quedan lejos');
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
        assert.equal(await page.locator('.fila-deslizador').count(), 3);
        assert.equal(await page.locator('.fila-deslizador').first().locator('.puntos-deslizador span').count(), 10);
        assert.equal(await page.locator('input[data-ajuste="tamano"]').inputValue(), '4');
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
        assert.equal(await page.locator('#editor-fondo mark').count(), 5);
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

        // Freestyle: el beat avanza, la palabra cambia y tiene la tónica marcada; el aro se carga.
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
        assert.deepEqual(await page.locator('#fs-beat option').allTextContents(), ['Boom bap', 'Trap', 'Metrónomo']);
        assert.equal(await page.locator('#fs-compases').count(), 0);
        await page.locator('#fs-bpm').fill('140');
        assert.equal(await page.locator('#fs-bpm-valor').textContent(), '140 BPM');
        await page.locator('#fs-empezar').click();
        assert.equal(await page.locator('#fs-empezar').textContent(), 'Parar');
        await page.locator('#fs-palabra .tonica').waitFor();
        const palabra1 = await page.locator('#fs-palabra').textContent();
        assert.equal(await page.locator('#fs-tiempos .activo').count(), 1);
        assert.match(await page.locator('#fs-proxima').textContent(), /^Después: /);
        await page.waitForFunction(p => document.getElementById('fs-palabra').textContent !== p, palabra1, {timeout: 6000});
        assert.match(await page.locator('#fs-reloj').textContent(), /^0:5\d$/);
        assert.ok(Number(await page.locator('#fs-reloj').evaluate(r => r.style.getPropertyValue('--avance'))) > 0);
        await page.screenshot({path: `capturas/freestyle-${tema}.png`});
        await page.locator('#fs-empezar').click();
        assert.equal(await page.locator('#fs-empezar').textContent(), 'Empezar');
        assert.equal(await page.locator('#fs-tiempos .activo').count(), 0);
        // El botón de al lado del tempo lo vuelve a 90.
        await page.locator('#fs-bpm-reiniciar').click();
        assert.equal(await page.locator('#fs-bpm').inputValue(), '90');
        assert.equal(await page.locator('#fs-bpm-valor').textContent(), '90 BPM');

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
        await page.locator('#fs-empezar').click();
        await page.locator('#fs-palabra .tonica').waitFor();
        await page.locator('#fs-empezar').click();
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
