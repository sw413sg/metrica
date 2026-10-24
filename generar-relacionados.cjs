// Genera relacionados.js con las palabras más cercanas de cada una según ConceptNet Numberbatch 19.08
// (CC BY-SA 4.0) y la lista propia diccionario/relacionados-propios.txt.
// Uso: node generar-relacionados.cjs ruta/a/numberbatch-19.08.txt.gz (3 GB, ver diccionario/README.md).
// Escribe textoRelacionados: "palabra:a,b,c" por línea, de la más cercana a la menos cercana.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const readline = require('node:readline');
const root = __dirname;
const leerJs = (archivo, variable) => vm.runInNewContext(fs.readFileSync(path.join(root, archivo), 'utf8') + `\n${variable};`);

const VOCABULARIO = 60000, PREGUNTAS = 20000, POR_PALABRA = 20, MINIMO = 0.3, DIMENSIONES = 300;

// Las 60.000 palabras más usadas; las preguntas son las 20.000 primeras.
const orden = leerJs('frecuencias.js', 'textoFrecuencias').split('\n').filter(Boolean).map(l => l.split(' ')[0]).slice(0, VOCABULARIO);
const lugar = new Map(orden.map((p, i) => [p, i]));
// Solo se sugieren palabras base del diccionario (no "amaran" ni "noches") y sin conjugaciones.
// En es.dic las que no llevan banderas son casi todas verbos irregulares ("anduvo") o adverbios en -mente: no entran.
const lemas = new Set(fs.readFileSync(path.join(root, 'diccionario/es.dic'), 'utf8').split(/\r?\n/).slice(1)
    .map(l => l.trim().normalize('NFC').split(/\s/)[0]).filter(l => l.includes('/')).map(l => l.split('/')[0]).filter(p => p === p.toLowerCase()));
const formas = new Set();
for (const linea of leerJs('sinonimos.js', 'textoFormasSinonimos').split('\n')) {
    const [base, codigos] = linea.split(':');
    if (!codigos) continue;
    for (const codigo of codigos.split(',')) {
        const [, sacar, agregar] = codigo.match(/^(\d+)(.*)$/);
        formas.add(base.slice(0, base.length - Number(sacar)) + agregar);
    }
}

// Dos palabras de la misma familia ("noche" y "noches", "luna" y "lunar") no se sugieren entre sí.
function comun(a, b) {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return n;
}
const parecidas = (a, b) => comun(a, b) >= Math.max(4, Math.min(a.length, b.length) - 2);

async function leerVectores(archivo) {
    const vectores = new Map();
    const entrada = fs.createReadStream(archivo).pipe(archivo.endsWith('.gz') ? zlib.createGunzip() : new (require('node:stream').PassThrough)());
    for await (const linea of readline.createInterface({ input: entrada, crlfDelay: Infinity })) {
        if (!linea.startsWith('/c/es/')) continue;
        const espacio = linea.indexOf(' ');
        const palabra = linea.slice(6, espacio).normalize('NFC');
        if (!lugar.has(palabra) || vectores.has(palabra)) continue;
        const v = new Float32Array(linea.slice(espacio + 1).split(' ').map(Number));
        let largo = 0;
        for (const x of v) largo += x * x;
        largo = Math.sqrt(largo) || 1;
        for (let i = 0; i < v.length; i++) v[i] /= largo;
        vectores.set(palabra, v);
    }
    return vectores;
}

async function main() {
    const archivo = process.argv[2];
    if (!archivo) throw new Error('Falta la ruta a numberbatch-19.08.txt.gz');
    const vectores = await leerVectores(archivo);
    const candidatas = orden.filter(p => vectores.has(p) && lemas.has(p) && !formas.has(p) && p.length >= 3);
    const matriz = new Float32Array(candidatas.length * DIMENSIONES);
    candidatas.forEach((p, i) => matriz.set(vectores.get(p), i * DIMENSIONES));

    const relacionados = new Map();
    // Lo propio va primero y en el orden del archivo.
    for (const linea of fs.readFileSync(path.join(root, 'diccionario/relacionados-propios.txt'), 'utf8').normalize('NFC').split(/\r?\n/)) {
        if (!linea.trim() || linea.startsWith('#')) continue;
        const [palabra, lista] = linea.split(':');
        relacionados.set(palabra.trim(), lista.split(',').map(p => p.trim()).filter(Boolean));
    }
    const puntaje = new Float32Array(candidatas.length);
    const preguntas = orden.slice(0, PREGUNTAS).filter(p => vectores.has(p) && p.length >= 3);
    for (const palabra of preguntas) {
        const q = vectores.get(palabra);
        for (let i = 0; i < candidatas.length; i++) {
            let s = 0;
            const base = i * DIMENSIONES;
            for (let d = 0; d < DIMENSIONES; d++) s += q[d] * matriz[base + d];
            puntaje[i] = s;
        }
        const mejores = [];
        for (let i = 0; i < candidatas.length; i++) if (puntaje[i] >= MINIMO) mejores.push(i);
        mejores.sort((a, b) => puntaje[b] - puntaje[a]);
        const lista = relacionados.get(palabra) ?? [];
        for (const i of mejores) {
            if (lista.length >= POR_PALABRA + (relacionados.has(palabra) ? 10 : 0)) break;
            const otra = candidatas[i];
            if (otra !== palabra && !parecidas(otra, palabra) && !lista.some(p => parecidas(p, otra))) lista.push(otra);
        }
        if (lista.length) relacionados.set(palabra, lista);
    }
    const lineas = [...relacionados].map(([palabra, lista]) => palabra + ':' + lista.join(','));
    fs.writeFileSync(path.join(root, 'relacionados.js'),
        '// Palabras relacionadas: ConceptNet Numberbatch 19.08 (CC BY-SA 4.0) más una lista propia.\n' +
        '// Fuente, licencia y transformación: diccionario/README.md. Generado con generar-relacionados.cjs.\n' +
        'const textoRelacionados = `\n' + lineas.join('\n') + '\n`;\n');
    console.log(`${lineas.length} palabras con relacionadas, entre ${candidatas.length} candidatas.`);
}
main();
