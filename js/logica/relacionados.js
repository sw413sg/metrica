// Palabras relacionadas: arma el índice desde el texto de relacionados.js y busca las de una palabra. Sin DOM.
// En SwiftUI es un [String: [String]] leído del mismo archivo.

// texto: "palabra:a,b,c" por línea, de la más cercana a la menos cercana.
export function crearIndiceRelacionados(texto) {
    const indice = new Map();
    for (const linea of texto.split('\n')) {
        const dos = linea.indexOf(':');
        if (dos > 0) indice.set(linea.slice(0, dos), linea.slice(dos + 1));
    }
    return indice;
}

// Las relacionadas con la palabra. Si no está tal cual, prueba sin la ese del plural ("noches" → "noche").
export function buscarRelacionados(palabra, indice) {
    const minuscula = palabra.toLowerCase();
    const clave = [minuscula, minuscula.replace(/s$/, ''), minuscula.replace(/es$/, '')].find(p => indice.has(p));
    return clave ? indice.get(clave).split(',').filter(p => p !== minuscula) : [];
}
