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
export function vocalPrincipal(p, nucleo) {
    return nucleo.find(j => CON_TILDE.includes(p[j]))
        ?? nucleo.find(j => FUERTES.includes(p[j]))
        ?? nucleo[nucleo.length - 1];
}

// Separa la palabra en núcleos vocálicos y encuentra la vocal tónica.
// Devuelve null si no es una palabra en español (números, espacios, sin vocales).
// Palabras en inglés que se usan mucho en letras, escritas como suenan en castellano,
// para que rimen y cuenten sílabas como se cantan ("face" rima con "vez").
export const ANGLICISMOS = new Map(Object.entries({
    face: 'feis', mail: 'meil', babe: 'beib', baby: 'beibi', lady: 'leidi', crazy: 'creisi', sorry: 'sori',
    like: 'laik', life: 'laif', nice: 'nais', night: 'nait', light: 'lait', fly: 'flai', high: 'jai', bye: 'bai',
    time: 'taim', mind: 'maind', style: 'stail', freestyle: 'fristail', shine: 'shain', smile: 'smail', drive: 'draiv',
    fire: 'fáier', flow: 'flou', show: 'shou', phone: 'fon', money: 'mani', love: 'lov', hate: 'jeit',
    game: 'gueim', fake: 'feik', play: 'plei', okay: 'okéi', hey: 'jei', beat: 'bit', street: 'strit',
    team: 'tim', feat: 'fit', crew: 'cru', tune: 'tiun', rapper: 'ráper', hood: 'jud', boy: 'boi', check: 'chec',
}));

export function analizarPalabra(palabra) {
    const escrita = String(palabra).trim().toLowerCase().normalize('NFC');
    const p = ANGLICISMOS.get(escrita) ?? escrita;
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

// "g" y "c" dependen de la vocal que sigue, así que miramos desde la tónica.
const consonanteDe = a => sonido(a.palabra.slice(a.vocalTonica));

function asonanteDe(a) {
    let clave = sinTildes(a.palabra[a.vocalTonica]);
    if (a.tonico < a.nucleos.length - 1) {
        clave += sinTildes(a.palabra[vocalPrincipal(a.palabra, a.nucleos[a.nucleos.length - 1])]);
    }
    return clave;
}

// Clave de rima consonante: cómo suena desde la vocal tónica. "canción" -> "on".
export function claveConsonante(palabra) {
    const a = analizarPalabra(palabra);
    return a && consonanteDe(a);
}

// Clave de rima asonante: la vocal tónica y la última. "casa" -> "aa", "canción" -> "o".
export function claveAsonante(palabra) {
    const a = analizarPalabra(palabra);
    return a && asonanteDe(a);
}

// Arma el índice una sola vez: clave -> palabras, de más usadas a menos usadas
// (las que no tienen frecuencia van al final, en orden alfabético).
// frecuencias: Map palabra -> cantidad.
export function crearIndiceRimas(palabras, frecuencias = new Map()) {
    // consonantePorPalabra evita volver a analizar al filtrar las asonantes.
    const indice = { consonante: new Map(), asonante: new Map(), consonantePorPalabra: new Map() };
    const agregar = (mapa, clave, palabra) => {
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave).push(palabra);
    };
    // Ordenar una sola vez todo el diccionario (y no cada lista) es mucho más rápido.
    const unicas = [...new Set(palabras)];
    const conFrecuencia = unicas.filter(p => frecuencias.has(p)).sort((a, b) => frecuencias.get(b) - frecuencias.get(a));
    const sinFrecuencia = unicas.filter(p => !frecuencias.has(p)).sort(new Intl.Collator('es').compare);
    for (const palabra of [...conFrecuencia, ...sinFrecuencia]) {
        const a = ATONAS.has(palabra) ? null : analizarPalabra(palabra);
        if (!a) continue;
        const consonante = consonanteDe(a);
        indice.consonantePorPalabra.set(palabra, consonante);
        agregar(indice.consonante, consonante, palabra);
        agregar(indice.asonante, asonanteDe(a), palabra);
    }
    return indice;
}

// Palabras que riman con `palabra`, de más usadas a menos usadas, sin ella misma.
// tipo: 'consonante' | 'asonante'. Las asonantes no repiten las consonantes.
export function buscarRimas(palabra, indice, { tipo = 'consonante' } = {}) {
    const a = analizarPalabra(palabra);
    if (!a) return [];
    const consonante = consonanteDe(a);
    if (tipo === 'consonante') {
        return (indice.consonante.get(consonante) ?? []).filter(p => p !== a.palabra);
    }
    return (indice.asonante.get(claveAsonante(palabra)) ?? [])
        .filter(p => p !== a.palabra && indice.consonantePorPalabra.get(p) !== consonante);
}

// Para pintar la letra: recibe la última palabra de cada verso y devuelve, para cada
// una, el número de grupo de rima (0, 1, 2... en orden de aparición) o null si no
// rima con ninguna otra. Agrupa por asonancia, que incluye a las consonantes.
// Con `estrofas` (el número de estrofa de cada verso, de numerarEstrofas), solo agrupa
// dentro de la misma estrofa: un "casa" y un "cama" de estrofas distintas no riman.
export function agruparRimas(palabras, estrofas = []) {
    const claves = palabras.map((p, i) => (p && claveAsonante(p)) ? `${estrofas[i] ?? 0}|${claveAsonante(p)}` : null);
    const cuantas = new Map();
    for (const clave of claves) if (clave) cuantas.set(clave, (cuantas.get(clave) ?? 0) + 1);
    const grupos = new Map();
    return claves.map(clave => {
        if (!clave || cuantas.get(clave) < 2) return null;
        if (!grupos.has(clave)) grupos.set(clave, grupos.size);
        return grupos.get(clave);
    });
}

// Para pintar más fuerte las consonantes: para cada palabra, si otra de la lista
// rima consonante con ella ("corazón" / "canción"). Las demás de su grupo son asonantes.
// Con `estrofas`, solo dentro de la misma estrofa.
export function rimanConsonante(palabras, estrofas = []) {
    const claves = palabras.map((p, i) => (p && claveConsonante(p)) ? `${estrofas[i] ?? 0}|${claveConsonante(p)}` : null);
    return claves.map((clave, i) => clave != null && claves.some((otra, j) => j !== i && otra === clave));
}

// Verbos de una sílaba que se dicen casi sin acento: no arman rima sueltos ("es" / "tener").
const VERBOS_CORTOS = new Set(['es', 'son', 'sos', 'soy', 'voy', 'hay']);

// Rimas internas: para cada palabra de cada verso, { clave, suave } si rima con otra palabra
// distinta a menos de `distancia` versos (0 = apagadas); si no, null. La clave es la asonante
// (para el color). Para que no quede todo pintado: sin palabras átonas ni la misma palabra
// repetida, y las asonantes (suave: true) solo cuentan si las dos tienen más de una sílaba
// y la otra es la última de su verso ("temas" / "eterna", pero no "es" / "tener") o ya rima
// consonante con alguna ("solo" se suma a "todos" / "modos"). Dos del medio sueltas, no.
// No cruzan de una estrofa a otra: un verso sin palabras (renglón vacío) las corta.
// versos: [['te', 'busco', 'en', 'el', 'balcón'], ...]
export function rimasInternas(versos, distancia = 4) {
    const estrofa = numerarEstrofas(versos);
    const datos = versos.map(palabras => palabras.map((palabra, n) => {
        const p = String(palabra ?? '').toLowerCase().normalize('NFC');
        const a = ATONAS.has(p) ? null : analizarPalabra(p);
        return a && {
            texto: sinTildes(a.palabra), consonante: consonanteDe(a), asonante: asonanteDe(a),
            final: n === palabras.length - 1, larga: a.nucleos.length > 1, corta: VERBOS_CORTOS.has(p),
            aguda: a.tonico === a.nucleos.length - 1, abierta: /[aeiouáéíóú]$/.test(a.palabra),
        };
    }));
    const cercanas = (dato, i) => datos.slice(Math.max(0, i - distancia + 1), i + distancia)
        .filter((_, k) => estrofa[Math.max(0, i - distancia + 1) + k] === estrofa[i]).flat()
        .filter(otro => otro && otro.texto !== dato.texto);
    // Primero las consonantes; después, las asonantes que se suman a una rima que ya está
    // (la última palabra de un verso o una consonante del medio), dos agudas que suenan fuerte
    // aunque estén sueltas, si al menos una termina en consonante y las de una sílaba también
    // ("más" / "guardar", "agrandé" / "sed"; "ya" y "sé" no), y una aguda
    // abierta con una llana de la misma vocal repetida ("encontré" / "protegerte": é / e-e).
    datos.forEach((palabras, i) => palabras.forEach(dato => {
        if (dato) dato.rimaConsonante = distancia > 0 && cercanas(dato, i).some(otro => otro.consonante === dato.consonante);
    }));
    // Las finales que ya tienen color propio: riman con otra final de su estrofa.
    const finales = datos.map((palabras, i) => palabras.at(-1)?.final && palabras.at(-1));
    finales.forEach((dato, i) => {
        if (dato) dato.agrupada = finales.some((otro, j) => otro && j !== i && estrofa[j] === estrofa[i] && otro.asonante === dato.asonante);
    });
    const resultado = datos.map((palabras, i) => palabras.map(dato => {
        if (!dato || distancia < 1) return null;
        if (dato.rimaConsonante) return { clave: dato.asonante, suave: false };
        const misma = otro => otro.asonante === dato.asonante;
        const asonante = otro => misma(otro) && otro.larga && dato.larga && (otro.final || dato.final || otro.rimaConsonante)
            || misma(otro) && [otro, dato].every(d => d.aguda && !d.corta && (d.larga || !d.abierta)) && !(otro.abierta && dato.abierta) && (otro.larga || dato.larga);
        const eco = otro => [otro, dato].every(d => d.larga && d.abierta) && otro.aguda !== dato.aguda
            && (otro.asonante + dato.asonante).length === 3 && new Set(otro.asonante + dato.asonante).size === 1;
        if (cercanas(dato, i).some(asonante)) return { clave: dato.asonante, suave: true };
        // La aguda toma la clave de la llana (é -> e-e), para que las dos se pinten del mismo color.
        dato.parejas = cercanas(dato, i).filter(eco);
        if (dato.parejas.length) return { clave: dato.asonante[0].repeat(2), suave: true, eco: true };
        return null;
    }));
    // Si la pareja ya tiene color por otra rima (es final con grupo o rima con otra del medio),
    // se toma el suyo ("verme" con el "seré" que rima con "querés"), para que no quede sola.
    datos.forEach((palabras, i) => palabras.forEach((dato, n) => { if (dato) dato.color = resultado[i][n]; }));
    return resultado.map((palabras, i) => palabras.map((r, n) => {
        if (!r?.eco) return r;
        const pintada = datos[i][n].parejas.find(otro => otro.agrupada || (otro.color && !otro.color.eco));
        return { clave: pintada ? pintada.agrupada ? pintada.asonante : pintada.color.clave : r.clave, suave: true };
    }));
}

// Número de estrofa de cada verso: sube en cada verso sin palabras (renglón vacío o [Estribillo]).
export function numerarEstrofas(versos) {
    let estrofa = 0;
    return versos.map(palabras => palabras.length ? estrofa : ++estrofa);
}

// Un color fijo para cada terminación en toda la letra, en el orden en que aparecen. Cuando
// se acaban los `cantidad` colores, se reusa uno que no esté en las estrofas de esa terminación:
// como las rimas no cruzan de estrofa, no se confunden. clavesPorEstrofa: [['a-a', 'o'], ['e-a',
// 'a-a'], ...], en orden. Devuelve un Map de clave a color (de 0 a cantidad - 1).
export function asignarColores(clavesPorEstrofa, cantidad) {
    const colores = new Map();
    clavesPorEstrofa.forEach((claves, e) => claves.forEach(clave => {
        if (colores.has(clave)) return;
        // Colores ya tomados por otras terminaciones de alguna estrofa donde aparece esta.
        const ocupados = new Set();
        clavesPorEstrofa.forEach(otras => {
            if (otras.includes(clave)) otras.forEach(otra => colores.has(otra) && ocupados.add(colores.get(otra)));
        });
        let color = colores.size < cantidad ? colores.size : 0;
        while (ocupados.has(color) && color < cantidad - 1) color++;
        colores.set(clave, ocupados.has(color) ? colores.size % cantidad : color);
    }));
    return colores;
}

// El título de la caja al buscar, armado con los filtros prendidos: «2.072 rimas consonantes con
// «casa»», «12 rimas asonantes simples con «casa»», «8 sinónimos simples de «casa»».
export function tituloBusqueda(cantidad, palabra, { tipo = 'consonante', simples = false, sinonimos = false } = {}) {
    const plural = cantidad === 1 ? '' : 's';
    const partes = [cantidad.toLocaleString('es-AR'), (sinonimos ? 'sinónimo' : 'rima') + plural];
    if (!sinonimos) partes.push(tipo + plural);
    if (simples) partes.push('simple' + plural);
    partes.push(sinonimos ? 'de' : 'con', `«${palabra}»`);
    return partes.join(' ');
}
