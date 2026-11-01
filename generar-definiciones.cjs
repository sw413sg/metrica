// Genera definiciones.txt (el diccionario de definiciones de Rimas) desde el Wikcionario
// en español, ya limpio por reader.dict y empaquetado para PocketBook por
// jcordon5/diccionario-es-pocketbook (CC BY-SA 4.0). Ver diccionario/README.md.
//
// Uso: node generar-definiciones.cjs ruta/a/diccionario-es.dic
//
// El .dic de PocketBook guarda las entradas en bloques zlib: cada entrada es
// [largo de 2 bytes][palabra]\0[html]\n\0. De cada html se queda con la categoría
// (sustantivo, verbo...) y las acepciones numeradas; saca pronunciación, sinónimos,
// ejemplos y etimología. Las formas sin entrada propia ("perros", "fuimos") apuntan
// a su palabra, pero solo las que están en palabras.js (las que se usan de verdad).
//
// Formato de salida, un renglón por palabra, separado por tabs:
//   casa	#sustantivo	Vivienda¦Edificación destinada a vivienda.	Domicilio.
//   fuimos	>ir	>ser
// "#" abre una categoría, "¦" separa la materia de la acepción y ">" es "forma de".
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAXIMO_ACEPCIONES = 12; // por categoría: más allá son usos muy raros
const MAXIMO_LARGO = 400; // las acepciones larguísimas se cortan

const origen = process.argv[2];
if (!origen) {
    console.error('Uso: node generar-definiciones.cjs ruta/a/diccionario-es.dic');
    process.exit(1);
}
const raiz = __dirname;
const datos = fs.readFileSync(origen);

// Los bloques zlib, uno atrás del otro (los dos primeros son reglas del lector).
function bloques() {
    const salida = [];
    let i = 0;
    while (i < datos.length - 2) {
        if (datos[i] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(datos[i + 1])) {
            try {
                const { buffer, engine } = zlib.inflateSync(datos.subarray(i), { info: true });
                if (buffer.length > 50) {
                    salida.push(buffer);
                    i += engine.bytesWritten;
                    continue;
                }
            } catch { /* no era un bloque */ }
        }
        i++;
    }
    return salida.slice(2);
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function texto(html) {
    let t = html.replace(/<[^>]+>/g, '');
    for (let i = 0; i < 2; i++) {
        t = t.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
            if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
            return ENTIDADES[e.toLowerCase()] ?? m;
        });
    }
    return t.replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function acortar(t) {
    if (t.length <= MAXIMO_LARGO) return t;
    const corte = t.lastIndexOf(' ', MAXIMO_LARGO);
    return t.slice(0, corte > 0 ? corte : MAXIMO_LARGO) + '…';
}

// Un html de entrada -> { categorias: [[nombre, [acepciones]]], formas: [palabra] }
function leerEntrada(html) {
    const categorias = [];
    const formas = [];
    let actual = null;
    for (const div of html.match(/<div[^>]*>[\s\S]*?<\/div>/g) || []) {
        const apertura = div.match(/^<div([^>]*)>/)[1];
        const cuerpo = div.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
        if (/margin-left/.test(apertura)) continue; // sinónimos y ejemplos
        if (/Etimolog/.test(cuerpo) && /margin-top/.test(apertura)) continue;
        if (/margin-top/.test(apertura)) {
            const forma = cuerpo.match(/<i>forma de<\/i><b>\s*([^<]+)<\/b>/);
            if (forma) {
                formas.push(texto(forma[1]).toLowerCase());
                actual = null; // lo que sigue es un resumen de la otra palabra
                continue;
            }
            actual = [texto(cuerpo), []];
            if (actual[0]) categorias.push(actual);
            continue;
        }
        const numerada = cuerpo.match(/^\s*<b>\s*\d+\.\s*<\/b>([\s\S]*)$/);
        if (!numerada || !actual) continue;
        let resto = numerada[1];
        let materia = '';
        const etiqueta = resto.match(/^\s*<i>\s*([^<]{1,40}?)\.?\s*<\/i>/);
        if (etiqueta && /^[\p{Lu}]/u.test(etiqueta[1].trim())) {
            materia = texto(etiqueta[1]).replace(/\.$/, '');
            resto = resto.slice(etiqueta[0].length);
        }
        // Lo que el lector pegó al final (":;a: Sinónimos: ...") no es parte de la acepción.
        let definicion = texto(resto).replace(/:;.*$/, '').trim();
        if (!definicion || actual[1].length >= MAXIMO_ACEPCIONES) continue;
        definicion = acortar(definicion);
        actual[1].push(materia ? `${materia}¦${definicion}` : definicion);
    }
    return { categorias: categorias.filter(c => c[1].length), formas };
}

const palabrasApp = new Set(fs.readFileSync(path.join(raiz, 'palabras.js'), 'utf8').split('\n').map(p => p.trim().normalize('NFC')).filter(Boolean));

const entradas = new Map(); // palabra -> { categorias, formas }
for (const bloque of bloques()) {
    let p = 0;
    while (p + 2 <= bloque.length) {
        const fin = bloque.indexOf(0, p + 2);
        if (fin < 0) break;
        const palabra = bloque.toString('utf8', p + 2, fin).normalize('NFC').trim();
        let cierre = bloque.indexOf('\n\0', fin);
        if (cierre < 0) cierre = bloque.length;
        const html = bloque.toString('utf8', fin + 1, cierre);
        p = cierre + 2;
        if (!palabra || /[\t\n]/.test(palabra)) continue;
        const { categorias, formas } = leerEntrada(html);
        const clave = palabra.toLowerCase();
        const previa = entradas.get(clave) || { categorias: [], formas: [] };
        // Si hay "Casa" y "casa", va primero la de minúscula.
        if (palabra === clave) previa.categorias.unshift(...categorias);
        else previa.categorias.push(...categorias);
        previa.formas.push(...formas);
        entradas.set(clave, previa);
    }
}

const conDefinicion = new Set([...entradas].filter(([, e]) => e.categorias.length).map(([p]) => p));
const renglones = [];
let soloFormas = 0;
for (const [palabra, { categorias, formas }] of [...entradas].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const bases = [...new Set(formas)].filter(f => f !== palabra && conDefinicion.has(f));
    const campos = [];
    if (categorias.length) {
        for (const [nombre, acepciones] of categorias) campos.push(`#${nombre}`, ...acepciones);
    } else {
        // Las formas solas, solo si se usan (están en palabras.js): son la mayoría del archivo.
        if (!bases.length || !palabrasApp.has(palabra)) continue;
        soloFormas++;
    }
    campos.push(...bases.map(b => `>${b}`));
    if (campos.length) renglones.push(`${palabra}\t${campos.join('\t')}`);
}

const cabecera = '# Definiciones: Wikcionario en español (CC BY-SA 4.0), vía reader.dict y diccionario-es-pocketbook. Ver diccionario/README.md. Generado con generar-definiciones.cjs.';
fs.writeFileSync(path.join(raiz, 'definiciones.txt'), `${cabecera}\n${renglones.join('\n')}\n`);
console.log(`${conDefinicion.size} palabras con definición, ${soloFormas} formas, ${renglones.length} renglones`);
