// Diccionario de definiciones (modo Diccionario de Rimas). Lee definiciones.txt
// (Wikcionario en español, ver diccionario/README.md) y busca una palabra aunque esté
// mal escrita: sin tilde, con una letra de más, de menos o cambiada, o escrita como
// suena ("aser" -> "hacer", "vaya"/"valla", "sielo" -> "cielo"). Sin DOM.

// Sin tildes ni diéresis (deja la ñ). Más rápida que normalize, para las 200 mil palabras.
const SIN_TILDE = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u' };
export const sinTildes = p => p.replace(/[áéíóúüàèìòù]/g, l => SIN_TILDE[l]);

// definiciones.txt: un renglón por palabra, separado por tabs. "#" abre una categoría,
// "¦" separa la materia de la acepción y ">" dice de qué palabra es forma.
export function crearIndiceDefiniciones(texto, frecuencias = new Map()) {
    const entradas = new Map();
    for (const renglon of texto.split('\n')) {
        if (!renglon || renglon[0] === '#') continue;
        const tab = renglon.indexOf('\t');
        if (tab > 0) entradas.set(renglon.slice(0, tab), renglon.slice(tab + 1));
    }
    const frecuencia = p => frecuencias.get(p) ?? 0;
    // Entre dos que se escriben o suenan igual, la más usada; a igual uso, la que tiene definición propia.
    const mejor = (a, b) => {
        if (!a) return b;
        const fa = frecuencia(a), fb = frecuencia(b);
        if (fa !== fb) return fb > fa ? b : a;
        const propiaA = entradas.get(a)[0] === '#', propiaB = entradas.get(b)[0] === '#';
        if (propiaA !== propiaB) return propiaB ? b : a;
        return a.length <= b.length ? a : b;
    };
    // Los índices para lo mal escrito tardan (unas 200 mil palabras): se arman de a pedazos
    // con armarPedazo (así no se traba la pantalla), o de una la primera vez que hacen falta.
    const porForma = new Map(), porSonido = new Map();
    const palabras = [...entradas.keys()];
    let hechas = 0;
    const armarPedazo = (cantidad = palabras.length) => {
        const hasta = Math.min(palabras.length, hechas + cantidad);
        for (; hechas < hasta; hechas++) {
            const palabra = palabras[hechas];
            const forma = sinTildes(palabra);
            porForma.set(forma, mejor(porForma.get(forma), palabra));
            const sonido = comoSuena(palabra);
            porSonido.set(sonido, mejor(porSonido.get(sonido), palabra));
        }
        return hechas >= palabras.length;
    };
    return {
        entradas, mejor, frecuencia, armarPedazo,
        get listo() { return hechas >= palabras.length; },
        get porForma() { armarPedazo(); return porForma; },
        get porSonido() { armarPedazo(); return porSonido; },
    };
}

// Cómo suena, para encontrar lo escrito con la letra equivocada: b/v, c/s/z, ll/y,
// g/j, h muda, qu/k y doble letra.
export function comoSuena(palabra) {
    return sinTildes(palabra.toLowerCase())
        .replace(/ch/g, '1')
        .replace(/h/g, '')
        .replace(/g(?=[ei])/g, 'j')
        .replace(/(?:qu|gu|c)(?=[ei])/g, m => (m === 'c' ? 's' : m[0] === 'q' ? 'k' : 'g'))
        .replace(/[cqk]/g, 'k')
        .replace(/[zx]/g, 's')
        .replace(/v/g, 'b')
        .replace(/w/g, 'u')
        .replace(/ll/g, 'y')
        .replace(/ni(?=[aou])/g, 'ñ')
        .replace(/i(?=[aeou])/g, 'y')
        .replace(/(.)\1+/g, '$1')
        .replace(/1/g, 'ch');
}

const LETRAS = 'abcdefghijklmnñopqrstuvwxyz';
// Todo lo que está a una letra de distancia (de más, de menos, cambiada o dada vuelta).
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

// La palabra del diccionario que se quiso escribir, o null.
export function corregirParaDiccionario(escrita, indice) {
    const { entradas, mejor, frecuencia } = indice;
    const palabra = escrita.trim().toLowerCase().normalize('NFC');
    if (!palabra) return null;
    const forma = sinTildes(palabra);
    if (entradas.has(palabra)) {
        // Está, pero solo como grafía vieja o forma de otra palabra, y con tilde se usa muchísimo más:
        // "asi" es "así" y "ojala" (de ojalar) es "ojalá"; "esta" y "papa" se dejan.
        const linea = entradas.get(palabra);
        const debil = linea[0] !== '#' || /^#[^\t]*\t(?:[^\t¦]*¦)?(?:Grafía|Variante|Forma)/.test(linea);
        const conTilde = debil && forma === palabra && indice.porForma.get(forma);
        return conTilde && conTilde !== palabra && frecuencia(conTilde) >= 10 * frecuencia(palabra) ? conTilde : palabra;
    }
    const { porForma, porSonido } = indice;
    if (porForma.has(forma)) return porForma.get(forma);
    // Voseo: "querés" o "queres" son de "querer", "venís" de "venir".
    const voseo = forma.match(/^(\p{L}+)([aei])s$/u);
    if (voseo) {
        const conTilde = voseo[1] + { a: 'á', e: 'é', i: 'í' }[voseo[2]] + 's';
        if (entradas.has(conTilde)) return conTilde;
        const infinitivo = voseo[1] + voseo[2] + 'r';
        if (entradas.has(infinitivo)) return infinitivo;
    }
    // Escrita como suena ("aser", "sielo") o con una letra mal ("gitarra"): la más usada, y las
    // que suenan igual valen 20 veces más ("gerra" es "guerra" y no "jera").
    const sonido = comoSuena(palabra);
    let elegida = null, puntaje = -1;
    const probar = (candidata, peso) => {
        const valor = (frecuencia(candidata) + 1) * peso;
        if (valor > puntaje) { elegida = candidata; puntaje = valor; }
    };
    if (porSonido.has(sonido)) probar(porSonido.get(sonido), 20);
    if (forma.length >= 3) for (const v of variantes(forma)) if (porForma.has(v)) probar(porForma.get(v), 1);
    if (elegida || forma.length < 3) return elegida;
    for (const v of variantes(sonido)) if (porSonido.has(v)) probar(porSonido.get(v), 1);
    return elegida;
}

// Lo que hay de una palabra: sus categorías con acepciones y de qué palabras es forma.
export function leerEntrada(palabra, { entradas }) {
    const linea = entradas.get(palabra);
    if (linea === undefined) return null;
    const categorias = [], formaDe = [];
    let actual = null;
    for (const campo of linea.split('\t')) {
        if (campo[0] === '#') categorias.push(actual = { nombre: campo.slice(1), acepciones: [] });
        else if (campo[0] === '>') formaDe.push(campo.slice(1));
        else if (actual) {
            const corte = campo.indexOf('¦');
            actual.acepciones.push(corte > 0 ? { materia: campo.slice(0, corte), texto: campo.slice(corte + 1) } : { materia: '', texto: campo });
        }
    }
    return { palabra, categorias, formaDe };
}

// Busca lo escrito: { buscada, palabra, corregida, formaDe, entradas: [{ palabra, categorias }] }.
// Si es una forma sin definición propia ("fuimos"), trae las de sus palabras ("ir", "ser").
// Devuelve null si no encontró nada parecido.
export function buscarDefinicion(escrita, indice) {
    const buscada = escrita.trim().toLowerCase();
    const palabra = corregirParaDiccionario(buscada, indice);
    if (!palabra) return null;
    const entrada = leerEntrada(palabra, indice);
    const entradas = [];
    if (entrada.categorias.length) entradas.push({ palabra, categorias: entrada.categorias });
    for (const base of entrada.formaDe) {
        const otra = leerEntrada(base, indice);
        if (otra && otra.categorias.length) entradas.push({ palabra: base, categorias: otra.categorias });
    }
    if (!entradas.length) return null;
    return { buscada, palabra, corregida: palabra !== buscada, formaDe: entrada.formaDe, entradas };
}
