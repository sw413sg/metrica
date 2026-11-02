// «Mejorar frase» con IA (pedido de Swa): se elige una frase de la letra y el modelo (GPT-6.1 Terra,
// a través de un Worker de Cloudflare, ver worker/README.md) propone 3 o 4 mejores, basadas en el
// verso anterior y en sus rimas internas y finales. La app arma el pedido con lo que ya calcula el
// motor propio (sílabas, consonante y asonante, internas) y después valida y ordena lo que vuelve.
// Mientras no haya servidor (ENDPOINT_IA vacío), las respuestas son simuladas.
import { claveConsonante, claveAsonante, rimasInternas, numerarEstrofas } from './rimas.js';
import { contarSilabasVerso } from './silabas.js';
import { esSeparador } from './secciones.js';
import { SUGERENCIAS_IA, PEDIDAS_IA, PALABRAS_IA, VERSOS_REVISION, CAMBIOS_REVISION } from './ia-prompt.js';

// La dirección del Worker cuando esté desplegado (ver worker/README.md). Vacía: simulado.
// Para probar uno sin publicar, se puede poner en localStorage 'metrica.ia-endpoint'.
export const ENDPOINT_IA = '';
const CLAVE_ENDPOINT = 'metrica.ia-endpoint';
const CLAVE_ID = 'metrica.ia-id';
const CLAVE_USO = 'metrica.ia-uso';
const CLAVE_PLAN = 'metrica.ia-plan';

// Sin decidir (Swa): unas 20 gratis por mes para todos, y «Métrica IA» aparte de Extras, porque cada
// uso cuesta (unos USD 0,0035 por sugerencia con GPT-6.1 Terra). Acá el plan es solo simulado.
export const CUPO_GRATIS = 20;
export const PLAN_IA = { id: 'metrica.ia', nombre: 'Métrica IA', precio: 'USD 2,99 por mes', tope: 500 };

// Las palabras de un verso como las ve el editor: sin lo que va entre paréntesis («(nos)»),
// salvo que el verso entero esté entre paréntesis.
function palabrasDeVerso(verso, corregir) {
    if (esSeparador(verso)) return [];
    const sin = verso.replace(/\([^)]*\)/g, agregado => ' '.repeat(agregado.length));
    return ((/\p{L}/u.test(sin) ? sin : verso).match(/\p{L}+/gu) ?? []).map(corregir);
}

// La frase elegida: si lo seleccionado tiene al menos dos palabras y queda en un solo verso, se toma
// el verso entero. Devuelve { inicio, fin, pedido } (dónde va el reemplazo y lo que se le manda al
// modelo) o null. `distancia`: la de «Rimas internas» de la ruedita (con «No», se buscan a 4).
export function fraseElegida(texto, inicio, fin, { corregir = p => p, distancia = 4 } = {}) {
    const elegido = texto.slice(inicio, fin);
    if (elegido.includes('\n') || (elegido.match(/\p{L}+/gu) ?? []).length < 2) return null;
    const versos = texto.split('\n');
    const i = texto.slice(0, inicio).split('\n').length - 1;
    const palabras = versos.map(v => palabrasDeVerso(v, corregir));
    if (palabras[i].length < 2) return null;
    const estrofas = numerarEstrofas(palabras);
    const internas = rimasInternas(palabras, distancia || 4);
    const describir = j => {
        const final = palabras[j].at(-1);
        return {
            texto: versos[j].trim(),
            silabas: contarSilabasVerso(palabras[j].join(' ')),
            final: { palabra: final, consonante: claveConsonante(final), asonante: claveAsonante(final) },
            internas: palabras[j].slice(0, -1)
                .map((palabra, n) => internas[j][n] && { palabra, asonante: internas[j][n].clave })
                .filter(Boolean),
        };
    };
    const mismaEstrofa = versos.map((_, j) => j).filter(j => estrofas[j] === estrofas[i] && palabras[j].length);
    const anterior = mismaEstrofa.filter(j => j < i).at(-1);
    const posicion = mismaEstrofa.indexOf(i);
    const verso = describir(i);
    const previo = anterior == null ? null : describir(anterior);
    const desde = texto.split('\n').slice(0, i).join('\n').length + (i ? 1 : 0);
    return {
        inicio: desde,
        fin: desde + versos[i].length,
        pedido: {
            verso,
            anterior: previo,
            estrofa: mismaEstrofa.slice(Math.max(0, posicion - 6), posicion + 2).map(j => versos[j].trim()),
            // Que rime con el anterior y tenga sus sílabas; si es el primero de la estrofa, que siga
            // sonando como suena (así no se rompe la rima con el que viene).
            objetivo: { silabas: (previo ?? verso).silabas, rimaCon: (previo ?? verso).final.palabra },
        },
    };
}

// La pastilla elegida en la hoja: «Más corta» busca dos sílabas menos, el resto va en el pedido.
export function conEnfoque(pedido, enfoque = 'mejor') {
    const objetivo = enfoque === 'corta' ? { ...pedido.objetivo, silabas: Math.max(4, pedido.objetivo.silabas - 2) } : pedido.objetivo;
    return { ...pedido, enfoque, objetivo };
}

// La palabra tocada (de `inicio` a `fin`): el pedido de su verso, con la palabra y si es la última
// (entonces tiene que rimar con el anterior, o seguir rimando como rima). null si no es una palabra.
export function palabraElegida(texto, inicio, fin, opciones = {}) {
    const palabra = texto.slice(inicio, fin);
    if (!/^\p{L}+$/u.test(palabra)) return null;
    const desde = texto.lastIndexOf('\n', inicio - 1) + 1;
    const hasta = texto.indexOf('\n', inicio) < 0 ? texto.length : texto.indexOf('\n', inicio);
    const verso = fraseElegida(texto, desde, hasta, opciones);
    if (!verso) return null;
    const final = !/\p{L}/u.test(texto.slice(fin, hasta).replace(/\([^)]*\)/g, ''));
    const { objetivo } = verso.pedido;
    return {
        inicio, fin,
        pedido: { ...verso.pedido, palabra: { texto: palabra, final }, objetivo: final ? objetivo : { ...objetivo, rimaCon: null } },
    };
}

// Las palabras que vuelven para la viñeta: sueltas, sin repetir ni la misma; si es la última del
// verso, primero las que riman consonante y después las asonantes. Hasta 8.
export function validarPalabras(textos, pedido) {
    const vistas = new Set([pedido.palabra.texto.toLowerCase()]);
    const { rimaCon } = pedido.objetivo;
    const lista = [];
    for (const crudo of textos) {
        const palabra = String(crudo ?? '').trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
        if (!/^\p{L}+$/u.test(palabra) || vistas.has(palabra.toLowerCase())) continue;
        vistas.add(palabra.toLowerCase());
        let rima = null;
        if (rimaCon && claveConsonante(palabra) && claveConsonante(palabra) === claveConsonante(rimaCon)) rima = 'consonante';
        else if (rimaCon && claveAsonante(palabra) && claveAsonante(palabra) === claveAsonante(rimaCon)) rima = 'asonante';
        lista.push({ texto: palabra, rima });
    }
    if (pedido.palabra.final && rimaCon) {
        const orden = { consonante: 0, asonante: 1 };
        lista.sort((a, b) => (orden[a.rima] ?? 2) - (orden[b.rima] ?? 2));
    }
    return lista.slice(0, PALABRAS_IA);
}

// Simuladas para una palabra: la última del verso, rimas; una del medio, sinónimos y relacionadas.
export function palabrasSimuladas(pedido, { rimas = [], sinonimos = [], relacionadas = [] } = {}) {
    const fuente = pedido.palabra.final ? rimas : [...sinonimos, ...relacionadas];
    return fuente.filter(p => p.toLowerCase() !== pedido.objetivo.rimaCon?.toLowerCase()).slice(0, PALABRAS_IA + 2);
}

const normal = s => s.toLowerCase().normalize('NFC').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();

// Lo que vuelve del modelo, pasado por el motor propio: se descartan las vacías, largas, repetidas
// o iguales a la frase, y se ordenan por rima (consonante, asonante, ninguna), sílabas más cerca de
// las buscadas y rimas internas con el verso anterior. Quedan hasta 4, cada una con sus datos.
export function validarSugerencias(textos, pedido, { corregir = p => p } = {}) {
    const vistas = new Set([normal(pedido.verso.texto)]);
    const { rimaCon, silabas: buscadas } = pedido.objetivo;
    const ecos = new Set((pedido.anterior?.internas ?? []).map(i => i.asonante));
    const resultado = [];
    for (const crudo of textos) {
        const texto = String(crudo ?? '').split('\n')[0].replace(/^[\s\-•*"«“]+|^\d+[.)]\s*/g, '').replace(/[\s"»”]+$/g, '').trim();
        const clave = normal(texto);
        if (!clave || texto.length > 140 || vistas.has(clave)) continue;
        vistas.add(clave);
        const palabras = palabrasDeVerso(texto, corregir);
        const final = palabras.at(-1);
        if (!final) continue;
        let rima = null;
        if (rimaCon && final.toLowerCase() === rimaCon.toLowerCase()) rima = 'misma';
        else if (rimaCon && claveConsonante(final) && claveConsonante(final) === claveConsonante(rimaCon)) rima = 'consonante';
        else if (rimaCon && claveAsonante(final) && claveAsonante(final) === claveAsonante(rimaCon)) rima = 'asonante';
        const silabas = contarSilabasVerso(palabras.join(' '));
        // Las cortas («lo», «por») no cuentan: casi no suenan.
        const internas = palabras.slice(0, -1).filter(p => p.length > 3 && ecos.has(claveAsonante(p))).length;
        resultado.push({ texto, silabas, rima, final, internas, diferencia: Math.abs(silabas - buscadas) });
    }
    const orden = { consonante: 0, asonante: 1, misma: 1 };
    return resultado
        .sort((a, b) => (orden[a.rima] ?? 2) - (orden[b.rima] ?? 2) || a.diferencia - b.diferencia || b.internas - a.internas)
        .slice(0, SUGERENCIAS_IA);
}

// Respuestas falsas mientras no hay servidor: la frase con otra palabra final que rima, y algunas
// frases hechas que terminan en rima. `rimas`: las que rimen con `objetivo.rimaCon` (del índice).
const FRASES_SIMULADAS = [
    'aunque nadie entienda sigo con', 'miro el techo y pienso en',
    'todo lo aposté por', 'vuelvo al barrio con',
    'la noche me habla de', 'no me pidas que olvide',
];
export function sugerenciasSimuladas(pedido, rimas = [], azar = Math.random) {
    const palabras = pedido.verso.texto.split(/\s+/);
    const sinFinal = palabras.slice(0, -1).join(' ');
    const propias = [pedido.objetivo.rimaCon, pedido.verso.final.palabra].map(p => p?.toLowerCase());
    const libres = rimas.filter(r => !propias.includes(r.toLowerCase())).slice(0, 20);
    const tomar = () => libres.splice(Math.floor(azar() * libres.length), 1)[0];
    const frases = [...FRASES_SIMULADAS];
    const frase = () => frases.splice(Math.floor(azar() * frases.length), 1)[0];
    // Si se acaban las rimas, quedan menos (como cuando el modelo contesta de menos).
    const inicios = [sinFinal, palabras.slice(1, -1).join(' '), frase(), frase(), frase()];
    const conRima = inicios.map(inicio => libres.length ? `${inicio} ${tomar()}` : null).filter(Boolean);
    return [...conRima, `${pedido.verso.texto} otra vez`].slice(0, PEDIDAS_IA);
}

// ---------- Sugerencias: la IA lee la letra entera (pedido de Swa) ----------
// Solo al tocar la estrellita de arriba: «¿Por dónde empiezo?» abre en «Sugerencias».
export function letraParaRevisar(texto, { corregir = p => p } = {}) {
    const lineas = texto.split('\n');
    const palabras = lineas.map(v => palabrasDeVerso(v, corregir));
    const estrofas = numerarEstrofas(palabras);
    const versos = lineas
        .map((linea, n) => ({ n, texto: linea.trim(), silabas: contarSilabasVerso(palabras[n].join(' ')), estrofa: estrofas[n] }))
        .filter(v => palabras[v.n].length && v.texto.length <= 140)
        .slice(0, VERSOS_REVISION);
    return versos.length ? { versos } : null;
}

const letrasDe = s => s.normalize('NFC');
// Dónde está `viejo` (palabra entera, sin importar mayúsculas) en el renglón `n`: { inicio, fin } o null.
export function ubicarCambio(texto, n, viejo) {
    const lineas = texto.split('\n');
    if (!lineas[n] || !viejo) return null;
    const buscado = letrasDe(viejo).toLowerCase();
    const linea = letrasDe(lineas[n]);
    const desde = lineas.slice(0, n).join('\n').length + (n ? 1 : 0);
    for (let i = linea.toLowerCase().indexOf(buscado); i >= 0; i = linea.toLowerCase().indexOf(buscado, i + 1)) {
        const borde = c => !c || !/\p{L}/u.test(c);
        if (borde(linea[i - 1]) && borde(linea[i + buscado.length])) return { inicio: desde + i, fin: desde + i + buscado.length };
    }
    return null;
}

// Lo que vuelve (del modelo o simulado), con dónde está cada cambio en la letra. Se descartan los que
// no se encuentran, los repetidos y los que no cambian nada. Hasta 6.
export function validarRevision(lista, texto) {
    const lineas = texto.split('\n');
    const vistos = new Set();
    const cambios = [];
    for (const { titulo, verso, viejo, nuevo } of lista) {
        const limpio = String(nuevo ?? '').trim();
        if (!limpio || limpio.length > 60 || limpio.toLowerCase() === String(viejo).trim().toLowerCase()) continue;
        const lugar = ubicarCambio(texto, verso, String(viejo).trim());
        if (!lugar || vistos.has(lugar.inicio)) continue;
        vistos.add(lugar.inicio);
        const original = texto.slice(lugar.inicio, lugar.fin);
        cambios.push({
            titulo: String(titulo).trim(), n: verso, ...lugar, viejo: original,
            nuevo: /^\p{Lu}/u.test(original) ? limpio[0].toUpperCase() + limpio.slice(1) : limpio,
            verso: lineas[verso],
        });
    }
    return cambios.slice(0, CAMBIOS_REVISION);
}

// Simuladas con el motor propio: palabras repetidas (se cambia la segunda por un sinónimo que no esté
// en la letra) y finales que no riman con ningún otro de su estrofa (por una rima del anterior).
// `sinonimosDe` y `rimasDe`: palabra -> lista, del diccionario.
export function revisionSimulada(revision, { sinonimosDe = () => [], rimasDe = () => [], corregir = p => p } = {}) {
    const cambios = [];
    const enLetra = new Set(revision.versos.flatMap(v => palabrasDeVerso(v.texto, corregir).map(p => p.toLowerCase())));
    const libre = lista => lista.find(p => !p.includes(' ') && !enLetra.has(p.toLowerCase()));
    // Repeticiones: palabras de más de 3 letras que no son la última del verso (esas riman a propósito).
    const vistas = new Map();
    for (const v of revision.versos) {
        const palabras = (v.texto.match(/\p{L}+/gu) ?? []);
        palabras.slice(0, -1).forEach(palabra => {
            const clave = corregir(palabra).toLowerCase();
            if (clave.length <= 3) return;
            if (vistas.has(clave) && !cambios.some(c => c.clave === clave)) {
                const nuevo = libre(sinonimosDe(clave));
                if (nuevo) cambios.push({ clave, titulo: `Cambiar la repetición de la palabra «${palabra.toLowerCase()}»`, verso: v.n, viejo: palabra, nuevo });
            }
            vistas.set(clave, true);
        });
    }
    // Finales sueltos: en una estrofa donde los demás riman, uno que no rima con nadie.
    const porEstrofa = revision.versos.reduce((m, v) => m.set(v.estrofa, [...(m.get(v.estrofa) ?? []), v]), new Map());
    for (const versos of porEstrofa.values()) {
        const finales = versos.map(v => corregir(palabrasDeVerso(v.texto, corregir).at(-1) ?? ''));
        const claves = finales.map(f => claveAsonante(f));
        versos.forEach((v, i) => {
            if (i === 0 || claves.some((c, j) => j !== i && c === claves[i])) return;
            if (!claves.some((c, j) => j !== i && claves.some((otra, k) => k !== j && otra === c))) return;
            const nuevo = libre(rimasDe(finales[i - 1]));
            const viejo = palabrasDeVerso(v.texto, p => p).at(-1);
            if (nuevo) cambios.push({ titulo: `Cambiar la palabra «${viejo}» por «${nuevo}»`, verso: v.n, viejo, nuevo });
        });
    }
    return cambios.slice(0, CAMBIOS_REVISION).map(({ clave, ...cambio }) => cambio);
}

// ---------- Cupo por mes (en la web, simulado; el que manda es el del Worker) ----------
export const mesDe = ms => {
    const fecha = new Date(ms);
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
};
export const tienePlanIA = almacen => almacen.getItem(CLAVE_PLAN) === 'comprado';
export const comprarPlanIA = almacen => { almacen.setItem(CLAVE_PLAN, 'comprado'); return true; };
export const borrarPlanIA = almacen => almacen.setItem(CLAVE_PLAN, '');

function leerUso(almacen) {
    try { return JSON.parse(almacen.getItem(CLAVE_USO)) ?? {}; } catch { return {}; }
}

// { usadas, tope, quedan, plan } del mes de `ahora`. Cada pedido (una tanda de 3 o 4) cuenta uno.
export function usoDelMes(almacen, ahora = Date.now()) {
    const uso = leerUso(almacen);
    const usadas = uso.mes === mesDe(ahora) ? uso.usadas ?? 0 : 0;
    const plan = tienePlanIA(almacen);
    const tope = plan ? PLAN_IA.tope : CUPO_GRATIS;
    return { usadas, tope, quedan: Math.max(0, tope - usadas), plan };
}

export function anotarSugerencia(almacen, ahora = Date.now()) {
    const usadas = usoDelMes(almacen, ahora).usadas + 1;
    almacen.setItem(CLAVE_USO, JSON.stringify({ mes: mesDe(ahora), usadas }));
    return usoDelMes(almacen, ahora);
}

export const textoCupo = ({ quedan, tope, plan }) =>
    `${quedan === 1 ? 'Queda' : 'Quedan'} ${quedan} de ${tope}${plan ? '' : ' gratis'} este mes`;

// ---------- Cliente del Worker ----------
export const endpointIA = almacen => almacen.getItem(CLAVE_ENDPOINT) || ENDPOINT_IA;

// Un id anónimo por teléfono, para que el Worker cuente el uso de cada uno (en la app nativa
// se suma el comprobante de StoreKit para el plan; ver worker/README.md).
export function idDeUsuario(almacen, azar = Math.random) {
    let id = almacen.getItem(CLAVE_ID);
    if (!id) {
        id = Array.from({ length: 24 }, () => Math.floor(azar() * 36).toString(36)).join('');
        almacen.setItem(CLAVE_ID, id);
    }
    return id;
}

export const MENSAJES_ERROR_IA = {
    red: 'Sin conexión: la IA necesita internet.',
    cupo: 'Ya usaste todas las de este mes.',
    servidor: 'No se pudo. Probá de nuevo en un rato.',
};
const errorIA = motivo => Object.assign(new Error(MENSAJES_ERROR_IA[motivo]), { motivo });

// Pide las sugerencias: al Worker si hay endpoint, o simuladas si no. Devuelve
// { sugerencias: [...], quedan?, simulada? }; si falla, un Error con `motivo` (red, cupo, servidor).
export const pedirSugerencias = (pedido, opciones) => llamarIA({ pedido }, opciones);
// La letra entera, para la pestaña «Sugerencias»: vuelven cambios { titulo, verso, viejo, nuevo }.
export const pedirRevision = (revision, opciones) => llamarIA({ revision }, opciones);

async function llamarIA(cuerpo, { endpoint = '', id = '', fetch = globalThis.fetch, simular = () => [] } = {}) {
    if (!endpoint) return { sugerencias: simular(), simulada: true };
    let respuesta;
    try {
        respuesta = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Metrica-Id': id },
            body: JSON.stringify(cuerpo),
        });
    } catch {
        throw errorIA('red');
    }
    if (respuesta.status === 429) throw errorIA('cupo');
    if (!respuesta.ok) throw errorIA('servidor');
    const datos = await respuesta.json().catch(() => ({}));
    if (!Array.isArray(datos.sugerencias)) throw errorIA('servidor');
    return { sugerencias: datos.sugerencias, quedan: datos.quedan };
}
