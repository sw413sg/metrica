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
    for (const linea of texto.split(/\r?\n/)) {
        const [palabra, cantidad] = linea.trim().normalize('NFC').split(/\s+/);
        const numero = Number(cantidad);
        if (palabra && cantidad && Number.isFinite(numero) && !frecuencias.has(palabra)) frecuencias.set(palabra, numero);
    }
    return frecuencias;
}
