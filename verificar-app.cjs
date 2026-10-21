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
            ['rima-0:camino', 'rima-1:andar', 'rima-0:camino', 'rima-1:atrás']);
        assert.ok((await page.locator('.sugerencia').allTextContents()).includes('detrás'));
        await page.locator('#editor-texto').press('Enter');
        await page.locator('.sugerencia', {hasText: /^detrás$/}).click();
        assert.match(await page.locator('#editor-texto').inputValue(), /atrás\ndetrás$/);
        assert.equal(await page.locator('#editor-fondo mark').count(), 5);
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
        assert.match(await page.locator('#editor-texto').inputValue(), /\n\[Estribillo\]\nverso nuevo$/);
        assert.equal(await page.locator('#editor-fondo mark.seccion').textContent(), '[Estribillo]');
        assert.deepEqual((await page.locator('#silabas div').allTextContents()).slice(-2), ['', '4']);
        await page.screenshot({path: `capturas/editor-seccion-${tema}.png`});
        await page.locator('#editor-texto').evaluate((t, v) => { t.value = v; t.dispatchEvent(new Event('input')); }, original);
        // Los renglones llegan hasta abajo aunque la letra sea larga.
        await page.locator('#editor-texto').evaluate(t => { t.value += '\nverso'.repeat(40); t.dispatchEvent(new Event('input')); });
        assert.ok(await page.evaluate(() => document.querySelector('.editor-capas').offsetHeight >= document.querySelector('#editor-texto').offsetHeight));
        await page.locator('#editor-texto').evaluate((t, v) => { t.value = v; t.dispatchEvent(new Event('input')); }, original);
        await page.screenshot({path: `capturas/editor-${tema}.png`});
        // Con el teclado abierto (se ven 500 px), la barra de sugerencias queda pegada arriba.
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
        // Los renglones arrancan prendidos y se apagan.
        assert.match(await page.locator('.editor-capas').evaluate(e => getComputedStyle(e).backgroundImage), /repeating-linear-gradient/);
        await page.locator('#alternar-renglones').click();
        assert.equal(await page.locator('.editor-capas').evaluate(e => getComputedStyle(e).backgroundImage), 'none');
        await page.locator('#alternar-renglones').click();
        // Apagar las sílabas se recuerda después de recargar.
        await page.locator('#alternar-silabas').click();
        await page.locator('#editor-atras').click();
        assert.equal(await page.locator('#barra-pestanas').isVisible(), true);
        await page.reload();
        await page.locator('#lista-letras .tarjeta-letra button').click();
        assert.equal(await page.locator('#alternar-silabas').getAttribute('aria-pressed'), 'false');
        assert.equal(await page.locator('#silabas').isVisible(), false);
        await page.locator('#alternar-silabas').click();
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
        page.once('dialog', d => d.accept());
        await page.locator('#borrar-letra').click();
        assert.equal(await page.locator('#letras-vacio').isVisible(), true);
        assert.equal(await page.locator('#lista-letras .tarjeta-letra').count(), 0);

        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        await page.locator('#buscar-rima').fill('canción');
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
        await page.screenshot({path: `capturas/rimas-asonante-${tema}.png`});
        // Favoritas: la estrella guarda la palabra y aparece sin búsqueda.
        const primera = asonantes[0];
        await page.locator('#resultados-rimas .estrella').first().click();
        assert.equal(await page.locator('#resultados-rimas .estrella').first().getAttribute('aria-pressed'), 'true');
        await page.locator('#buscar-rima').fill('');
        assert.equal(await page.locator('#encabezado-favoritas').isVisible(), true);
        assert.deepEqual(await page.locator('#resultados-rimas .celda').allTextContents(), [primera]);
        await page.screenshot({path: `capturas/favoritas-${tema}.png`});
        await page.locator('#resultados-rimas .celda-boton').first().click();
        assert.equal(await page.locator('#buscar-rima').inputValue(), primera);
        await page.locator('#buscar-rima').fill('xyz');
        assert.match(await page.locator('#rimas-vacio').textContent(), /No encontré rimas asonantes/);
        await page.locator('#tipo-rima [data-tipo="consonante"]').click();

        await page.locator('#barra-pestanas [data-pestana="palabras"]').click();
        assert.equal(await page.locator('.palabra').count(), 6);
        await page.locator('#pausar-palabras').click();
        const tocada = await page.locator('.palabra').first().textContent();
        await page.locator('.palabra').first().click();
        assert.equal(await page.locator('.palabra').first().getAttribute('aria-pressed'), 'true');
        await page.locator('#pausar-palabras').click();
        await page.locator('#terminacion').fill('ción');
        assert.ok((await page.locator('.palabra').allTextContents()).every(p => p.endsWith('ción')));
        await page.locator('#terminacion').fill('');
        await page.locator('#palabras-simples').check();
        assert.equal(await page.locator('#palabras-total').textContent(), '20.000 palabras disponibles');
        await page.screenshot({path: `capturas/palabras-${tema}.png`});

        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        await page.locator('#buscar-rima').fill('');
        assert.equal((await page.locator('#resultados-rimas .celda').allTextContents())[0], tocada);

        // Freestyle: el beat avanza, la palabra cambia cada compás y tiene la tónica marcada.
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
        assert.deepEqual(await page.locator('#fs-beat option').allTextContents(), ['Boom bap', 'Trap', 'Metrónomo']);
        await page.locator('#fs-bpm').fill('140');
        assert.equal(await page.locator('#fs-bpm-valor').textContent(), '140 BPM');
        await page.locator('#fs-compases').selectOption('1');
        await page.locator('#fs-empezar').click();
        assert.equal(await page.locator('#fs-empezar').textContent(), 'Parar');
        await page.locator('#fs-palabra .tonica').waitFor();
        const palabra1 = await page.locator('#fs-palabra').textContent();
        assert.equal(await page.locator('#fs-tiempos .activo').count(), 1);
        assert.match(await page.locator('#fs-proxima').textContent(), /^Después: /);
        await page.waitForFunction(p => document.getElementById('fs-palabra').textContent !== p, palabra1, {timeout: 4000});
        assert.match(await page.locator('#fs-reloj').textContent(), /^0:5\d$/);
        await page.screenshot({path: `capturas/freestyle-${tema}.png`});
        await page.locator('#fs-empezar').click();
        assert.equal(await page.locator('#fs-empezar').textContent(), 'Empezar');
        assert.equal(await page.locator('#fs-tiempos .activo').count(), 0);

        for (const p of ['freestyle', 'ajustes']) {
            await page.locator(`#barra-pestanas [data-pestana="${p}"]`).click();
            assert.equal(await page.locator(`#pantalla-${p}`).isVisible(), true);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        await page.screenshot({path: `capturas/ajustes-${tema}.png`});

        // Métrica Extras: sin comprar hay publicidad y los temas de pago tienen candado.
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        assert.equal(await page.locator('#pantalla-rimas .publicidad').isVisible(), true);
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
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
        // Comprar: se va la publicidad, se desbloquean los temas y queda después de recargar.
        await page.locator('.celda-extras').click();
        await page.locator('#comprar-extras').click();
        assert.equal(await page.locator('#comprar-extras').isDisabled(), true);
        await page.locator('#cerrar-paywall').click();
        await page.locator('[data-tema="pizarra"]').click();
        assert.equal(await page.locator('#paywall').isVisible(), false);
        assert.equal(await page.locator('#temas-libreta .marca-tema rect').count(), 0);
        await page.reload();
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        assert.match(await page.locator('#estado-extras').textContent(), /Comprado/);
        await page.screenshot({path: `capturas/ajustes-extras-${tema}.png`, fullPage: true});
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        assert.equal(await page.locator('#pantalla-rimas .publicidad').isVisible(), false);
        await page.locator('#barra-pestanas [data-pestana="letras"]').click();
        await page.locator('#nueva-letra').click();
        await page.locator('#editor-texto').fill('Pizarra con tiza\ny una sonrisa');
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(36, 51, 44)');
        await page.screenshot({path: `capturas/editor-pizarra-${tema}.png`});
        page.once('dialog', d => d.accept());
        await page.locator('#borrar-letra').click();
        // Volver a la versión gratis: el tema de pago vuelve a gris y vuelve la publicidad.
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        await page.locator('#borrar-compra').click();
        assert.equal(await page.evaluate(() => document.body.dataset.libreta), 'gris');
        assert.equal(await page.locator('#temas-libreta .marca-tema rect').count(), 4);

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

        assert.deepEqual(errores, []);
        await page.close();
    }
    await browser.close();
    servidor.close();
    console.log('OK app: pestañas, editor, rimas, palabras, ajustes, claro/oscuro, sin desborde y sin internet.');
})().catch(e => { console.error(e); process.exit(1); });
