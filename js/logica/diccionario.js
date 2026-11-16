// Diccionario: convierte el texto de palabras.js / palabras-simples.js
// (una palabra por línea) en listas listas para usar. Sin DOM.

export function parsearPalabras(texto) {
    const palabras = texto.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
    return [...new Set(palabras)];
}

// Frecuencias ("palabra cantidad" por línea, como diccionario/frecuencias-es.txt
// o frecuencias.js) para ordenar las rimas de más usadas a menos usadas.
export function parsearFrecuencias(texto) {
    const frecuencias = new Map();
    for (const _ of leerFrecuencias(texto, frecuencias));
    return frecuencias;
}

// Lo mismo, en partes: entre parte y parte espera a `ceder()`, así la app no se traba.
export async function parsearFrecuenciasPorPartes(texto, ceder = () => new Promise(r => setTimeout(r))) {
    const frecuencias = new Map();
    for (const _ of leerFrecuencias(texto, frecuencias)) await ceder();
    return frecuencias;
}

function* leerFrecuencias(texto, frecuencias, porParte = 20000) {
    // Normalizar todo el texto de una vez es mucho más rápido que renglón por renglón.
    const lineas = texto.normalize('NFC').split(/\r?\n/);
    yield;
    for (let i = 0; i < lineas.length; i++) {
        if (i && i % porParte === 0) yield;
        const [palabra, cantidad] = lineas[i].trim().split(/\s+/);
        const numero = Number(cantidad);
        if (palabra && cantidad && Number.isFinite(numero) && !frecuencias.has(palabra)) frecuencias.set(palabra, numero);
    }
}
