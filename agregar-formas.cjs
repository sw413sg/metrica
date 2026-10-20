// Ejecutar con: node agregar-formas.cjs
// Suma a palabras.js las formas que RLA-ES arma con sufijos (verbos conjugados,
// plurales, femeninos...), pero solo las que aparecen en diccionario/frecuencias-es.txt
// al menos MINIMO veces: así entran "cantó" o "quería" y no formas que nadie usa.
// Los prefijos (anti-, auto-...) no se expanden. Es idempotente.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const MINIMO = 2;
const root = __dirname;

// Sufijos de es.aff: "SFX bandera quitar agregar[/banderas] condición".
const sufijos = new Map();
for (const linea of fs.readFileSync(path.join(root, 'diccionario/es.aff'), 'utf8').split(/\r?\n/)) {
    const partes = linea.trim().split(/\s+/);
    if (partes[0] !== 'SFX' || partes.length < 5) continue;
    const [, bandera, quitar, agregarConBanderas, condicion] = partes;
    const [agregar, siguientes = ''] = agregarConBanderas.split('/');
    if (!sufijos.has(bandera)) sufijos.set(bandera, []);
    sufijos.get(bandera).push({
        quitar: quitar === '0' ? '' : quitar,
        agregar: agregar === '0' ? '' : agregar,
        siguientes: [...siguientes],
        condicion: new RegExp((condicion === '.' ? '' : condicion) + '$', 'u'),
    });
}

function formas(palabra, banderas, salida) {
    for (const bandera of banderas) {
        for (const regla of sufijos.get(bandera) ?? []) {
            if (!regla.condicion.test(palabra) || !palabra.endsWith(regla.quitar)) continue;
            const forma = palabra.slice(0, palabra.length - regla.quitar.length) + regla.agregar;
            salida.add(forma);
            if (regla.siguientes.length) formas(forma, regla.siguientes, salida);
        }
    }
}

const generadas = new Set();
const entradas = fs.readFileSync(path.join(root, 'diccionario/es.dic'), 'utf8').split(/\r?\n/).slice(1);
for (const entrada of entradas) {
    const [palabra, banderas = ''] = entrada.trim().normalize('NFC').split(/\s/)[0].split('/');
    if (/^[a-záéíóúüñ]+$/u.test(palabra)) formas(palabra, [...banderas], generadas);
}

const usadas = new Set();
for (const linea of fs.readFileSync(path.join(root, 'diccionario/frecuencias-es.txt'), 'utf8').split(/\r?\n/)) {
    const [palabra, cantidad] = linea.trim().normalize('NFC').split(/\s+/);
    if (Number(cantidad) >= MINIMO && generadas.has(palabra)) usadas.add(palabra);
}

const destino = path.join(root, 'palabras.js');
const actuales = vm.runInNewContext(fs.readFileSync(destino, 'utf8') + '\ntextoPalabras;').split(/\r?\n/).filter(Boolean);
const palabras = new Set(actuales);
for (const palabra of usadas) palabras.add(palabra);
fs.writeFileSync(destino, '// Ampliado con RLA-ES. Fuente y licencia: diccionario/README.md\n' +
    'const textoPalabras = `\n' + [...palabras].join('\n') + '\n`;\n', 'utf8');
console.log(JSON.stringify({formasGeneradas: generadas.size, usadas: usadas.size, antes: actuales.length, agregadas: palabras.size - actuales.length, total: palabras.size}, null, 2));
