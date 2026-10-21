// Sinónimos: arma el índice desde los textos de sinonimos.js y busca los de una palabra. Sin DOM.
// En SwiftUI es un [String: [[String]]] leído del mismo archivo.

// textoSinonimos: "palabra:a,b;c,d" (un grupo por significado).
// textoFormas: "base:código,..." donde el código es cuántas letras sacarle a la base y qué agregar
// ("lindo:1as" = lindas), para encontrar los sinónimos de una palabra conjugada o en plural.
export function crearIndiceSinonimos(textoSinonimos, textoFormas = '') {
    const grupos = new Map();
    for (const linea of textoSinonimos.split('\n')) {
        const dos = linea.indexOf(':');
        if (dos > 0) grupos.set(linea.slice(0, dos), linea.slice(dos + 1));
    }
    const bases = new Map();
    for (const linea of textoFormas.split('\n')) {
        const [base, codigos] = linea.split(':');
        if (!codigos) continue;
        for (const codigo of codigos.split(',')) {
            const [, sacar, agregar] = codigo.match(/^(\d+)(.*)$/);
            bases.set(base.slice(0, base.length - Number(sacar)) + agregar, base);
        }
    }
    return { grupos, bases };
}

// Los sinónimos de la palabra (o de su base), sin repetir, en el orden de los grupos.
export function buscarSinonimos(palabra, { grupos, bases }) {
    const minuscula = palabra.toLowerCase();
    const clave = grupos.has(minuscula) ? minuscula : bases.get(minuscula);
    if (!clave) return [];
    const lista = grupos.get(clave).split(/[;,]/);
    return [...new Set(lista)].filter(s => s !== minuscula);
}
