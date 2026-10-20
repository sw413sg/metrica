// Genera frecuencias.js: "palabra cantidad" solo para las palabras de palabras.js,
// sacado de diccionario/frecuencias-es.txt (13,9 MB, demasiado para la app).
// Sirve para mostrar primero las rimas más usadas. Uso: node generar-frecuencias.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
const dictionary = new Set(vm.runInNewContext(fs.readFileSync(path.join(root, 'palabras.js'), 'utf8') + '\ntextoPalabras;').split(/\r?\n/).filter(Boolean));
const counts = new Map();
for (const line of fs.readFileSync(path.join(root, 'diccionario/frecuencias-es.txt'), 'utf8').split(/\r?\n/)) {
    const [word, count] = line.trim().normalize('NFC').split(/\s+/);
    if (dictionary.has(word) && Number.isFinite(Number(count)) && !counts.has(word)) counts.set(word, Number(count));
}
const lines = [...counts].sort((a, b) => b[1] - a[1]).map(([word, count]) => `${word} ${count}`);
fs.writeFileSync(path.join(root, 'frecuencias.js'), '// Frecuencias de FrequencyWords / OpenSubtitles 2018. CC BY-SA 4.0.\n// Fuente, atribución y transformación: diccionario/README.md\nconst textoFrecuencias = `\n' + lines.join('\n') + '\n`;\n');
console.log(`Generadas ${lines.length} frecuencias de ${dictionary.size} palabras del diccionario.`);
