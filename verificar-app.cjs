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
        await page.screenshot({path: `capturas/editor-${tema}.png`});
        // Con el teclado abierto (se ven 500 px), la barra de sugerencias queda justo arriba.
        await page.evaluate(() => document.documentElement.style.setProperty('--alto-visible', '500px'));
        const barra = await page.locator('#sugerencias').boundingBox();
        assert.equal(Math.round(barra.y + barra.height), 500);
        await page.screenshot({path: `capturas/editor-teclado-${tema}.png`});
        await page.evaluate(() => navigator.userAgent && document.documentElement.style.setProperty('--alto-visible', innerHeight + 'px'));
        await page.locator('#editor-atras').click();
        assert.equal(await page.locator('#barra-pestanas').isVisible(), true);

        // La letra queda guardada, también después de recargar.
        assert.deepEqual(await page.locator('#lista-letras .celda-boton span').allTextContents(), ['Sacred Geometry', 'Caminante, no hay camino,']);
        await page.reload();
        assert.equal(await page.locator('#lista-letras .celda').count(), 1);
        await page.screenshot({path: `capturas/letras-guardadas-${tema}.png`});
        await page.locator('#lista-letras .celda-boton').click();
        assert.match(await page.locator('#editor-texto').inputValue(), /^Caminante[\s\S]*detrás$/);
        assert.equal(await page.locator('#editor-fondo mark').count(), 5);
        page.once('dialog', d => d.accept());
        await page.locator('#borrar-letra').click();
        assert.equal(await page.locator('#letras-vacio').isVisible(), true);
        assert.equal(await page.locator('#lista-letras .celda').count(), 0);

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
        assert.deepEqual(await page.locator('#lista-letras .celda-boton span:first-child').allTextContents(), ['Sin internet']);
        await page.context().setOffline(false);

        // Versión nueva publicada: la app la baja y se recarga sola, sin perder las letras.
        versionNueva = `\n// prueba ${tema}`;
        const recarga = page.waitForEvent('load');
        await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
        await recarga;
        assert.deepEqual(await page.locator('#lista-letras .celda-boton span:first-child').allTextContents(), ['Sin internet']);
        versionNueva = '';

        assert.deepEqual(errores, []);
        await page.close();
    }
    await browser.close();
    servidor.close();
    console.log('OK app: pestañas, editor, rimas, palabras, ajustes, claro/oscuro, sin desborde y sin internet.');
})().catch(e => { console.error(e); process.exit(1); });
