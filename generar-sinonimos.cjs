// Genera sinonimos.js desde el tesauro de LibreOffice (diccionario/th_es_v2.dat, LGPL 2.1)
// y la lista propia diccionario/sinonimos-rioplatenses.txt. Uso: node generar-sinonimos.cjs
// Escribe dos textos:
// - textoSinonimos: "palabra:a,b,c;d,e" por línea, un grupo por significado, cada grupo
//   los del tesauro ordenados de más usada a menos usada (frecuencias.js). Solo palabras sueltas.
// - textoFormasSinonimos: "base:código,código" para encontrar la base de "lindas" o "quería".
//   Cada código dice cuántas letras sacarle al final de la base y qué agregar: "lindo:1as" = lindas.
//   Las formas salen de los sufijos de es.aff y solo entran las que están en palabras.js.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
const leerJs = (archivo, variable) => vm.runInNewContext(fs.readFileSync(path.join(root, archivo), 'utf8') + `\n${variable};`);

const frecuencias = new Map(leerJs('frecuencias.js', 'textoFrecuencias').split('\n').filter(Boolean).map(l => {
    const [palabra, cantidad] = l.split(' ');
    return [palabra, Number(cantidad)];
}));
const porFrecuencia = (a, b) => (frecuencias.get(b) ?? 0) - (frecuencias.get(a) ?? 0);
const suelta = palabra => /^\p{L}+$/u.test(palabra);

// Tesauro: "palabra|cantidad" y después un renglón "-|sin1|sin2..." por significado. Viene en ISO-8859-1.
const grupos = new Map();
function sumarGrupo(palabra, sinonimos, alPrincipio = false) {
    const lista = [...new Set(sinonimos.filter(s => suelta(s) && s.toLowerCase() !== palabra))];
    if (!lista.length) return;
    if (!grupos.has(palabra)) grupos.set(palabra, []);
    grupos.get(palabra)[alPrincipio ? 'unshift' : 'push'](lista);
}
const tesauro = fs.readFileSync(path.join(root, 'diccionario/th_es_v2.dat'), 'latin1').normalize('NFC').split(/\r?\n/);
for (let i = 1; i < tesauro.length; i++) {
    const [palabra, cantidad] = tesauro[i].split('|');
    if (!palabra || !cantidad) continue;
    for (let k = 1; k <= Number(cantidad); k++) {
        if (suelta(palabra)) sumarGrupo(palabra.toLowerCase(), tesauro[i + k].split('|').slice(1).sort(porFrecuencia));
    }
    i += Number(cantidad);
}
// Lo rioplatense va primero y en el orden del archivo (sin ordenar por frecuencia). Se suma de atrás para adelante para que quede en el orden del archivo.
const propios = fs.readFileSync(path.join(root, 'diccionario/sinonimos-rioplatenses.txt'), 'utf8').normalize('NFC')
    .split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).map(l => l.split(',').map(p => p.trim()));
for (const grupo of propios.reverse()) {
    for (const palabra of grupo) sumarGrupo(palabra, grupo, true);
}

const lineas = [...grupos].map(([palabra, lista]) => palabra + ':' + lista.map(g => g.join(',')).join(';'));

// Formas: igual que agregar-formas.cjs, pero recordando de qué base sale cada una.
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
const palabras = new Set(leerJs('palabras.js', 'textoPalabras').split('\n').filter(Boolean));
const formasDe = new Map(), yaTieneBase = new Set();
function formas(palabra, banderas, base) {
    for (const bandera of banderas) {
        for (const regla of sufijos.get(bandera) ?? []) {
            if (!regla.condicion.test(palabra) || !palabra.endsWith(regla.quitar)) continue;
            const forma = palabra.slice(0, palabra.length - regla.quitar.length) + regla.agregar;
            if (palabras.has(forma) && !grupos.has(forma) && !yaTieneBase.has(forma)) {
                yaTieneBase.add(forma);
                let comun = 0;
                while (comun < base.length && base[comun] === forma[comun]) comun++;
                formasDe.get(base).push((base.length - comun) + forma.slice(comun));
            }
            if (regla.siguientes.length) formas(forma, regla.siguientes, base);
        }
    }
}
for (const entrada of fs.readFileSync(path.join(root, 'diccionario/es.dic'), 'utf8').split(/\r?\n/).slice(1)) {
    const [palabra, banderas = ''] = entrada.trim().normalize('NFC').split(/\s/)[0].split('/');
    if (!grupos.has(palabra) || !banderas) continue;
    if (!formasDe.has(palabra)) formasDe.set(palabra, []);
    formas(palabra, [...banderas], palabra);
}
const lineasFormas = [...formasDe].filter(([, lista]) => lista.length).map(([base, lista]) => base + ':' + lista.join(','));

fs.writeFileSync(path.join(root, 'sinonimos.js'),
    '// Sinónimos: tesauro de LibreOffice (OpenThesaurus-es, LGPL 2.1) más una lista rioplatense propia.\n' +
    '// Fuente, licencia y transformación: diccionario/README.md. Generado con generar-sinonimos.cjs.\n' +
    'const textoSinonimos = `\n' + lineas.join('\n') + '\n`;\n' +
    'const textoFormasSinonimos = `\n' + lineasFormas.join('\n') + '\n`;\n');
console.log(`${lineas.length} palabras con sinónimos, ${yaTieneBase.size} formas de ${lineasFormas.length} bases.`);
