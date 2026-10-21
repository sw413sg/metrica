// Errores de tipeo: si una palabra no está en el diccionario, busca la que se quiso
// escribir (sin la tilde o con una letra de más, de menos, cambiada o dada vuelta).
// Así "balcon" se reconoce como "balcón" y rima igual. Sin DOM.

// Saca tildes y diéresis pero deja la ñ.
export function sinTildes(palabra) {
    return palabra.normalize('NFD').replace(/[́̈]/g, '').normalize('NFC');
}

const LETRAS = 'abcdefghijklmnñopqrstuvwxyz';

// Todas las palabras a un error de distancia.
function variantes(p) {
    const salida = [];
    for (let i = 0; i <= p.length; i++) {
        const a = p.slice(0, i), b = p.slice(i);
        if (b) salida.push(a + b.slice(1));
        if (b.length > 1) salida.push(a + b[1] + b[0] + b.slice(2));
        for (const l of LETRAS) {
            if (b) salida.push(a + l + b.slice(1));
            salida.push(a + l + b);
        }
    }
    return salida;
}

// Devuelve corregir(palabra): la palabra bien escrita (en minúscula), o null si
// ya está bien o no se encontró nada parecido.
export function crearCorrector(palabras, frecuencias) {
    const conocidas = new Set(palabras);
    const frecuencia = p => frecuencias.get(p) ?? 0;
    const porForma = new Map(); // forma sin tildes -> la palabra más usada que se escribe así
    for (const p of palabras) {
        const forma = sinTildes(p);
        const actual = porForma.get(forma);
        if (!actual || frecuencia(p) > frecuencia(actual)) porForma.set(forma, p);
    }
    const hechas = new Map();
    const buscar = minuscula => {
        const forma = sinTildes(minuscula);
        const conTilde = porForma.get(forma);
        if (conocidas.has(minuscula)) {
            // Está en el diccionario, pero con tilde se usa muchísimo más ("accion" -> "acción").
            // "mas", "esta", "papa" y "mama" se dejan: las dos formas son comunes.
            return conTilde && conTilde !== minuscula && frecuencia(conTilde) >= 25 * frecuencia(minuscula) ? conTilde : null;
        }
        if (conTilde) return conTilde;
        // Voseo rioplatense sin tilde: "queres" es "querés" (de querer), "venis" es "venís".
        const voseo = forma.match(/^(\p{L}+)([aei])s$/u);
        const infinitivo = voseo && voseo[1] + voseo[2] + 'r';
        if (voseo && conocidas.has(infinitivo)) return voseo[1] + { a: 'á', e: 'é', i: 'í' }[voseo[2]] + 's';
        // Una letra mal solo en palabras de 5 o más, y hacia palabras bastante usadas
        // (así no se corrigen palabras en inglés como "baby" o "full").
        if (forma.length < 5) return null;
        let mejor = null;
        for (const variante of variantes(forma)) {
            const candidata = porForma.get(variante);
            if (candidata && frecuencia(candidata) >= 1000 && frecuencia(candidata) > frecuencia(mejor)) mejor = candidata;
        }
        return mejor;
    };
    return palabra => {
        const minuscula = palabra.toLowerCase();
        if (!hechas.has(minuscula)) hechas.set(minuscula, buscar(minuscula));
        return hechas.get(minuscula);
    };
}
