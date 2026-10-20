// Diccionario: convierte el texto de palabras.js / palabras-simples.js
// (una palabra por línea) en listas listas para usar. Sin DOM.

export function parsearPalabras(texto) {
    const palabras = texto.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
    return [...new Set(palabras)];
}

// TODO (paso 1): leer diccionario/frecuencias-es.txt ("palabra cantidad" por línea)
// para ordenar las rimas de más usadas a menos usadas.
export function parsearFrecuencias(texto) {
    return new Map();
}
