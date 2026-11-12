// Prueba Métrica web en la computadora: la barra lateral, la libreta al medio, el panel de ayudas
// (rimas, sinónimos, baúl, IA), el estado de la vinculación, los atajos de teclado y que en el
// celular siga todo como siempre. Uso: node verificar-compu.cjs  (necesita playwright instalado)
const {chromium} = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const tipos = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.md': 'text/plain', '.mp3': 'audio/mpeg', '.txt': 'text/plain'};
const servidor = http.createServer((req, res) => {
    const archivo = path.join(__dirname, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(archivo, (err, datos) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, {'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream'});
        res.end(datos);
    });
});

const sembrar = () => {
    if (localStorage.getItem('sembrado')) return;
    localStorage.setItem('sembrado', '1');
    localStorage.setItem('metrica.web-sin-vincular', '1');
    localStorage.setItem('metrica.letras', JSON.stringify([
        {id: '1761000000000', titulo: 'Ruta', texto: 'Kilómetros de nada\nmi voz en la ventana', editada: 2, orden: 2},
        {id: '1761000007919', titulo: 'Barrio', texto: 'Las luces del barrio\nse apagan de a una', editada: 1, orden: 1},
    ]));
    localStorage.setItem('metrica.frases', JSON.stringify([{id: '1', texto: 'la noche se viste de ayer', creada: 1, usada: false}]));
};

(async () => {
    await new Promise(r => servidor.listen(0, r));
    const url = `http://localhost:${servidor.address().port}/app/`;
    const browser = await chromium.launch();
    fs.mkdirSync('capturas/compu', {recursive: true});
    for (const tema of ['light', 'dark']) {
        const page = await browser.newPage({viewport: {width: 1440, height: 900}, colorScheme: tema});
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        await page.addInitScript(sembrar);
        await page.goto(url);
        await page.waitForTimeout(800);
        const clase = c => page.evaluate(n => document.body.classList.contains(n), c);

        // La barra lateral: fija a la izquierda, con la marca, el estado y el baúl; sin pestañas abajo.
        const barra = await page.locator('#barra-pestanas').boundingBox();
        assert.ok(barra.x === 0 && barra.height === 900 && barra.width < 300, 'barra lateral a la izquierda');
        assert.equal(await page.locator('#estado-web').isVisible(), true);
        assert.equal(await page.textContent('#estado-web-titulo'), 'Sin vincular');
        // Las tarjetas de Letras usan más de dos columnas.
        const columnas = await page.evaluate(() => new Set([...document.querySelectorAll('.tarjeta-letra')].map(t => t.style.gridColumn)).size);
        assert.ok(columnas >= 2);
        await page.screenshot({path: `capturas/compu/letras-${tema}.png`});

        // La libreta con el panel de ayudas a la derecha.
        await page.click('.tarjeta-letra[data-id="1761000000000"] button');
        await page.waitForTimeout(300);
        assert.equal(await clase('con-panel'), true);
        assert.equal(await page.locator('#barra-pestanas').isVisible(), true, 'la barra lateral sigue mientras se escribe');
        const libreta = await page.locator('#vista-editor').boundingBox();
        const panel = await page.locator('#panel-ayudas').boundingBox();
        assert.ok(libreta.x >= barra.width && libreta.x + libreta.width <= panel.x + 1, 'la libreta queda entre la barra y el panel');

        // Tocar una palabra muestra sus rimas; tocar una rima la cambia en la letra.
        const fondo = await page.locator('#editor-fondo').boundingBox();
        await page.mouse.click(fondo.x + 130, fondo.y + 10);
        assert.equal(await page.inputValue('#panel-buscar'), 'nada');
        const rima = (await page.locator('#panel-cuerpo .palabras-panel button').first().textContent()).trim();
        await page.locator('#panel-cuerpo .palabras-panel button').first().click();
        assert.ok((await page.inputValue('#editor-texto')).startsWith(`Kilómetros de ${rima}\n`));
        // Las sugerencias de abajo no aparecen: van en el panel.
        assert.equal(await page.locator('#sugerencias').isVisible(), false);
        await page.screenshot({path: `capturas/compu/libreta-${tema}.png`});

        // Sinónimos de la misma palabra.
        await page.click('[data-panel="sinonimos"]');
        assert.match(await page.textContent('#panel-cuerpo'), /Sinónimos de/);

        // Ctrl + Enter: el verso al baúl.
        await page.keyboard.press('Control+Enter');
        const frases = JSON.parse(await page.evaluate(() => localStorage.getItem('metrica.frases')));
        assert.ok(frases.some(f => f.texto === `Kilómetros de ${rima}`));

        // Baúl: tocar una frase la pone en su renglón donde está el cursor.
        await page.click('[data-panel="baul"]');
        await page.locator('#editor-texto').evaluate(t => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
        await page.locator('.frases-panel li', {hasText: 'la noche se viste'}).click();
        assert.ok((await page.inputValue('#editor-texto')).endsWith('\nla noche se viste de ayer'));
        await page.screenshot({path: `capturas/compu/baul-${tema}.png`});

        // IA: con una frase seleccionada se puede pedir «¿Cómo lo diría Métrica IA?».
        await page.click('[data-panel="ia"]');
        assert.equal(await page.locator('.boton-ia-panel').first().isDisabled(), true);
        await page.locator('#editor-texto').evaluate(t => { t.focus(); t.setSelectionRange(0, 13); t.dispatchEvent(new Event('select')); });
        await page.waitForTimeout(100);
        assert.equal(await page.locator('.boton-ia-panel').first().isDisabled(), false);

        // Ctrl + / cierra y abre el panel; Alt + clic lo abre en Rimas.
        await page.keyboard.press('Control+/');
        assert.equal(await clase('con-panel'), false);
        await page.click('#editor-texto', {modifiers: ['Alt'], position: {x: 20, y: 30}});
        assert.equal(await clase('con-panel'), true);
        assert.equal(await page.getAttribute('[data-panel="rimas"]', 'aria-selected'), 'true');

        // «Letras» en la barra lateral vuelve a la lista; «Baúl de frases» abre el baúl.
        await page.click('#barra-pestanas [data-pestana="letras"]:not([data-vista])');
        assert.equal(await page.locator('#vista-lista-letras').isVisible(), true);
        assert.equal(await clase('editando'), false);
        await page.click('#barra-pestanas [data-vista="baul"]');
        assert.equal(await page.locator('#vista-baul').isVisible(), true);
        assert.equal(await page.getAttribute('#barra-pestanas [data-vista="baul"]', 'aria-selected'), 'true');

        // Alt + N: letra nueva, con el título listo para escribir.
        await page.keyboard.press('Alt+KeyN');
        await page.waitForTimeout(200);
        assert.equal(await page.locator('#vista-editor').isVisible(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'editor-titulo');

        // Freestyle: la barra espaciadora arranca y pausa.
        await page.click('#barra-pestanas [data-pestana="freestyle"]');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        assert.equal(await page.getAttribute('#fs-play', 'aria-label'), 'Pausar');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        assert.equal(await page.getAttribute('#fs-play', 'aria-label'), 'Seguir');
        await page.screenshot({path: `capturas/compu/freestyle-${tema}.png`});

        // Ajustes, sin lo que es solo del iPhone.
        await page.click('#barra-pestanas [data-pestana="ajustes"]');
        for (const id of ['abrir-widgets', 'abrir-keep', 'microfono', 'borrar-compra']) assert.equal(await page.locator(`#${id}`).isVisible(), false, id);
        await page.screenshot({path: `capturas/compu/ajustes-${tema}.png`});
        assert.deepEqual(errores, []);
        await page.close();
    }

    // Pantalla mediana: el panel es una hoja que se abre con su botón y tapa parte de la libreta.
    {
        const page = await browser.newPage({viewport: {width: 860, height: 800}});
        await page.addInitScript(sembrar);
        await page.goto(url);
        await page.waitForTimeout(800);
        await page.click('.tarjeta-letra[data-id="1761000000000"] button');
        assert.equal(await page.locator('#panel-ayudas').isVisible(), false);
        await page.click('#alternar-panel');
        assert.equal(await page.locator('#panel-ayudas').isVisible(), true);
        await page.screenshot({path: 'capturas/compu/mediana.png'});
        await page.click('#cerrar-panel');
        assert.equal(await page.locator('#panel-ayudas').isVisible(), false);
        await page.close();
    }

    // En el celular, todo como siempre: barra de pestañas abajo, sin barra lateral ni panel.
    {
        const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
        await page.addInitScript(sembrar);
        await page.goto(url);
        await page.waitForTimeout(800);
        const barra = await page.locator('#barra-pestanas').boundingBox();
        assert.ok(barra.y > 700 && barra.width < 400, 'barra de pestañas abajo');
        for (const sel of ['#estado-web', '.marca-lateral', '#barra-pestanas [data-vista="baul"]']) assert.equal(await page.locator(sel).isVisible(), false, sel);
        await page.click('.tarjeta-letra[data-id="1761000000000"] button');
        assert.equal(await page.locator('#panel-ayudas').isVisible(), false);
        assert.equal(await page.locator('#alternar-panel').isVisible(), false);
        await page.screenshot({path: 'capturas/compu/celular.png'});
        await page.close();
    }
    await browser.close();
    servidor.close();
    console.log('Métrica web en la computadora: todo bien.');
})().catch(e => { console.error(e); process.exit(1); });
