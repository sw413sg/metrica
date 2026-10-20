// Generador de palabras al azar (lo que ya hacía la versión anterior). Sin DOM.

export function palabrasAlAzar(palabras, cantidad, azar = Math.random) {
    const copia = palabras.slice();
    const total = Math.min(cantidad, copia.length);
    for (let i = 0; i < total; i++) {
        const j = i + Math.floor(azar() * (copia.length - i));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia.slice(0, total);
}

export function filtrarPorTerminacion(palabras, terminacion) {
    const fin = terminacion.trim().toLowerCase();
    return fin ? palabras.filter(p => p.endsWith(fin)) : palabras;
}
