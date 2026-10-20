// Motor de rimas en español. Sin DOM.
// TODO (paso 1 del plan): implementar teniendo en cuenta acentos,
// diptongos/hiatos y palabras agudas, graves y esdrújulas.

// Parte de la palabra desde la última vocal tónica: "canción" -> "ón".
export function claveConsonante(palabra) {
    return null;
}

// Solo las vocales desde la tónica: "canción" -> "o", "casa" -> "aa".
export function claveAsonante(palabra) {
    return null;
}

// Devuelve las palabras que riman con `palabra`, de más usadas a menos usadas.
// tipo: 'consonante' | 'asonante'. frecuencias: Map palabra -> cantidad.
export function buscarRimas(palabra, palabras, { tipo = 'consonante', frecuencias = new Map() } = {}) {
    return [];
}
