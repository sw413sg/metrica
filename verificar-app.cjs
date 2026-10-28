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
// Arma un .zip como el de Google Takeout (deflate), para probar la importación de Keep.
function armarZip(archivos) {
    const zlib = require('node:zlib');
    const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
    const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
    const partes = [], indice = [];
    let lugar = 0;
    for (const [nombre, texto] of Object.entries(archivos)) {
        const n = Buffer.from(nombre), crudo = Buffer.from(texto), datos = zlib.deflateRawSync(crudo);
        const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(8), u32(0), u32(0), u32(datos.length), u32(crudo.length), u16(n.length), u16(0), n]);
        indice.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u32(0), u32(0), u32(datos.length), u32(crudo.length), u16(n.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(lugar), n]));
        partes.push(local, datos);
        lugar += local.length + datos.length;
    }
    const i = Buffer.concat(indice);
    return Buffer.concat([...partes, i, u32(0x06054b50), u16(0), u16(0), u16(indice.length), u16(indice.length), u32(i.length), u32(lugar), u16(0)]);
}
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
        // Grabaciones: cada una en una fila con el play, el título con la barra abajo (comienzo
        // y final, sin la fecha ni la hora) y descargar y borrar (pedido de Swa).
        await page.evaluate(() => new Promise((listo, error) => {
            const pedido = indexedDB.open('metrica-grabaciones', 1);
            pedido.onupgradeneeded = () => pedido.result.createObjectStore('grabaciones', { keyPath: 'id' });
            pedido.onsuccess = () => {
                const t = pedido.result.transaction('grabaciones', 'readwrite');
                t.objectStore('grabaciones').put({ id: 'prueba-1', nombre: 'Freestyle 4 - PRESSURE 1+1', titulo: 'Boombap 1', fecha: Date.now(), duracion: 7, tipo: 'beat', voz: new Blob() });
                t.objectStore('grabaciones').put({ id: 'prueba-2', nombre: 'Si sabíamos - skin', titulo: 'Boombap 1', fecha: Date.now() - 1000, duracion: 36, tipo: 'beat', voz: new Blob() });
                for (let n = 3; n <= 6; n++) t.objectStore('grabaciones').put({ id: `prueba-${n}`, nombre: `Freestyle ${n}`, titulo: 'Trap 1', fecha: Date.now() - n * 1000, duracion: 10, tipo: 'beat', voz: new Blob() });
                t.oncomplete = () => listo();
                t.onerror = () => error(t.error);
            };
        }));
        await page.locator('#pantalla-letras [data-grabaciones]').click();
        await page.locator('#lista-grabaciones .grabacion').first().waitFor();
        assert.equal(await page.locator('#lista-grabaciones .grabacion').count(), 6);
        // Se ven 4 como mucho: las demás, deslizando la lista (pedido de Swa).
        const listaGrab = await page.locator('#lista-grabaciones').evaluate(e => ({ alto: e.clientHeight, total: e.scrollHeight, fila: e.querySelector('.grabacion').offsetHeight }));
        assert.ok(listaGrab.total > listaGrab.alto && Math.abs(listaGrab.alto - 4 * (listaGrab.fila + 10)) <= 2, JSON.stringify(listaGrab));
        const filaGrab = page.locator('#lista-grabaciones .grabacion').first();
        assert.equal(await filaGrab.locator('.detalle-grabacion').isVisible(), false);
        assert.deepEqual(await filaGrab.locator('.reproductor-tiempo').allTextContents(), ['0:00', '0:07']);
        const tituloGrab = await filaGrab.locator('.titulo-grabacion').boundingBox();
        const barraGrab = await filaGrab.locator('.reproductor-barra').boundingBox();
        const playGrab = await filaGrab.locator('.boton-play').boundingBox();
        const tachoGrab = await filaGrab.locator('.borrar-grabacion').boundingBox();
        assert.ok(barraGrab.y > tituloGrab.y && barraGrab.x >= tituloGrab.x - 1 && barraGrab.x > playGrab.x + playGrab.width, JSON.stringify({tituloGrab, barraGrab, playGrab}));
        assert.ok(barraGrab.x + barraGrab.width < tachoGrab.x, 'la barra no pasa por abajo de descargar y borrar');
        // Como la foto de Swa: las cajas y los volúmenes, grises y sin el borde de vidrio.
        for (const sel of ['#lista-grabaciones .grabacion', '#volumenes-grabaciones', '#cerrar-grabaciones'])
            assert.equal(await page.locator(sel).first().evaluate(e => getComputedStyle(e).borderTopWidth), '0px', sel);
        await page.waitForTimeout(500);
        await page.screenshot({path: `capturas/grabaciones-${tema}.png`});
        await page.locator('#cerrar-grabaciones').click();
        await page.evaluate(() => new Promise(listo => { const b = indexedDB.deleteDatabase('metrica-grabaciones'); b.onsuccess = b.onerror = b.onblocked = () => listo(); }));
        // La nota musical, a la izquierda de Grabaciones, abre el cajón arriba de la barra de pestañas.
        const notaLetras = await page.locator('#abrir-musica-letras').boundingBox();
        assert.ok(notaLetras.x < (await page.locator('#pantalla-letras [data-grabaciones]').boundingBox()).x);
        await page.locator('#abrir-musica-letras').click();
        assert.equal(await page.locator('#hoja-musica').isVisible(), true);
        await page.waitForTimeout(300);
        const cajonLetras = await page.locator('#fs-cajon').boundingBox();
        const barraLetras = await page.locator('#barra-pestanas').boundingBox();
        assert.ok(cajonLetras.y + cajonLetras.height <= barraLetras.y, JSON.stringify({cajonLetras, barraLetras}));
        await page.screenshot({path: `capturas/letras-musica-${tema}.png`});
        await page.mouse.click(200, 150);
        assert.equal(await page.locator('#hoja-musica').isVisible(), false);

        // Baúl de frases: anotar, editar en la tarjeta, marcar como usada desde el menú y buscar.
        await page.locator('#abrir-baul').click();
        assert.equal(await page.locator('#vista-baul').isVisible(), true);
        for (const frase of ['barrio de cemento, corazón de madera', 'mi vieja me dijo que no afloje']) {
            await page.locator('#baul-texto').fill(frase);
            await page.locator('#baul-guardar').click();
        }
        assert.deepEqual(await page.locator('#baul-frases .texto-frase').allTextContents(), ['mi vieja me dijo que no afloje', 'barrio de cemento, corazón de madera']);
        await page.locator('#baul-frases .tarjeta-frase').first().click();
        await page.keyboard.type(' jamás');
        await page.locator('#vista-baul .titulo-grande').click();
        assert.equal(await page.locator('#baul-frases .texto-frase').first().textContent(), 'mi vieja me dijo que no afloje jamás');
        const cajaFrase = await page.locator('#baul-frases .tarjeta-frase').last().boundingBox();
        await page.mouse.move(cajaFrase.x + 20, cajaFrase.y + 20);
        await page.mouse.down();
        await page.waitForTimeout(600);
        await page.mouse.up();
        assert.equal(await page.locator('#baul-menu').isVisible(), true);
        await page.screenshot({path: `capturas/baul-menu-${tema}.png`});
        await page.locator('#baul-usada').click();
        assert.equal(await page.locator('#baul-frases .check-usada').count(), 1);
        await page.locator('#baul-abrir-busqueda').click();
        await page.locator('#baul-buscar').fill('corazon');
        assert.equal(await page.locator('#baul-frases .tarjeta-frase').count(), 1);
        await page.screenshot({path: `capturas/baul-${tema}.png`});
        await page.locator('#baul-abrir-busqueda').click();
        // La estrella de «¿Por dónde empiezo?» también está en el baúl, a la izquierda del pincel;
        // mandar la consigna la deja en el campo de anotar.
        const estrella = await page.locator('#baul-abrir-tema').boundingBox();
        const pincel = await page.locator('#baul-abrir-ajustes').boundingBox();
        const lupa = await page.locator('#baul-abrir-busqueda').boundingBox();
        assert.ok(estrella.x < pincel.x && pincel.x < lupa.x);
        await page.locator('#baul-abrir-tema').click();
        assert.equal(await page.locator('#hoja-tema').isVisible(), true);
        await page.locator('#tema-nota').click();
        assert.equal(await page.locator('#hoja-tema').isVisible(), false);
        assert.ok((await page.locator('#baul-texto').inputValue()).length > 0);
        await page.locator('#baul-texto').fill('');
        await page.locator('#baul-atras').click();
        await page.evaluate(() => localStorage.removeItem('metrica.frases'));

        await page.locator('#nueva-letra').click();
        assert.equal(await page.locator('#vista-editor').isVisible(), true);
        assert.equal(await page.locator('#barra-pestanas').isVisible(), false);
        // Dame un tema: la hoja abre, Otra cambia, el filtro se queda y el ícono del final la manda a la nota.
        assert.equal(await page.locator('#dame-tema').isVisible(), true);
        assert.equal(await page.locator('#dame-tema').textContent(), '✦ ¿Por dónde empiezo?');
        assert.equal(await page.locator('#abrir-tema-libreta').isVisible(), false);
        await page.locator('#dame-tema').click();
        assert.equal(await page.locator('#hoja-tema').isVisible(), true);
        assert.deepEqual((await page.locator('#chips-tema button').allTextContents()).slice(0, 5), ['Amor', 'Superación', 'Fiesta', 'Nostalgia', 'Calle']);
        assert.equal(await page.locator('#chips-tema button').last().textContent(), 'Todas');
        assert.equal(await page.locator('#chips-tema button[aria-pressed="true"]').textContent(), 'Amor');
        assert.match(await page.locator('#tema-categoria').textContent(), /^Amor \d+ de 204$/);
        // Desamor: solo en Amor, prendido muestra esas y apagado vuelve a Amor.
        await page.locator('#tema-desamor').click();
        assert.match(await page.locator('#tema-categoria').textContent(), /^Desamor \d+ de 396$/);
        await page.locator('#tema-desamor').click();
        assert.match(await page.locator('#tema-categoria').textContent(), /^Amor \d+ de 204$/);
        await page.locator('#chips-tema button[data-categoria="nostalgia"]').click();
        assert.equal(await page.locator('#tema-desamor').isVisible(), false);
        assert.match(await page.locator('#tema-categoria').textContent(), /^Nostalgia \d+ de 150$/);
        for (let i = 0; i < 20 && !(await page.locator('#tema-empujon').isVisible()); i++) await page.locator('#tema-otra').click();
        await page.screenshot({path: `capturas/tema-${tema}.png`});
        const temaAntes = await page.locator('#tema-frase').textContent();
        await page.locator('#tema-otra').click();
        const consigna = await page.locator('#tema-frase').textContent();
        assert.notEqual(consigna, temaAntes);
        // La flecha vuelve a la anterior y el refrescar avanza otra vez a la misma.
        await page.locator('#tema-anterior').click();
        assert.equal(await page.locator('#tema-frase').textContent(), temaAntes);
        await page.locator('#tema-otra').click();
        assert.equal(await page.locator('#tema-frase').textContent(), consigna);
        assert.match(await page.locator('#tema-categoria').textContent(), /^Nostalgia \d+ de 150$/);
        await page.locator('#tema-baul').click();
        assert.equal(await page.locator('#tema-baul-texto').textContent(), 'En el baúl');
        assert.ok(await page.evaluate(t => JSON.parse(localStorage.getItem('metrica.frases')).some(f => f.texto === t), consigna));
        // Tocarlo de nuevo la saca del baúl.
        await page.locator('#tema-baul').click();
        assert.equal(await page.locator('#tema-baul-texto').textContent(), 'Al baúl');
        assert.ok(!(await page.evaluate(t => JSON.parse(localStorage.getItem('metrica.frases')).some(f => f.texto === t), consigna)));
        await page.locator('#tema-baul').click();
        await page.locator('#tema-nota').click();
        assert.equal(await page.locator('#hoja-tema').isVisible(), false);
        assert.equal((await page.locator('#editor-texto').inputValue()).split('\n')[0], consigna);
        assert.equal(await page.locator('#dame-tema').isVisible(), false);
        // Con algo escrito, la estrella de arriba abre la misma hoja.
        assert.equal(await page.locator('#abrir-tema-libreta').isVisible(), true);
        await page.locator('#abrir-tema-libreta').click();
        assert.equal(await page.locator('#hoja-tema').isVisible(), true);
        await page.locator('#hoja-tema').click({ position: { x: 20, y: 20 } });
        assert.equal(await page.locator('#hoja-tema').isVisible(), false);
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
        // La palabra tocada se ve en degradé violeta, y al cambiarla vuelve a su color.
        assert.equal(await page.locator('#editor-fondo .tocada').textContent(), 'andar');
        await page.screenshot({path: `capturas/editor-tocada-${tema}.png`});
        const otra = await page.locator('.sugerencia').first().textContent();
        await page.locator('.sugerencia').first().click();
        assert.ok((await page.locator('#editor-texto').inputValue()).includes(`se hace camino al ${otra}.`));
        assert.equal(await page.locator('#editor-fondo .tocada').count(), 0);
        // Tocar en otro lado (algo que no es un campo) también la suelta.
        await page.locator('#editor-texto').evaluate(t => {
            t.setSelectionRange(t.value.indexOf('volver') + 2, t.value.indexOf('volver') + 2);
            t.dispatchEvent(new MouseEvent('click'));
        });
        assert.equal(await page.locator('#editor-fondo .tocada').textContent(), 'volver');
        await page.locator('#silabas').dispatchEvent('pointerdown');
        assert.equal(await page.locator('#editor-fondo .tocada').count(), 0);
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
        // Otro toque muestra las relacionadas, y el siguiente vuelve a las rimas.
        await page.locator('.sugerencias-alternar').click();
        assert.equal(await page.locator('.sugerencias-etiqueta').textContent(), 'Relacionados «camino»:');
        const relacionadas = await page.locator('.sugerencia').allTextContents();
        assert.ok(relacionadas.includes('ruta'), relacionadas.join(', '));
        await page.screenshot({path: `capturas/editor-relacionados-${tema}.png`});
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
        // Con el teclado abierto (se ven 500 px), el cajón queda arriba del teclado.
        await page.evaluate(() => {
            document.documentElement.style.setProperty('--alto-visible', '500px');
            document.body.classList.add('teclado-abierto');
        });
        await page.waitForTimeout(400);
        const cajonTeclado = await page.locator('#fs-cajon').boundingBox();
        assert.ok(cajonTeclado.y + cajonTeclado.height <= 500 && cajonTeclado.y + cajonTeclado.height >= 480, JSON.stringify(cajonTeclado));
        await page.screenshot({path: `capturas/hoja-musica-teclado-${tema}.png`});
        await page.evaluate(() => {
            document.documentElement.style.setProperty('--alto-visible', innerHeight + 'px');
            document.body.classList.remove('teclado-abierto');
        });
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
        // Sobre la letra, «Recientes» va con el gris de los subtítulos, no con el más claro.
        assert.equal(
            await page.locator('#fs-recientes-caja summary').evaluate(e => getComputedStyle(e).color),
            await page.evaluate(() => { const p = document.createElement('p'); p.style.color = 'var(--texto-2)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; }),
        );
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
        // Un video suelto no tiene a qué canción pasar: las flechas no van.
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
        assert.equal(await page.locator('#musica-nota-youtube').textContent(), 'Los videos no se pueden minimizar por política de YouTube. Usá SoundCloud para evitar esto.');
        assert.equal(await page.locator('#musica-nota-youtube').isVisible(), true);
        await page.screenshot({path: `capturas/editor-youtube-plegado-${tema}.png`});
        const plegado = await page.locator('#reproductor').boundingBox();
        assert.ok(Math.abs(plegado.height - 184) <= 4, JSON.stringify(plegado.height));
        await page.locator('#musica-mostrar').click();
        assert.equal(await page.locator('#reproductor-marco').isVisible(), true);
        assert.equal(await page.locator('#musica-nota-youtube').isVisible(), false);
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'Pausar');
        // Con el teclado abierto la tarjeta se va y YouTube queda en pausa. Al cerrarlo vuelve a sonar solo.
        await page.evaluate(() => document.body.classList.add('teclado-abierto'));
        await page.waitForFunction(() => window.__yt.pausado);
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        await page.evaluate(() => document.body.classList.remove('teclado-abierto'));
        assert.equal(await page.locator('#reproductor').isVisible(), true);
        await page.waitForFunction(() => !window.__yt.pausado);
        assert.equal(await page.locator('#musica-play').getAttribute('aria-label'), 'Pausar');
        // La nota musical esconde la tarjeta mientras se elige, sin cortar lo que suena
        // (aunque el teclado esté abierto), y tocar afuera la vuelve a mostrar.
        await page.locator('#abrir-musica').click();
        await page.evaluate(() => document.body.classList.add('teclado-abierto'));
        assert.equal(await page.locator('#reproductor').isVisible(), false);
        await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => window.__yt.pausado), false);
        await page.evaluate(() => document.body.classList.remove('teclado-abierto'));
        await page.mouse.click(195, 100);
        assert.equal(await page.locator('#hoja-musica').isVisible(), false);
        assert.equal(await page.locator('#reproductor').isVisible(), true);
        assert.equal(await page.evaluate(() => window.__yt.pausado), false);
        // Si lo pausaste vos, el teclado no lo vuelve a poner en play.
        await page.locator('#musica-play').click();
        await page.evaluate(() => document.body.classList.add('teclado-abierto'));
        await page.evaluate(() => document.body.classList.remove('teclado-abierto'));
        await page.waitForTimeout(200);
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
        // Un link nuevo arranca solo, aunque el teclado esté abierto.
        await page.evaluate(() => document.body.classList.add('teclado-abierto'));
        await page.locator('#fs-pegar').click();
        await page.waitForFunction(() => window.__sc?.paused === false);
        await page.evaluate(() => document.body.classList.remove('teclado-abierto'));
        await page.locator('#reproductor-titulo', {hasText: 'Tema nube'}).waitFor();
        assert.equal(await page.locator('#reproductor-marco').isVisible(), false);
        // Chico: la flecha apunta abajo y lo deja en mini (pedido de Swa).
        assert.equal(await page.locator('#musica-plegar').isVisible(), true);
        assert.equal(await page.locator('#musica-mostrar').isVisible(), false);
        assert.equal((await page.locator('#reproductor-fuente').textContent()).trim(), 'SoundCloud');
        // Chico: una fila con el título (sin la fuente) y la barra; la flecha lo agranda (pedido de Swa).
        assert.equal(await page.locator('#reproductor-fuente').isVisible(), false);
        assert.equal(await page.locator('#musica-agrandar').isVisible(), false);
        const nube = await page.locator('#reproductor').boundingBox();
        assert.ok(Math.abs(nube.height - 80) <= 2, JSON.stringify(nube));
        await page.screenshot({path: `capturas/reproductor-chico-libreta-${tema}.png`});
        // Mini: una fila con lo que falta, la barra, el play y la flecha para arriba, sin cortarse.
        await page.locator('#musica-plegar').click();
        assert.equal(await page.locator('#reproductor').evaluate(e => e.classList.contains('mini')), true);
        assert.equal(await page.locator('#reproductor-titulo').isVisible(), false);
        assert.equal(await page.locator('#musica-cerrar').isVisible(), false);
        assert.equal(await page.locator('#musica-plegar').isVisible(), false);
        const recMini = await page.locator('#reproductor [data-rec]').boundingBox();
        assert.equal(Math.round((await page.locator('#musica-play').boundingBox()).x - (recMini.x + recMini.width)), 8, 'el REC va a la izquierda del play, a 8');
        assert.equal(await page.locator('#musica-agrandar').isVisible(), true);
        assert.match(await page.locator('#musica-tiempo').textContent(), /^\d+:\d\d$/);
        const miniCaja = await page.locator('#reproductor').boundingBox();
        assert.ok(Math.abs(miniCaja.height - 34) <= 1, JSON.stringify(miniCaja));
        const miniPista = await page.locator('#musica-pista').boundingBox();
        assert.ok(miniPista.width > 150, JSON.stringify(miniPista));
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        await page.screenshot({path: `capturas/reproductor-mini-libreta-${tema}.png`});
        // Desde mini, la flecha lo agranda (el formato alto) y abajo vuelve a chico sin cortarse.
        await page.locator('#musica-agrandar').click();
        assert.equal(await page.locator('#reproductor-marco').isVisible(), true);
        assert.equal(await page.locator('#musica-plegar').isVisible(), true);
        // En grande, la cruz va en la fila de la marca; abajo, la doble flecha, el REC y la flecha.
        const cajaBoton = id => page.locator(id).boundingBox();
        const [cruzG, marcaG, miniG, recG, plegarG] = await Promise.all(['#musica-cerrar', '#musica-marca', '#musica-mini', '#reproductor [data-rec]', '#musica-plegar'].map(cajaBoton));
        assert.ok(Math.abs(cruzG.y + cruzG.height / 2 - (marcaG.y + marcaG.height / 2)) <= 2, JSON.stringify({cruzG, marcaG}));
        assert.ok(miniG.x < recG.x && recG.x < plegarG.x, JSON.stringify({miniG, recG, plegarG}));
        await page.screenshot({path: `capturas/reproductor-grande-libreta-${tema}.png`});
        // La doble flecha lo deja en mini de una.
        await page.locator('#musica-mini').click();
        assert.equal(await page.locator('#reproductor').evaluate(e => e.classList.contains('mini')), true);
        await page.locator('#musica-agrandar').click();
        await page.locator('#musica-plegar').click();
        assert.equal(await page.locator('#reproductor-marco').isVisible(), false);
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        assert.equal(Math.round(nube.x), 16, JSON.stringify(nube));
        assert.equal(Math.round((await page.locator('#musica-play').boundingBox()).width), 40);
        // El iframe no se ve, pero queda adentro de la pantalla: afuera el navegador lo frena.
        const oculto = await page.locator('#reproductor-oculto iframe').boundingBox();
        assert.ok(oculto.x >= 0 && oculto.width >= 300, JSON.stringify(oculto));
        assert.equal(await page.locator('#reproductor-oculto').evaluate(e => getComputedStyle(e).opacity), '0');
        assert.equal(await page.evaluate(() => document.elementFromPoint(100, 80)?.closest('#reproductor-oculto')), null);
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        const pistaNube = await page.locator('#musica-pista').boundingBox();
        // La barra salta en el tema, que sigue sonando.
        await page.mouse.click(pistaNube.x + pistaNube.width / 2, pistaNube.y + pistaNube.height / 2);
        assert.equal((await page.locator('#musica-tiempo').textContent()).trim(), '1:30');
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        assert.ok(Math.abs(await page.evaluate(() => window.__sc.pos) - 90000) < 2000);
        // En la libreta, en chico: la marca y el bucle (del tamaño de las flechas), sin las flechas.
        // Marca este momento, y un toque cerca cae justo en ella.
        assert.equal(await page.locator('#musica-anterior').isVisible(), false);
        assert.equal(await page.locator('#musica-siguiente').isVisible(), false);
        const marcaBoton = await page.locator('#musica-marca').boundingBox();
        // Entre todos los botones de la fila queda el mismo aire, y la cruz un poco más lejos (pedido de Swa).
        const huecos = await page.evaluate(() => {
            const cajas = [...document.querySelectorAll('#reproductor .reproductor-acciones > *')].filter(b => b.offsetWidth).map(b => b.getBoundingClientRect());
            return cajas.slice(1).map((c, i) => Math.round(c.left - cajas[i].right));
        });
        assert.deepEqual(huecos, [18, 18, 10, 12, 15]);
        assert.ok((await page.locator('#musica-bucle').boundingBox()).x > marcaBoton.x);
        assert.equal(await page.locator('#musica-bucle').getAttribute('aria-disabled'), 'true');
        await page.locator('#musica-marca').click();
        const enLaMarca = await page.evaluate(() => window.__sc.pos);
        assert.equal(await page.locator('#musica-marca-punto').isVisible(), true);
        await page.mouse.click(pistaNube.x + pistaNube.width / 2 + 8, pistaNube.y + pistaNube.height / 2);
        assert.equal(await page.evaluate(() => window.__sc.pos), enLaMarca);
        await page.mouse.click(pistaNube.x + pistaNube.width * 0.8, pistaNube.y + pistaNube.height / 2);
        assert.ok(await page.evaluate(() => window.__sc.pos) > enLaMarca + 30000);
        // El botón de al lado de la marca vuelve a ella y sigue sonando (pedido de Swa).
        await page.locator('#musica-bucle').click();
        assert.equal(await page.evaluate(() => window.__sc.pos), enLaMarca);
        assert.equal(await page.evaluate(() => window.__sc.paused), false);
        await page.screenshot({path: `capturas/reproductor-marca-${tema}.png`});
        // Con la barra en la marca, tocar el pin la borra (y otro toque la vuelve a poner).
        await page.locator('#musica-marca').click();
        assert.equal(await page.locator('#musica-marca-punto').isVisible(), false);
        assert.equal(await page.locator('#musica-bucle').getAttribute('aria-disabled'), 'true');
        await page.locator('#musica-marca').click();
        assert.equal(await page.locator('#musica-marca-punto').isVisible(), true);
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
        // Mientras haya una canción, no están los beats ni el cajón del link: vuelven al cerrarla.
        assert.equal(await page.locator('#fs-elegir').isVisible(), false);
        assert.equal(await page.locator('#fs-cajon').isVisible(), false);
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
        // La cruz de un reciente borra solo esa línea: la hoja sigue abierta y «Recientes» desplegado.
        await page.locator('#abrir-musica').click();
        await page.locator('#fs-recientes-caja summary').click();
        const antes = await page.locator('#fs-recientes .usar-reciente').count();
        await page.locator('#fs-recientes .borrar-reciente').first().click();
        assert.equal(await page.locator('#fs-recientes .usar-reciente').count(), antes - 1);
        assert.equal(await page.locator('#hoja-musica').isVisible(), true);
        if (antes > 1) assert.equal(await page.locator('#fs-recientes-caja').evaluate(d => d.open), true);
        await page.mouse.click(195, 100);
        assert.equal(await page.locator('#hoja-musica').isVisible(), false);
        // En pantalla chica (iPhone 16) los renglones arrancan apagados, sin botón arriba: se prenden
        // desde «Funciones» en la ruedita.
        assert.equal(await page.locator('#alternar-renglones').isVisible(), false);
        assert.equal(await page.locator('.editor-cuerpo').evaluate(e => getComputedStyle(e).backgroundImage), 'none');
        await page.locator('#abrir-ajustes-libreta').click();
        assert.deepEqual(await page.locator('#ajustes-libreta .funciones-libreta label').allTextContents(), ['Renglones', 'Sílabas por verso', 'Rimas internas']);
        assert.equal(await page.locator('#mostrar-renglones').isChecked(), false);
        await page.locator('#mostrar-renglones').click();
        await page.locator('#cerrar-ajustes-libreta').click();
        assert.match(await page.locator('.editor-cuerpo').evaluate(e => getComputedStyle(e).backgroundImage), /repeating-linear-gradient/);
        // En pantalla grande (Pro Max) el botón de renglones sigue arriba y el interruptor no está.
        await page.setViewportSize({width: 440, height: 956});
        assert.equal(await page.locator('#alternar-renglones').isVisible(), true);
        assert.equal(await page.locator('#alternar-renglones').getAttribute('aria-pressed'), 'true');
        await page.locator('#alternar-renglones').click();
        assert.equal(await page.locator('.editor-cuerpo').evaluate(e => getComputedStyle(e).backgroundImage), 'none');
        await page.locator('#alternar-renglones').click();
        await page.locator('#abrir-ajustes-libreta').click();
        assert.equal(await page.locator('#mostrar-renglones').isVisible(), false);
        await page.locator('#cerrar-ajustes-libreta').click();
        await page.setViewportSize({width: 390, height: 844});
        // De borde a borde, como un cuaderno, y el texto a 16px del borde, como en Keep.
        assert.deepEqual(await page.locator('.editor-cuerpo').evaluate(e => [e.getBoundingClientRect().left, e.getBoundingClientRect().right]), [0, 390]);
        assert.equal(await page.locator('#editor-titulo').evaluate(e => e.getBoundingClientRect().left), 16);
        // Rimas internas: se pintan las palabras del medio que riman consonante con otras cercanas.
        const textoAntes = await page.locator('#editor-texto').inputValue();
        const escribir = texto => page.locator('#editor-texto').evaluate((t, v) => { t.value = v; t.dispatchEvent(new Event('input')); }, texto);
        const marcas = () => page.locator('#editor-fondo mark').evaluateAll(ms => ms.map(m => m.className + ':' + m.textContent));
        // Arrancan en 2 versos: se pasa a 4 para este ejemplo.
        await page.locator('#abrir-ajustes-libreta').click();
        assert.equal(await page.locator('#rimas-internas').inputValue(), 'dos', 'arranca en 2 versos');
        assert.equal(await page.locator('#valor-internas').textContent(), 'Distancia: 2 versos');
        await page.locator('#rimas-internas').selectOption('cuatro');
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
        await page.locator('#rimas-internas').selectOption('dos');
        assert.deepEqual(await marcas(), ['rima-0:mino', 'rima-0:tino', 'rima-1 suave:vengo', 'rima-1 suave:lejos'], 'a 2 versos, tengo y vengo quedan lejos');
        await page.locator('#rimas-internas').selectOption('no');
        assert.deepEqual(await marcas(), []);
        await page.locator('#rimas-internas').selectOption('cuatro');
        await page.locator('#cerrar-ajustes-libreta').click();
        await escribir(textoAntes);
        // La ruedita abre los ajustes de la libreta: sílabas, tamaño, separación y fuente.
        await page.locator('#abrir-ajustes-libreta').click();
        assert.equal(await page.locator('#ajustes-libreta').isVisible(), true);
        await page.locator('#mostrar-silabas').click();
        // Tamaño, separaciones y rimas internas: barras compactas con el nombre adentro, imantadas.
        // Diseño de la referencia de Swa: sin título, grupos con encabezado afuera y pasos de − y +.
        assert.equal(await page.locator('#ajustes-libreta .hoja-titulo').count(), 0);
        assert.deepEqual(await page.locator('#ajustes-libreta .encabezado-libreta').allTextContents(), ['Tema de esta letra', 'Texto', 'Funciones']);
        assert.deepEqual(await page.locator('#opciones-libreta .fila-grupo').evaluateAll(fs => fs.map(f => f.innerText.replace(/\s+/g, ' ').trim())),
            ['Tamaño de letra − 4 +', 'Separación de renglones − 4 +', 'Separación de letras − 5 +']);
        // Hasta un punto, con los pasos de − y +; en los extremos el botón se apaga.
        const fijarPaso = async (clave, punto) => {
            const pasos = page.locator(`.pasos-libreta[data-ajuste="${clave}"]`);
            for (let i = 0; i < 10; i++) {
                const actual = Number(await pasos.locator('.valor-pasos').textContent());
                if (actual === punto) return;
                await pasos.locator(`[data-paso="${actual < punto ? 1 : -1}"]`).click();
            }
            throw new Error(`no llegó a ${punto}`);
        };
        assert.deepEqual(await page.locator('[data-ajuste="fuente"] button').allTextContents(), ['Sistema', 'Avenir', 'Máquina', 'A mano']);
        await fijarPaso('tamano', 8);
        await fijarPaso('separacion', 8);
        await page.locator('[data-ajuste="fuente"] [data-opcion="maquina"]').click();
        await fijarPaso('letras', 1);
        assert.equal(await page.locator('.pasos-libreta[data-ajuste="letras"] [data-paso="-1"]').isDisabled(), true);
        await page.screenshot({path: `capturas/ajustes-libreta-${tema}.png`});
        await page.locator('#cerrar-ajustes-libreta').click();
        const estiloTexto = () => page.locator('#editor-texto').evaluate(t => [getComputedStyle(t).fontSize, getComputedStyle(t).lineHeight, getComputedStyle(t).fontFamily]);
        assert.deepEqual((await estiloTexto()).slice(0, 2), ['20px', '35px']);
        assert.match((await estiloTexto())[2], /American Typewriter/);
        // Letras más juntas, igual en el texto y en la copia que pinta las rimas.
        const espaciado = await page.evaluate(() => ['editor-texto', 'editor-fondo'].map(id => getComputedStyle(document.getElementById(id)).letterSpacing));
        assert.equal(espaciado[0], espaciado[1]);
        assert.ok(parseFloat(espaciado[0]) < 0, espaciado[0]);
        assert.equal(await page.locator('#silabas').isVisible(), false);
        await page.screenshot({path: `capturas/editor-grande-maquina-${tema}.png`});
        // Todo se recuerda después de recargar.
        await page.locator('#editor-atras').click();
        assert.equal(await page.locator('#barra-pestanas').isVisible(), true);
        await page.reload();
        await page.locator('#lista-letras .tarjeta-letra button').click();
        assert.deepEqual((await estiloTexto()).slice(0, 2), ['20px', '35px']);
        assert.equal(await page.locator('#silabas').isVisible(), false);
        await page.locator('#abrir-ajustes-libreta').click();
        assert.equal(await page.locator('[data-ajuste="fuente"] [aria-selected="true"]').textContent(), 'Máquina');
        await page.locator('#mostrar-silabas').click();
        await fijarPaso('tamano', 5);
        await fijarPaso('separacion', 4);
        await page.locator('[data-ajuste="fuente"] [data-opcion="sistema"]').click();
        await fijarPaso('letras', 5);
        await page.locator('#ajustes-libreta').click({position: {x: 10, y: 10}});
        assert.equal(await page.locator('#ajustes-libreta').isVisible(), false);
        assert.deepEqual((await estiloTexto()).slice(0, 2), ['17px', '23px']);
        assert.equal(await page.locator('#silabas').isVisible(), true);
        await page.locator('#editor-atras').click();

        // La letra queda guardada, también después de recargar.
        assert.equal(await page.locator('#lista-letras .titulo-letra').textContent(), 'Sacred Geometry');
        assert.match(await page.locator('#lista-letras .texto-letra').textContent(), /^Caminante, no hay camino,/);
        // La tarjeta empieza con el título, sin la fecha.
        assert.equal(await page.locator('#lista-letras .fecha-letra').count(), 0);
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

        // Varias letras: la última editada va primera, cada una a la columna más corta y chica o
        // larga según su id (esLarga), y mantener apretada una tarjeta y pasarla por arriba de otra las cambia de lugar.
        await page.evaluate(() => localStorage.setItem('metrica.letras', JSON.stringify(
            ['A', 'B', 'C', 'D', 'E', 'F'].map((t, i) => ({ id: t, titulo: t, texto: 'verso', creada: i, editada: i + 1 })))));
        await page.reload();
        await page.waitForTimeout(500);
        const titulos = () => page.locator('#lista-letras .titulo-letra').allTextContents();
        assert.deepEqual(await titulos(), ['F', 'E', 'D', 'C', 'B', 'A']);
        const tarjetaDe = t => page.locator('#lista-letras .tarjeta-letra').filter({has: page.getByText(t, {exact: true})});
        const cajaDe = t => tarjetaDe(t).boundingBox();
        const [mas, f, e, d, c, b] = [await page.locator('#nueva-letra').boundingBox(), await cajaDe('F'), await cajaDe('E'), await cajaDe('D'), await cajaDe('C'), await cajaDe('B')];
        // Con estos ids: "+", E, D y B chicas a la izquierda; F y C largas a la derecha.
        assert.ok(mas.x < f.x && e.x === mas.x && f.height > mas.height * 2 && e.y > mas.y);
        assert.ok(d.x === mas.x && d.y > e.y && Math.abs(d.height - mas.height) < 2 && c.x === f.x && c.height > mas.height * 2 && b.x === mas.x && b.y > d.y);
        await page.screenshot({path: `capturas/letras-grilla-${tema}.png`});
        // Arrastrar D arriba de F la pone primera, y queda así al volver a entrar.
        const dd = await cajaDe('D');
        await page.mouse.move(dd.x + dd.width / 2, dd.y + 40);
        await page.mouse.down();
        await page.waitForTimeout(600);
        const f2 = await cajaDe('F');
        await page.mouse.move(f2.x + f2.width / 2, f2.y + 60, {steps: 30});
        await page.waitForTimeout(400);
        await page.mouse.up();
        await page.waitForTimeout(500);
        assert.deepEqual(await titulos(), ['D', 'F', 'E', 'C', 'B', 'A']);
        assert.equal(await page.locator('#vista-editor').isVisible(), false);
        await page.reload();
        await page.waitForTimeout(500);
        assert.deepEqual(await titulos(), ['D', 'F', 'E', 'C', 'B', 'A']);
        // Editar una la vuelve a poner primera.
        await tarjetaDe('C').locator('button').click();
        await page.locator('#editor-texto').press('End');
        await page.locator('#editor-texto').type(' nuevo');
        await page.locator('#editor-atras').click();
        assert.deepEqual(await titulos(), ['C', 'D', 'F', 'E', 'B', 'A']);
        await page.evaluate(() => localStorage.removeItem('metrica.letras'));
        await page.reload();
        await page.waitForTimeout(500);

        // Rimas: 4 terminaciones al azar que cambian solas; escribir una palabra frena el azar
        // y muestra sus rimas más usadas con el mismo formato.
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        assert.equal(await page.locator('.palabra').count(), 4);
        assert.equal(await page.locator('#encabezado-usadas').textContent(), 'Terminaciones al azar');
        // La pista, tipeada rápido con el efecto violeta apagado; sin palabra, consonante y asonante apagados.
        await page.waitForFunction(() => document.querySelector('#pista-rima span').textContent === 'Escribí una palabra');
        assert.equal(await page.locator('#pista-rima span').evaluate(e => getComputedStyle(e).animationName), 'brillo-tocada');
        assert.equal(await page.locator('#tipo-rima').getAttribute('class'), 'segmentado apagado');
        assert.equal(await page.locator('#rimas-vacio').isVisible(), false, 'sin el texto de abajo');
        assert.equal(await page.getByText(/cambian en/).count(), 0);
        // Todo con el efecto de la palabra tocada: terminaciones, lupa y el tipo elegido.
        assert.equal(await page.locator('.palabra mark').first().getAttribute('class'), 'brillo-violeta');
        assert.equal(await page.locator('#pantalla-rimas .lupa-violeta span').evaluate(e => getComputedStyle(e).animationName), 'brillo-tocada');
        // El tipo elegido va con la pastilla violeta suave de «Palabras simples» encendido, sin el efecto.
        assert.equal(await page.locator('#tipo-rima [aria-selected="true"]').evaluate(e => getComputedStyle(e).animationName), 'none');
        await page.locator('#palabras-simples').click();
        const pastillaSimples = await page.locator('#palabras-simples').evaluate(e => getComputedStyle(e).backgroundColor);
        await page.locator('#palabras-simples').click();
        // Sin palabra, apagado: sin la pastilla (vuelve al buscar).
        assert.equal(await page.locator('.opcion-tipo').first().evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)');
        // El «?» va pegado al texto.
        const textoTipo = await page.locator('#tipo-rima [data-tipo="consonante"]').boundingBox(), signo = await page.locator('[data-ayuda="consonante"]').boundingBox();
        assert.ok(signo.x - (textoTipo.x + textoTipo.width) < 8, JSON.stringify([textoTipo, signo]));
        // La palabra va centrada en el alto de la cajita.
        const centro = await page.locator('.palabra-caja').first().evaluate(c => {
            const caja = c.getBoundingClientRect(), t = c.querySelector('.palabra').firstElementChild.getBoundingClientRect(), s = c.querySelector('.silabas-tarjeta').getBoundingClientRect();
            return Math.abs((t.top - caja.top) - (caja.bottom - s.bottom));
        });
        assert.ok(centro < 3, String(centro));
        // Las palabras largas no se cortan: van en un renglón, con la letra más chica si hace falta.
        for (const t of await page.locator('.texto-palabra').all()) assert.ok(await t.evaluate(e => e.scrollWidth <= e.clientWidth && e.getClientRects().length === 1));        assert.equal(await page.locator('#barra-pestanas [data-pestana="palabras"]').count(), 0);
        assert.equal(await page.locator('.estrella').count(), 0, 'sin favoritas');
        // El tiempo baja y, a los 6 s, cambian las palabras.
        const primeras = await page.locator('.palabra .texto-palabra').allTextContents();
        await page.waitForTimeout(2200);
        const queda = Number(await page.locator('#tiempo-azar').evaluate(e => e.style.getPropertyValue('--queda')));
        assert.ok(queda > 0 && queda < 0.75, String(queda));
        await page.waitForTimeout(4500);
        assert.notDeepEqual(await page.locator('.palabra .texto-palabra').allTextContents(), primeras);
        await page.waitForTimeout(500);
        await page.screenshot({path: `capturas/rimas-azar-${tema}.png`});
        // Pausa: el tiempo se frena y las palabras quedan.
        await page.locator('#pausar-palabras').click();
        assert.equal(await page.locator('#pausar-palabras').getAttribute('aria-pressed'), 'true');
        const quietas = await page.locator('.palabra .texto-palabra').allTextContents();
        await page.waitForTimeout(6500);
        assert.deepEqual(await page.locator('.palabra .texto-palabra').allTextContents(), quietas);
        // Refrescar cambia aunque esté en pausa.
        await page.locator('#refrescar-palabras').click();
        await page.waitForTimeout(400);
        assert.notDeepEqual(await page.locator('.palabra .texto-palabra').allTextContents(), quietas);
        await page.locator('#pausar-palabras').click();
        // Guardar: el botón de la cajita se pinta y la palabra aparece en «Palabras guardadas».
        assert.equal(await page.locator('#cajon-guardadas').isVisible(), false);
        await page.waitForTimeout(600);
        const aGuardar = await page.locator('.palabra-caja .texto-palabra').first().textContent();
        await page.locator('.palabra-caja .guardar').first().click();
        assert.equal(await page.locator('.palabra-caja .guardar').first().getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.palabra-caja .guardar').first().locator('.icono-guardar span').evaluate(e => getComputedStyle(e).animationName), 'brillo-tocada');
        assert.deepEqual(await page.locator('#lista-guardadas li').allTextContents(), [aGuardar]);
        assert.equal(await page.locator('#lista-guardadas mark').first().getAttribute('class'), 'brillo-violeta');
        await page.reload();
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        assert.deepEqual(await page.locator('#lista-guardadas li').allTextContents(), [aGuardar]);
        await page.locator('#cajon-guardadas').scrollIntoViewIfNeeded();
        await page.screenshot({path: `capturas/rimas-guardadas-${tema}.png`});
        await page.locator('#lista-guardadas .borrar-guardada').click();
        assert.equal(await page.locator('#cajon-guardadas').isVisible(), false);
        await page.locator('#pantalla-rimas').evaluate(p => p.scrollTo(0, 0));
        // Palabras simples: las 4 salen de la lista de palabras simples.
        await page.locator('#palabras-simples').click();
        assert.equal(await page.locator('#palabras-simples').getAttribute('aria-pressed'), 'true');
        // Las nuevas entran después de que se van las viejas: se espera a que no quede ninguna saliendo.
        await page.waitForFunction(() => !document.querySelector('#grilla-palabras.sale'));
        const simples = await page.locator('.palabra .texto-palabra').allTextContents();
        assert.ok(await page.evaluate(ps => ps.every(p => textoPalabrasSimples.split('\n').includes(p)), simples), simples.join());
        await page.locator('#palabras-simples').click();
        // «?» de Consonante y de Asonante: una viñeta corta que se cierra tocando afuera.
        await page.locator('[data-ayuda="asonante"]').click();
        assert.match(await page.locator('#vineta-tipo').textContent(), /Asonante: coinciden las vocales.*casa y cama \/\/ puerta y suelta/);
        await page.waitForTimeout(300);
        await page.screenshot({path: `capturas/rimas-ayuda-${tema}.png`});
        assert.equal(await page.locator('#vineta-tipo mark.brillo-violeta').first().evaluate(e => getComputedStyle(e).animationName), 'brillo-tocada');
        assert.equal(await page.locator('#vineta-tipo strong').evaluate(e => getComputedStyle(e).color), await page.locator('#vineta-tipo').evaluate(e => getComputedStyle(e).color));
        await page.locator('[data-ayuda="consonante"]').click();
        assert.match(await page.locator('#vineta-tipo').textContent(), /Consonante:/);
        await page.locator('#pantalla-rimas .titulo-grande').click();
        assert.equal(await page.locator('#vineta-tipo').isVisible(), false);
        assert.equal(await page.locator('#tipo-rima [data-tipo="consonante"]').getAttribute('aria-selected'), 'true');

        await page.locator('#buscar-rima').fill('canción');
        await page.waitForTimeout(300);
        assert.equal(await page.locator('#pista-rima').isVisible(), false);
        assert.equal(await page.locator('#tipo-rima').getAttribute('class'), 'segmentado');
        assert.equal(await page.locator('.opcion-tipo').first().evaluate(e => getComputedStyle(e).backgroundColor), pastillaSimples);
        const tarjetas = await page.locator('.palabra .texto-palabra').allTextContents();
        assert.equal(tarjetas.length, 4);
        assert.ok(tarjetas.every(p => /[oó]n$/.test(p)), tarjetas.join());
        assert.match(await page.locator('#encabezado-usadas').textContent(), /^[\d.]+ rimas consonantes con «canción»$/);
        assert.equal(await page.locator('#tiempo-azar').isVisible(), false);
        assert.equal(await page.locator('#pausar-palabras').isVisible(), false);
        // Refrescar, a la izquierda de «Palabras simples», pasa a las 4 rimas siguientes.
        const refrescar = await page.locator('#refrescar-palabras').boundingBox(), chip = await page.locator('#palabras-simples').boundingBox();
        assert.ok(await page.locator('#refrescar-palabras').isVisible() && refrescar.x < chip.x && chip.x - (refrescar.x + refrescar.width) < 16, JSON.stringify([refrescar, chip]));
        // Con búsqueda el azar se frena: las 4 quedan quietas.
        await page.waitForTimeout(6500);
        assert.deepEqual(await page.locator('.palabra .texto-palabra').allTextContents(), tarjetas);
        await page.locator('#refrescar-palabras').click();
        await page.waitForTimeout(400);
        const siguientes = await page.locator('.palabra .texto-palabra').allTextContents();
        assert.ok(siguientes.length === 4 && siguientes.every(p => /[oó]n$/.test(p)) && !siguientes.some(p => tarjetas.includes(p)), siguientes.join());
        // Deslizar la caja a un costado también refresca, sin repetir.
        const cajaAzar = await page.locator('#caja-azar').boundingBox();
        await page.mouse.move(cajaAzar.x + cajaAzar.width * 0.7, cajaAzar.y + 120);
        await page.mouse.down();
        await page.mouse.move(cajaAzar.x + cajaAzar.width * 0.2, cajaAzar.y + 125, { steps: 5 });
        await page.mouse.up();
        await page.waitForFunction(() => !document.querySelector('#grilla-palabras.sale'));
        const deslizadas = await page.locator('.palabra .texto-palabra').allTextContents();
        assert.equal(await page.locator('#buscar-rima').inputValue(), 'canción', 'deslizar no toca la palabra');
        assert.ok(deslizadas.length === 4 && !deslizadas.some(p => tarjetas.includes(p) || siguientes.includes(p)), deslizadas.join());
        // Al buscar: «Sinónimos», refrescar y «Palabras simples» con la misma separación y el
        // refrescar al medio de las tarjetas.
        const [bSin, bRef, bSim] = await Promise.all(['#ver-sinonimos', '#refrescar-palabras', '#palabras-simples'].map(id => page.locator(id).boundingBox()));
        const grillaCaja = await page.locator('#grilla-palabras').boundingBox();
        assert.ok(bSin.height === 40 && bSim.height === 40, 'cada botón en un renglón');
        assert.ok(Math.abs(bRef.x + bRef.width / 2 - (grillaCaja.x + grillaCaja.width / 2)) < 2, 'refrescar al centro');
        assert.ok(Math.abs((bRef.x - (bSin.x + bSin.width)) - (bSim.x - (bRef.x + bRef.width))) < 1 && Math.abs(bSin.width - bSim.width) < 1, JSON.stringify([bSin, bRef, bSim]));
        // Sinónimos: las tarjetas y la lista muestran sinónimos, primero los que riman; consonante y asonante se apagan.
        await page.locator('#ver-sinonimos').click();
        assert.match(await page.locator('#encabezado-usadas').textContent(), /^\d+ sinónimos de «canción»$/);
        await page.locator('#palabras-simples').click();
        await page.waitForTimeout(300);
        assert.match(await page.locator('#encabezado-usadas').textContent(), /^\d+ sinónimos? simples? de «canción»$/);
        await page.locator('#palabras-simples').click();
        assert.equal(await page.locator('#tipo-rima').getAttribute('class'), 'segmentado apagado');
        assert.ok(Number(await page.locator('#tipo-rima [data-tipo="consonante"]').evaluate(e => getComputedStyle(e).opacity)) < 0.5);
        const deSinonimos = await page.locator('#resultados-rimas li').allTextContents();
        assert.deepEqual(deSinonimos.slice(0, 3), ['son', 'composición', 'improvisación']);
        assert.ok(deSinonimos.includes('melodía'));
        assert.match(await page.locator('#encabezado-resultados').textContent(), /^Todos los sinónimos · \d+$/);
        await page.screenshot({path: `capturas/rimas-sinonimos-${tema}.png`});
        await page.locator('#ver-sinonimos').click();
        assert.equal(await page.locator('#tipo-rima').getAttribute('class'), 'segmentado');
        // Sin sinónimos, el botón queda apagado y no se puede tocar.
        await page.locator('#buscar-rima').fill('zumbabaz');
        assert.equal(await page.locator('#ver-sinonimos').isDisabled(), true);
        assert.equal(await page.locator('#ver-sinonimos').getAttribute('aria-pressed'), 'false');
        await page.locator('#buscar-rima').fill('canción');
        assert.equal(await page.locator('#ver-sinonimos').isDisabled(), false);
        await page.locator('#buscar-rima').fill('canció');
        await page.locator('#buscar-rima').fill('canción');
        await page.waitForTimeout(300);
        // La terminación va con el efecto de la palabra tocada (degradé violeta animado).
        const mark = page.locator('.palabra mark').first();
        assert.equal(await mark.getAttribute('class'), 'brillo-violeta');
        assert.equal(await mark.evaluate(m => getComputedStyle(m).animationName), 'brillo-tocada');
        const consonantes = await page.locator('#resultados-rimas li').allTextContents();
        assert.ok(consonantes.length > 20);
        assert.ok(consonantes.slice(0, 5).includes('corazón'), consonantes.slice(0, 5).join());
        assert.ok(consonantes.every(p => /[oó]n$/.test(p)));
        assert.equal(await page.locator('#rimas-vacio').isVisible(), false);
        // El cajón de todas muestra 20 (dos columnas de 10) y se desliza adentro.
        const cajon = await page.locator('#resultados-rimas').evaluate(l => ({ alto: l.clientHeight, total: l.scrollHeight, fila: l.firstElementChild.offsetHeight }));
        assert.equal(Math.round(cajon.alto / cajon.fila), 5, JSON.stringify(cajon));
        assert.ok(cajon.total > cajon.alto);
        await page.screenshot({path: `capturas/rimas-${tema}.png`});
        // «Palabras relacionadas»: otro cajón con el mismo formato que «Todas».
        assert.equal(await page.locator('#cajon-relacionadas').isVisible(), true);
        const enRelacionadas = await page.locator('#lista-relacionadas li').allTextContents();
        assert.ok(enRelacionadas.length > 0 && !enRelacionadas.includes('canción'), enRelacionadas.join());
        assert.equal(await page.locator('#lista-relacionadas .guardar').count(), enRelacionadas.length);
        assert.equal(await page.locator('#lista-relacionadas mark').first().getAttribute('class'), 'brillo-violeta');
        await page.locator('#cajon-relacionadas').scrollIntoViewIfNeeded();
        await page.screenshot({path: `capturas/rimas-relacionadas-${tema}.png`});
        await page.locator('#pantalla-rimas').evaluate(p => p.scrollTo(0, 0));
        // «Guardar» también en «Todas».
        const deTodas = (await page.locator('#resultados-rimas li').nth(1).textContent());
        await page.locator('#resultados-rimas .guardar').nth(1).click();
        assert.equal(await page.locator('#resultados-rimas .guardar').nth(1).getAttribute('aria-pressed'), 'true');
        assert.ok((await page.locator('#lista-guardadas li').allTextContents()).includes(deTodas));
        await page.locator('#cajon-todas').scrollIntoViewIfNeeded();
        await page.screenshot({path: `capturas/rimas-todas-${tema}.png`});
        await page.locator('#tipo-rima [data-tipo="asonante"]').click();
        assert.equal(await page.locator('#tipo-rima [data-tipo="asonante"]').getAttribute('aria-selected'), 'true');
        const asonantes = await page.locator('#resultados-rimas li').allTextContents();
        assert.ok(asonantes.length > 0 && !asonantes.some(p => consonantes.includes(p)));
        assert.ok((await page.locator('.palabra .texto-palabra').allTextContents()).every(p => asonantes.includes(p)));
        await page.screenshot({path: `capturas/rimas-asonante-${tema}.png`});
        // Tocar una rima busca las suyas.
        const primera = asonantes[0];
        await page.locator('#resultados-rimas button').first().click();
        assert.equal(await page.locator('#buscar-rima').inputValue(), primera);
        await page.locator('#buscar-rima').fill('xyz');
        assert.match(await page.locator('#rimas-vacio').textContent(), /No encontré rimas asonantes/);
        assert.equal(await page.locator('.palabra').count(), 0);
        assert.equal(await page.locator('#cajon-todas').isVisible(), false);
        await page.locator('#tipo-rima [data-tipo="consonante"]').click();
        await page.locator('#buscar-rima').fill('');
        assert.equal(await page.locator('.palabra').count(), 4);
        assert.equal(await page.locator('#encabezado-usadas').textContent(), 'Terminaciones al azar');

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
        // Beats: tres botones, Boombap, Trap y Acapella, uno al lado del otro, con puntitos. Deslizar cambia de beat.
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
        assert.deepEqual(await page.locator('#fs-beats .nombre-beat').allTextContents(), ['Boombap 1', 'Trap 1', 'Acapella']);
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
        // Los beats y el cajón van en una sola caja de vidrio (pedido de Swa).
        const cajonFs = await page.locator('#fs-cajon').boundingBox();
        const cajaFs = await page.locator('#fs-instrumental').boundingBox();
        const beatsFs = await page.locator('#fs-beats').boundingBox();
        assert.ok(beatsFs.y > cajaFs.y && cajonFs.y + cajonFs.height < cajaFs.y + cajaFs.height, JSON.stringify({cajaFs, beatsFs, cajonFs}));
        assert.equal((await page.locator('.separador-fs').textContent()).trim(), 'o usá el tuyo');
        const barraPestanas = await page.locator('#barra-pestanas').boundingBox();
        const aireLink = barraPestanas.y - (cajaFs.y + cajaFs.height);
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
        // Igual al reproductor chico de un archivo: el título solo, 80 de alto y el mismo aire (pedido de Swa).
        assert.equal(await page.locator('#fs-sonando-fuente').isVisible(), false);
        assert.ok(Math.abs(sonandoCaja.height - 80) <= 2, JSON.stringify(sonandoCaja));
        await page.screenshot({path: `capturas/freestyle-beat-reproductor-${tema}.png`});
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
        // Sonando, las flechas se esconden para que se lea el título (pedido de Swa).
        assert.equal(await page.locator('#fs-sonando').isVisible(), true);
        assert.equal(await page.locator('#fs-beat-anterior').isVisible(), false);
        await page.evaluate(() => document.getElementById('fs-beat-anterior').click());
        assert.notEqual(await page.locator('#fs-sonando-titulo').textContent(), tituloBeat);
        await page.evaluate(() => document.getElementById('fs-beat-siguiente').click());
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
        // Con el beat sonando, en Rimas sube el polvo del Boombap 1 (sin resplandor).
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        await page.waitForTimeout(1200);
        assert.equal(await page.locator('#rimas-efecto').getAttribute('data-mood'), 'boombap');
        assert.ok(await page.locator('#rimas-efecto').evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }) > 50, 'en Rimas hay partículas con música');
        await page.screenshot({path: `capturas/rimas-particulas-${tema}.png`});
        // Y en Letras, detrás de las tarjetas.
        await page.locator('#barra-pestanas [data-pestana="letras"]').click();
        await page.waitForTimeout(1200);
        assert.ok(await page.locator('#letras-efecto').evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }) > 50, 'en Letras hay partículas con música');
        await page.screenshot({path: `capturas/letras-particulas-${tema}.png`});
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
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
        // Acapella: un beat en silencio, sin reproductor. Abajo de la bandeja no va nada, y
        // tocar cualquier lugar (menos la barra de pestañas) pausa y vuelve la bandeja.
        const acapella = page.locator('#fs-beats [data-genero="Acapella"]');
        await acapella.click();
        assert.equal(await acapella.getAttribute('aria-checked'), 'true');
        assert.equal(await acapella.locator('.puntos-beat').isVisible(), false);
        await page.locator('#fs-play').click();
        await page.waitForFunction(() => document.getElementById('pantalla-freestyle').classList.contains('jugando'));
        assert.equal(await page.locator('.sonando-fs').isVisible(), false);
        assert.equal(await page.locator('#fs-elegir').isVisible(), false);
        assert.equal(await page.locator('#fs-cajon').isVisible(), false);
        await page.waitForTimeout(500);
        await page.screenshot({path: `capturas/freestyle-acapella-${tema}.png`});
        const proximas = await page.locator('.proximas').boundingBox();
        await page.mouse.click(proximas.x + 10, proximas.y + proximas.height / 2);
        assert.equal(await page.locator('#pantalla-freestyle').evaluate(e => e.classList.contains('jugando')), false);
        assert.equal(await page.locator('#fs-play').getAttribute('aria-label'), 'Seguir');
        await page.waitForTimeout(400);
        assert.equal(await page.locator('.bandeja-fs').isVisible(), true);
        // En pausa vuelven los beats y el cajón del link, con Acapella elegido.
        assert.equal(await page.locator('#fs-elegir').isVisible(), true);
        assert.equal(await page.locator('#fs-cajon').isVisible(), true);
        assert.equal(await acapella.getAttribute('aria-checked'), 'true');
        assert.equal(await page.locator('.sonando-fs').isVisible(), false);
        await page.screenshot({path: `capturas/freestyle-acapella-pausa-${tema}.png`});
        // El play de la bandeja sigue (y no vuelve a pausar).
        await page.locator('#fs-play').click();
        assert.equal(await page.locator('#pantalla-freestyle').evaluate(e => e.classList.contains('jugando')), true);
        // Cambiar de sección con Acapella andando lo detiene: no queda el REC suelto (pedido de Swa).
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        assert.equal(await page.evaluate(() => document.body.classList.contains('acapella-sonando')), false);
        assert.equal(await page.locator('.rec-acapella').isVisible(), false);
        await page.locator('#barra-pestanas [data-pestana="freestyle"]').click();
        assert.equal(await page.locator('#fs-play').getAttribute('aria-label'), 'Seguir');
        await page.waitForTimeout(400);
        await page.locator('#fs-reiniciar').click();
        assert.equal(await page.locator('#fs-elegir').isVisible(), true);
        await elegirBeatFs('boom-bap-jazz');
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
        // Bajar la velocidad de las palabras en plena ronda no deja la palabra trabada.
        const velocidad = v => page.locator('#velocidad-palabras').evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, v);
        await velocidad('10');
        await page.waitForTimeout(2500);
        await velocidad('9');
        const lenta = await page.locator('#fs-palabra').textContent();
        await page.waitForFunction(p => document.getElementById('fs-palabra').textContent !== p, lenta, {timeout: 2000});
        await velocidad('5');
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
        // Agrandado se ve todo. La marca es del tema: pasar a otro de la playlist la borra.
        assert.equal(await page.locator('#musica-marca').isVisible(), true);
        await page.locator('#musica-marca').click();
        assert.equal(await page.locator('#musica-marca').getAttribute('aria-pressed'), 'true');
        await page.locator('#musica-siguiente').click();
        await page.locator('#reproductor-titulo', {hasText: 'Beat 2 de la playlist'}).waitFor();
        assert.equal(await page.locator('#musica-marca').getAttribute('aria-pressed'), 'false');
        assert.equal(await page.locator('#musica-marca-punto').isVisible(), false);
        // Fuera de la libreta, en chico: sin la marca ni el bucle.
        await page.locator('#musica-plegar').click();
        assert.equal(await page.locator('#musica-marca').isVisible(), false);
        assert.equal(await page.locator('#musica-bucle').isVisible(), false);
        await page.locator('#musica-mostrar').click();
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
        await page.route('https://i1.sndcdn.com/**', ruta => ruta.fulfill({path: path.join(__dirname, 'assets/logo/icono-192.png')}));
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
        // Fuera de la libreta, en chico: las flechas sin la marca ni el bucle (sonando, las flechas
        // se esconden para que se lea el título); agrandado, todo.
        // Un tema suelto, sin playlist: sin flechas (pedido de Swa), tampoco en pausa.
        assert.equal(await page.locator('#musica-siguiente').isVisible(), false);
        await page.locator('#musica-play').click();
        assert.equal(await page.locator('#musica-siguiente').isVisible(), false);
        await page.locator('#musica-play').click();
        assert.equal(await page.locator('#musica-marca').isVisible(), false);
        assert.equal(await page.locator('#musica-bucle').isVisible(), false);
        await page.locator('#musica-plegar').click();
        await page.locator('#musica-agrandar').click();
        assert.equal(await page.locator('#musica-marca').isVisible(), true);
        assert.equal(await page.locator('#musica-bucle').isVisible(), true);
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
        assert.ok(Math.abs(chica.height - 80) <= 2, JSON.stringify(chica));
        await page.screenshot({path: `capturas/freestyle-nube-chico-${tema}.png`});
        await page.locator('#musica-plegar').click();
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
        assert.ok(cajonLleno.height > 120 && cajonLleno.height <= 196, `alto del cajón con 3 recientes: ${cajonLleno.height}`);
        const cajaLlena = await page.locator('#fs-instrumental').boundingBox();
        assert.ok(Math.abs(cajaLlena.y + cajaLlena.height - (844 - 86)) <= 2, 'pegado arriba de la barra');
        await page.screenshot({path: `capturas/freestyle-instrumental-${tema}.png`});
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
        // Un archivo también tiene 3 tamaños: chico → mini → grande (con una nota en el cuadro) → chico.
        assert.equal(await page.locator('#reproductor-marco').isVisible(), false);
        await page.locator('#musica-plegar').click();
        assert.ok(Math.abs((await page.locator('#reproductor').boundingBox()).height - 34) <= 1);
        await page.locator('#musica-agrandar').click();
        assert.equal(await page.locator('#reproductor-marco .reproductor-sin-portada').isVisible(), true);
        await page.screenshot({path: `capturas/freestyle-archivo-grande-${tema}.png`});
        await page.locator('#musica-plegar').click();
        assert.equal(await page.locator('#reproductor-marco').isVisible(), false);
        assert.equal(await page.evaluate(() => document.querySelector('#reproductor-oculto audio').paused), false);
        await page.locator('#musica-cerrar').click();
        assert.equal((await page.locator('#fs-recientes .usar-reciente').first().textContent()), 'boom-bap-jazz (CELULAR)');
        // Ya no se cae ninguno: entran hasta 10, y la lista se desliza sin agrandar el cajón.
        assert.equal(await page.locator('#fs-recientes .usar-reciente').count(), 4);
        assert.ok((await page.locator('#fs-cajon').boundingBox()).height <= 196);
        assert.equal(await page.locator('#fs-recientes').evaluate(e => getComputedStyle(e).overflowY), 'auto');
        // Tocar el reciente del teléfono lo vuelve a sacar de lo guardado.
        await page.locator('#fs-recientes .usar-reciente').first().click();
        await page.locator('#reproductor-titulo', {hasText: 'boom-bap-jazz'}).waitFor();
        // Elegir un reciente pliega la lista.
        assert.equal(await page.locator('#fs-recientes-caja').evaluate(d => d.open), false);
        await page.locator('#musica-cerrar').click();
        await page.locator('#fs-recientes-caja summary').click();
        // Plegar «Recientes» achica el cajón, que sigue pegado a la barra.
        const cajonAbierto = await page.locator('#fs-instrumental').boundingBox();
        await page.locator('#fs-recientes-caja summary').click();
        const cajonPlegado = await page.locator('#fs-instrumental').boundingBox();
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
        assert.equal(await page.locator('#temas-libreta .tema-libreta').count(), 22);
        assert.equal(await page.locator('#temas-libreta .marca-tema rect').count(), 20);
        await page.locator('[data-tema="madrugada"]').click();
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
        assert.equal(await page.evaluate(() => document.getElementById('vista-editor').dataset.libreta), 'gris');
        await cerrarLibreta();
        // Comprar: se va la publicidad, se desbloquean los temas y queda después de recargar.
        // Métrica Extras ya no está en Ajustes (por ahora): se abre desde la publicidad de Rimas.
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        await page.locator('#pantalla-rimas .publicidad').click();
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
        await page.locator('[data-tema="madrugada"]').click();
        assert.equal(await page.locator('#paywall').isVisible(), false);
        assert.equal(await page.locator('#temas-libreta .marca-tema rect').count(), 0);
        await page.screenshot({path: `capturas/ajustes-libreta-temas-${tema}.png`});
        // Desde la letra, el baúl no toma su tema: tiene uno solo, el del pincel, que también está (pedido de Swa).
        await page.locator('#cerrar-ajustes-libreta').click();
        await page.locator('#abrir-baul-libreta').click();
        assert.equal(await page.locator('#vista-baul').getAttribute('data-libreta'), null);
        assert.equal(await page.locator('#baul-abrir-ajustes').isVisible(), true);
        await page.locator('#baul-abrir-ajustes').click();
        await page.locator('#temas-baul [data-tema="galaxia"]').click();
        await page.locator('#cerrar-ajustes-baul').click();
        assert.equal(await page.locator('#vista-baul').getAttribute('data-libreta'), 'galaxia');
        await page.screenshot({path: `capturas/baul-galaxia-${tema}.png`});
        await page.locator('#baul-atras').click();
        await page.locator('#editor-atras').click();
        // Desde Letras, el mismo tema; el pincel elige tema, tamaño y si se separan las usadas.
        await page.locator('#abrir-baul').click();
        assert.equal(await page.locator('#vista-baul').getAttribute('data-libreta'), 'galaxia');
        await page.locator('#baul-abrir-ajustes').click();
        assert.equal(await page.locator('#temas-baul .tema-libreta').count(), 22);
        await page.locator('#temas-baul [data-tema="vinilo"]').click();
        await page.locator('#tamanos-baul button', { hasText: 'Chicas' }).click();
        await page.locator('#separar-baul').click();
        assert.equal(await page.locator('#vista-baul').getAttribute('data-libreta'), 'vinilo');
        await page.screenshot({path: `capturas/baul-pincel-${tema}.png`});
        await page.locator('#cerrar-ajustes-baul').click();
        assert.equal(await page.locator('#baul-frases .columna-frases').count(), 3);
        assert.equal(await page.locator('#baul-filtros').isVisible(), false);
        await page.screenshot({path: `capturas/baul-vinilo-${tema}.png`});
        await page.locator('#baul-abrir-ajustes').click();
        await page.locator('#temas-baul [data-tema="papel"]').click();
        await page.locator('#tamanos-baul button', { hasText: 'Grandes' }).click();
        await page.locator('#cerrar-ajustes-baul').click();
        assert.equal(await page.locator('#baul-frases .columna-frases').count(), 1);
        await page.screenshot({path: `capturas/baul-papel-${tema}.png`});
        await page.locator('#baul-abrir-ajustes').click();
        await page.locator('#temas-baul [data-tema="gris"]').click();
        await page.locator('#tamanos-baul button', { hasText: 'Medianas' }).click();
        await page.locator('#separar-baul').click();
        await page.locator('#cerrar-ajustes-baul').click();
        assert.equal(await page.locator('#baul-frases .columna-frases').count(), 2);
        assert.equal(await page.locator('#baul-filtros').isVisible(), true);
        await page.locator('#baul-atras').click();
        await page.reload();
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        assert.equal(await page.locator('#comprar-extras').isDisabled(), true);
        // Widgets: primero en Ajustes, con su pantalla; el «+» de la muestra abre el baúl para anotar.
        assert.equal(await page.locator('#vista-ajustes .encabezado-grupo').first().textContent(), 'Widgets');
        await page.locator('#abrir-widgets').click();
        assert.equal(await page.locator('#vista-widgets').isVisible(), true);
        assert.equal(await page.locator('#widgets-tipos button').count(), 7);
        for (const tipo of await page.locator('#widgets-tipos button').all()) {
            await tipo.click();
            assert.equal(await page.locator('#widgets-inicio .widget').count(), 1);
        }
        await page.locator('#widgets-tipos button').first().click();
        await page.locator('#widgets-inicio .widget-anotar').click();
        assert.equal(await page.locator('#vista-baul').isVisible(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'baul-texto');
        await page.locator('#baul-atras').click();
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        assert.equal(await page.locator('#pantalla-rimas .publicidad').isVisible(), false);
        // Cada letra tiene su tema: una nueva arranca en gris y lo que se elige queda en esa letra.
        await page.locator('#barra-pestanas [data-pestana="letras"]').click();
        await page.locator('#nueva-letra').click();
        await page.locator('#editor-texto').fill('Me acuerdo porque te fuiste\nno me alcanzaban las manos\nsemana entera pensando\ncomo pude aceptarlo');
        assert.equal(await page.evaluate(() => document.getElementById('vista-editor').dataset.libreta), 'gris');
        await page.locator('#abrir-ajustes-libreta').click();
        await page.locator('[data-tema="madrugada"]').click();
        assert.equal(await page.locator('[data-tema="madrugada"]').getAttribute('aria-pressed'), 'true');
        // Dos renglones: arriba los oscuros (Gris liso primero) y abajo los claros (Blanco primero).
        await page.locator('#temas-libreta').evaluate(e => { e.scrollLeft = 0; });
        const [m1, m2] = await Promise.all(['gris', 'blanco'].map(c => page.locator(`#temas-libreta [data-tema="${c}"]`).boundingBox()));
        assert.ok(Math.abs(m1.x - m2.x) < 1 && m2.y > m1.y, JSON.stringify({ m1, m2 }));
        const filaDe = c => page.locator(`#temas-libreta [data-tema="${c}"]`).evaluate(e => e.getBoundingClientRect().top);
        assert.equal(await filaDe('galaxia'), m1.y);
        assert.equal(await filaDe('luna'), m2.y);
        // La barra fina de opacidad, abajo del cajón: arranca en 10 y queda en la letra.
        assert.equal(await page.locator('#opacidad-libreta').inputValue(), '10');
        await page.screenshot({path: `capturas/temas-dos-renglones-${tema}.png`});
        await page.locator('#opacidad-libreta').fill('3');
        assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('vista-editor')).getPropertyValue('--opacidad-tema').trim()), '3');
        assert.match(await page.evaluate(() => getComputedStyle(document.getElementById('vista-editor')).backgroundImage), /linear-gradient.*fondos\/madrugada\.svg/);
        await page.locator('#cerrar-ajustes-libreta').click();
        await page.screenshot({path: `capturas/editor-madrugada-opacidad-${tema}.png`});
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('metrica.letras')).find(l => l.tema === 'madrugada').opacidadTema), 3);
        await page.locator('#abrir-ajustes-libreta').click();
        await page.locator('#opacidad-libreta').fill('10');
        await page.locator('#cerrar-ajustes-libreta').click();
        assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('vista-editor')).backgroundColor), 'rgb(27, 32, 52)');
        assert.match(await page.evaluate(() => getComputedStyle(document.getElementById('vista-editor')).backgroundImage), /fondos\/madrugada\.svg/);
        await page.locator('#editor-texto').blur();
        await page.screenshot({path: `capturas/editor-madrugada-${tema}.png`});
        // Los otros temas de Extras, cada uno con su ilustración abajo.
        for (const otro of ['sierra', 'ondas', 'arena', 'partitura', 'vinilo', 'bosque', 'brasa', 'aurora', 'tinta', 'papel', 'menta', 'cielo', 'durazno', 'cafe', 'galaxia', 'nebulosa', 'saturno', 'eclipse', 'luna']) {
            await page.evaluate(clave => { document.getElementById('vista-editor').dataset.libreta = clave; }, otro);
            assert.match(await page.evaluate(() => getComputedStyle(document.getElementById('vista-editor')).backgroundImage), new RegExp(`fondos/${otro}\\.svg`));
            await page.screenshot({path: `capturas/editor-${otro}-${tema}.png`});
        }
        await page.locator('#editor-atras').click();
        // Otra letra no hereda el tema; al volver a la primera, sigue con el suyo (también al recargar).
        await page.locator('#nueva-letra').click();
        assert.equal(await page.evaluate(() => document.getElementById('vista-editor').dataset.libreta), 'gris');
        await page.locator('#editor-texto').fill('Otra letra');
        await page.locator('#editor-atras').click();
        await page.reload();
        await page.locator('#lista-letras .tarjeta-letra', {hasText: 'Me acuerdo'}).locator('button').first().click();
        assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('vista-editor')).backgroundColor), 'rgb(27, 32, 52)');
        await page.locator('#editor-atras').click();
        await page.locator('#lista-letras .tarjeta-letra', {hasText: 'Otra letra'}).locator('button').first().click();
        assert.equal(await page.evaluate(() => document.getElementById('vista-editor').dataset.libreta), 'gris');
        await page.locator('#abrir-ajustes-libreta').click();
        await page.locator('#borrar-letra').click();
        await page.locator('#aceptar-borrado').click();
        // Volver a la versión gratis: el tema de pago vuelve a gris y vuelve la publicidad.
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        await page.locator('#borrar-compra').click();
        await page.locator('#barra-pestanas [data-pestana="letras"]').click();
        await page.locator('#lista-letras .tarjeta-letra', {hasText: 'Me acuerdo'}).locator('button').first().click();
        assert.equal(await page.evaluate(() => document.getElementById('vista-editor').dataset.libreta), 'gris');
        await page.locator('#abrir-ajustes-libreta').click();
        await page.locator('#borrar-letra').click();
        await page.locator('#aceptar-borrado').click();
        await abrirTemas();
        assert.equal(await page.locator('#temas-libreta .marca-tema rect').count(), 20);
        await cerrarLibreta();

        // Sin internet: recarga desde el service worker y anda todo.
        await page.context().setOffline(true);
        await page.reload();
        assert.equal(await page.locator('#pantalla-letras').isVisible(), true);
        await page.locator('#barra-pestanas [data-pestana="rimas"]').click();
        await page.locator('#buscar-rima').fill('luna');
        assert.ok((await page.locator('#resultados-rimas li').allTextContents()).includes('fortuna'));
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

        // Google Keep (Ajustes): el .zip de Takeout se lee en el teléfono, se marcan las notas y
        // pasan a Letras con su fecha; la que ya está arranca sin marcar y la papelera no aparece.
        await page.locator('#barra-pestanas [data-pestana="ajustes"]').click();
        await page.locator('#abrir-keep').click();
        assert.equal(await page.locator('#vista-keep').isVisible(), true);
        const notaKeep = (title, textContent, extra = {}) => JSON.stringify({ title, textContent, isTrashed: false, isArchived: false,
            userEditedTimestampUsec: 1700000000000000, createdTimestampUsec: 1690000000000000, labels: [{ name: 'Letras' }], ...extra });
        const textoSinInternet = await page.evaluate(() => JSON.parse(localStorage.getItem('metrica.letras'))[0].texto);
        await page.locator('#keep-archivo').setInputFiles({ name: 'takeout-20261027.zip', mimeType: 'application/zip', buffer: armarZip({
            'Takeout/Keep/Después de ese.json': notaKeep('Después de ese', 'la calle me enseñó\na no mirar atrás\ny ahora escribo lo que siento'),
            'Takeout/Conservar/Compras.json': notaKeep('', '', { listContent: [{ text: 'cuerdas' }, { text: 'micrófono' }], labels: [], userEditedTimestampUsec: 1600000000000000, isArchived: true }),
            'Takeout/Conservar/Borrada.json': notaKeep('Borrada', 'chau', { isTrashed: true }),
            'Takeout/Keep/Sin internet.json': notaKeep('Sin internet', textoSinInternet),
            'Takeout/Keep/Después de ese.html': '<p>no</p>',
        }) });
        await page.locator('#keep-lista .celda-keep').first().waitFor();
        assert.deepEqual(await page.locator('#keep-lista .titulo-keep').allTextContents(), ['Después de ese', 'Sin internet', 'cuerdas']);
        assert.match(await page.locator('#keep-lista .datos-keep').nth(1).textContent(), /Ya está en Letras/);
        assert.match(await page.locator('#keep-lista .datos-keep').nth(2).textContent(), /Archivada/);
        assert.equal(await page.locator('#keep-importar').textContent(), 'Pasar 2 a Letras');
        assert.deepEqual(await page.locator('#keep-etiquetas .chip-tema').allTextContents(), ['Todas', 'Letras']);
        await page.screenshot({path: `capturas/keep-${tema}.png`});
        await page.locator('#keep-lista .marca-keep').nth(2).click();
        assert.equal(await page.locator('#keep-importar').textContent(), 'Pasar 1 a Letras');
        await page.locator('#keep-importar').click();
        assert.equal(await page.locator('#keep-estado').textContent(), 'Listo: pasó 1 nota a Letras.');
        await page.locator('#barra-pestanas [data-pestana="letras"]').click();
        assert.deepEqual(await page.locator('#lista-letras .titulo-letra').allTextContents(), ['Sin internet', 'Después de ese']);

        assert.deepEqual(errores, []);
        await page.close();
    }
    await browser.close();
    servidor.close();
    console.log('OK app: pestañas, editor, rimas, palabras, ajustes, claro/oscuro, sin desborde y sin internet.');
})().catch(e => { console.error(e); process.exit(1); });
