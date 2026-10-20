// Motor de rimas en español. Sin DOM.
// Rima consonante: mismos sonidos desde la última vocal tónica ("canción" / "corazón").
// Rima asonante: mismas vocales desde la tónica ("casa" / "mala"); en esdrújulas solo
// cuentan la tónica y la última ("música" / "luna"), y en diptongos átonos, la vocal fuerte.
// Se compara por sonido, como se habla en el Río de la Plata: s = z = c(e,i), b = v,
// y = ll, h muda ("voz" / "dos", "caza" / "casa").

const VOCALES = 'aeiouáéíóúü';
const FUERTES = 'aeoáéó';
const CON_TILDE = 'áéíóú';
const SIN_TILDE = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };

// Palabras átonas (artículos, preposiciones, pronombres que van pegados al verbo...):
// no llevan acento al hablar, así que no sirven para rimar.
const ATONAS = new Set(('el la los las lo le les me te se nos os mi mis tu tus su sus ' +
    'de del a al en con por para sin so tras y e o u ni que si mas pero aunque porque ' +
    'como cuando donde cuan').split(' '));

const sinTildes = texto => texto.replace(/[áéíóúü]/g, l => SIN_TILDE[l]);

// "u" que no suena: siempre en "qu", y en "gue"/"gui" (no en "güe"/"güi").
function esVocal(p, i) {
    if (!VOCALES.includes(p[i])) return false;
    if (p[i] === 'u' && (p[i - 1] === 'q' || (p[i - 1] === 'g' && 'eiéí'.includes(p[i + 1] ?? '')))) return false;
    return true;
}

// Una vocal se suma al núcleo (diptongo/triptongo) salvo que haya dos fuertes
// o una débil con tilde, que marcan hiato: "camión" = ió, "país" = a-í, "poeta" = o-e.
function seUne(p, nucleo, i) {
    if (nucleo.length >= 3) return false;
    if (CON_TILDE.includes(p[i]) && !FUERTES.includes(p[i])) return false;
    if (nucleo.some(j => CON_TILDE.includes(p[j]) && !FUERTES.includes(p[j]))) return false;
    return !(FUERTES.includes(p[i]) && nucleo.some(j => FUERTES.includes(p[j])));
}

// Vocal que suena más fuerte dentro de un núcleo: la de tilde, si no la fuerte,
// si no la segunda ("ruido", "viuda").
function vocalPrincipal(p, nucleo) {
    return nucleo.find(j => CON_TILDE.includes(p[j]))
        ?? nucleo.find(j => FUERTES.includes(p[j]))
        ?? nucleo[nucleo.length - 1];
}

// Separa la palabra en núcleos vocálicos y encuentra la vocal tónica.
// Devuelve null si no es una palabra en español (números, espacios, sin vocales).
export function analizarPalabra(palabra) {
    const p = String(palabra).trim().toLowerCase().normalize('NFC');
    if (!/^[a-záéíóúüñ]+$/.test(p)) return null;

    const nucleos = [];
    for (let i = 0; i < p.length; i++) {
        if (!esVocal(p, i)) continue;
        const ultimo = nucleos[nucleos.length - 1];
        if (ultimo && ultimo[ultimo.length - 1] === i - 1 && seUne(p, ultimo, i)) ultimo.push(i);
        else nucleos.push([i]);
    }
    if (!nucleos.length) return null;

    // Con tilde manda la tilde. Sin tilde: grave si termina en vocal, n o s; si no, aguda.
    let tonico = nucleos.findLastIndex(n => n.some(j => CON_TILDE.includes(p[j])));
    if (tonico === -1) tonico = 'aeiouns'.includes(p[p.length - 1]) ? Math.max(0, nucleos.length - 2) : nucleos.length - 1;

    return { palabra: p, nucleos, tonico, vocalTonica: vocalPrincipal(p, nucleos[tonico]) };
}

// Cómo suena (aproximado) un pedazo de palabra: sin tildes y con seseo, b = v, yeísmo y h muda.
function sonido(texto) {
    return texto
        .replace(/ch/g, 'ç')
        .replace(/g([eiéí])/g, 'j$1')
        .replace(/gu([eiéí])/g, 'g$1')
        .replace(/qu/g, 'k')
        .replace(/c([eiéí])/g, 's$1')
        .replace(/c/g, 'k')
        .replace(/z/g, 's')
        .replace(/v/g, 'b')
        .replace(/w/g, 'u')
        .replace(/ll/g, 'y')
        .replace(/h/g, '')
        .replace(/y$/, 'i')
        .replace(/[áéíóúü]/g, l => SIN_TILDE[l]);
}

// Clave de rima consonante: cómo suena desde la vocal tónica. "canción" -> "on".
export function claveConsonante(palabra) {
    const a = analizarPalabra(palabra);
    if (!a) return null;
    // "g" y "c" dependen de la vocal que sigue, así que miramos desde la tónica.
    return sonido(a.palabra.slice(a.vocalTonica));
}

// Clave de rima asonante: la vocal tónica y la última. "casa" -> "aa", "canción" -> "o".
export function claveAsonante(palabra) {
    const a = analizarPalabra(palabra);
    if (!a) return null;
    let clave = sinTildes(a.palabra[a.vocalTonica]);
    if (a.tonico < a.nucleos.length - 1) {
        clave += sinTildes(a.palabra[vocalPrincipal(a.palabra, a.nucleos[a.nucleos.length - 1])]);
    }
    return clave;
}

// Arma el índice una sola vez: clave -> palabras, de más usadas a menos usadas
// (las que no tienen frecuencia van al final, en orden alfabético).
// frecuencias: Map palabra -> cantidad.
export function crearIndiceRimas(palabras, frecuencias = new Map()) {
    const indice = { consonante: new Map(), asonante: new Map(), frecuencias };
    const agregar = (mapa, clave, palabra) => {
        if (!clave) return;
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave).push(palabra);
    };
    for (const palabra of new Set(palabras)) {
        if (ATONAS.has(palabra) || !analizarPalabra(palabra)) continue;
        agregar(indice.consonante, claveConsonante(palabra), palabra);
        agregar(indice.asonante, claveAsonante(palabra), palabra);
    }
    const orden = (a, b) => (frecuencias.get(b) ?? 0) - (frecuencias.get(a) ?? 0) || a.localeCompare(b, 'es');
    for (const mapa of [indice.consonante, indice.asonante]) {
        for (const lista of mapa.values()) lista.sort(orden);
    }
    return indice;
}

// Palabras que riman con `palabra`, de más usadas a menos usadas, sin ella misma.
// tipo: 'consonante' | 'asonante'. Las asonantes no repiten las consonantes.
export function buscarRimas(palabra, indice, { tipo = 'consonante' } = {}) {
    const a = analizarPalabra(palabra);
    if (!a) return [];
    const consonante = claveConsonante(palabra);
    if (tipo === 'consonante') {
        return (indice.consonante.get(consonante) ?? []).filter(p => p !== a.palabra);
    }
    return (indice.asonante.get(claveAsonante(palabra)) ?? [])
        .filter(p => p !== a.palabra && claveConsonante(p) !== consonante);
}
