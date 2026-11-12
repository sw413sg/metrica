// «Mejorar frase» con IA (pedido de Swa): se elige una frase de la letra y el modelo (GPT-6.1 Terra,
// a través de un Worker de Cloudflare, ver worker/README.md) propone 3 o 4 alternativas relacionadas,
// con las mismas rimas internas y finales de la frase. La app arma el pedido con lo que ya calcula el
// motor propio (sílabas, consonante y asonante, internas) y después valida y ordena lo que vuelve.
// Sin servidor (ENDPOINT_IA vacío), las respuestas serían simuladas.
import { claveConsonante, claveAsonante, rimasInternas, numerarEstrofas } from './rimas.js';
import { contarSilabasVerso } from './silabas.js';
import { esSeparador } from './secciones.js';
import { SUGERENCIAS_IA, PEDIDAS_IA, PALABRAS_IA, VERSOS_REVISION, CAMBIOS_REVISION } from './ia-prompt.js';

// La dirección de la IA en el Worker de Cloudflare (ver worker/README.md). Vacía, sería simulado.
// Para probar otro sin publicar, se puede poner en localStorage 'metrica.ia-endpoint'.
export const ENDPOINT_IA = 'https://metrica.emas1397.workers.dev/ia';
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

// La frase elegida: lo seleccionado (al menos dos palabras, en un solo verso), estirado hasta palabras
// enteras. La IA propone frases relacionadas con esa frase y con sus propias rimas (la de su última
// palabra y sus internas), no con el verso anterior (pedido de Swa); el verso y la estrofa van solo
// de contexto. Devuelve { inicio, fin, pedido } (lo que se reemplaza y lo que se manda) o null.
export function fraseElegida(texto, inicio, fin, { corregir = p => p, distancia = 4 } = {}) {
    while (inicio > 0 && /\p{L}/u.test(texto[inicio - 1])) inicio--;
    while (fin < texto.length && /\p{L}/u.test(texto[fin])) fin++;
    // Sin espacios ni signos sueltos en las puntas (sí los de adentro y los paréntesis cerrados).
    while (inicio < fin && /[\s,;:]/.test(texto[inicio])) inicio++;
    while (fin > inicio && /[\s,;:]/.test(texto[fin - 1])) fin--;
    const elegido = texto.slice(inicio, fin);
    if (elegido.includes('\n') || (elegido.match(/\p{L}+/gu) ?? []).length < 2) return null;
    const versos = texto.split('\n');
    const i = texto.slice(0, inicio).split('\n').length - 1;
    const palabras = versos.map(v => palabrasDeVerso(v, corregir));
    const estrofas = numerarEstrofas(palabras);
    const internasDeLetra = rimasInternas(palabras, distancia || 4);
    const describir = (frase, j, desde = 0) => {
        const propias = palabrasDeVerso(frase, corregir);
        const final = propias.at(-1);
        // Las internas de la frase: las que el motor pinta en el verso, más las de la frase que suenan
        // como otra de ella misma (vale aunque lo seleccionado sea un pedazo del verso).
        const antes = (versos[j].slice(0, desde).match(/\p{L}+/gu) ?? []).length;
        const ecos = propias.map(p => p.length > 3 && claveAsonante(p));
        const internas = propias.slice(0, -1)
            .map((palabra, n) => {
                const delMotor = internasDeLetra[j]?.[antes + n];
                const propia = ecos[n] && ecos.some((otra, m) => m !== n && otra === ecos[n]);
                return (delMotor || propia) && { palabra, asonante: delMotor?.clave ?? ecos[n] };
            })
            .filter(Boolean);
        return {
            texto: frase.trim(),
            silabas: contarSilabasVerso(propias.join(' ')),
            final: { palabra: final, consonante: claveConsonante(final), asonante: claveAsonante(final) },
            internas,
        };
    };
    if (!palabrasDeVerso(elegido, corregir).length) return null;
    const mismaEstrofa = versos.map((_, j) => j).filter(j => estrofas[j] === estrofas[i] && palabras[j].length);
    const anterior = mismaEstrofa.filter(j => j < i).at(-1);
    const posicion = mismaEstrofa.indexOf(i);
    const desdeLinea = texto.lastIndexOf('\n', inicio - 1) + 1;
    const verso = describir(elegido, i, inicio - desdeLinea);
    const enVerso = versos[i].trim();
    return {
        inicio,
        fin,
        pedido: {
            verso,
            ...(enVerso !== verso.texto ? { enVerso } : {}),
            anterior: anterior == null ? null : describir(versos[anterior], anterior),
            estrofa: mismaEstrofa.slice(Math.max(0, posicion - 6), posicion + 2).map(j => versos[j].trim()),
            // La letra entera, solo de contexto: de qué trata y qué imágenes ya se usaron (pedido de Swa).
            // Hasta 80 renglones alrededor del verso, cada uno cortado a 140 letras.
            ...letraDeContexto(versos, i),
            // Que suene como la frase: sus sílabas y que termine rimando con su última palabra.
            objetivo: { silabas: verso.silabas, rimaCon: verso.final.palabra },
        },
    };
}

function letraDeContexto(versos, i) {
    const desde = Math.max(0, Math.min(i - 40, versos.length - VERSOS_REVISION));
    const letra = versos.slice(desde, desde + VERSOS_REVISION).map(v => v.trim().slice(0, 140));
    return { letra, enLetra: i - desde };
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
    // La última rima con la del verso anterior (o, si es el primero de la estrofa, consigo misma).
    const { objetivo, anterior } = verso.pedido;
    const rimaCon = final ? anterior?.final.palabra ?? objetivo.rimaCon : null;
    return {
        inicio, fin,
        pedido: { ...verso.pedido, palabra: { texto: palabra, final }, objetivo: { ...objetivo, rimaCon } },
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
// o iguales a la frase, y se ordenan por rima con la última palabra de la frase (consonante o la misma,
// asonante, ninguna), sílabas más cerca de las de la frase y cuántas de sus rimas internas mantiene. Quedan hasta 4, cada una con sus datos.
export function validarSugerencias(textos, pedido, { corregir = p => p } = {}) {
    const vistas = new Set([normal(pedido.verso.texto)]);
    const { rimaCon, silabas: buscadas } = pedido.objetivo;
    const ecos = new Set(pedido.verso.internas.map(i => i.asonante));
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
    // Terminar con la misma palabra mantiene la rima con el resto de la letra: cuenta como consonante.
    const orden = { consonante: 0, misma: 0, asonante: 1 };
    return resultado
        .sort((a, b) => (orden[a.rima] ?? 2) - (orden[b.rima] ?? 2) || a.diferencia - b.diferencia || b.internas - a.internas)
        .slice(0, SUGERENCIAS_IA);
}

// Respuestas falsas mientras no hay servidor, relacionadas con la frase: la misma idea con otras
// palabras (sinónimos de las del medio) y la última cambiada por una que rima con ella, o igual.
// `rimas`: las que riman con la última palabra; `sinonimosDe`: palabra -> sinónimos (del diccionario).
export function sugerenciasSimuladas(pedido, { rimas = [], sinonimosDe = () => [] } = {}, azar = Math.random) {
    const palabras = pedido.verso.texto.split(/\s+/);
    const final = palabras.at(-1);
    const libres = rimas.filter(r => !r.includes(' ') && r.toLowerCase() !== pedido.verso.final.palabra?.toLowerCase()).slice(0, 20);
    const tomar = lista => lista.splice(Math.floor(azar() * lista.length), 1)[0];
    // Las del medio que tienen sinónimos, para cambiar de a una.
    const cambiables = palabras.slice(0, -1)
        .map((palabra, n) => ({ n, opciones: palabra.length > 3 ? sinonimosDe(palabra.toLowerCase().replace(/[^\p{L}]/gu, '')).filter(o => !o.includes(' ')).slice(0, 6) : [] }))
        .filter(c => c.opciones.length);
    const conSinonimo = (lista, veces) => {
        const copia = [...lista];
        const lugares = [...cambiables];
        for (let k = 0; k < veces && lugares.length; k++) {
            const { n, opciones } = tomar(lugares);
            copia[n] = /^\p{Lu}/u.test(copia[n]) ? opciones[k % opciones.length].replace(/^./u, c => c.toUpperCase()) : opciones[k % opciones.length];
        }
        return copia;
    };
    const variantes = [
        [...palabras.slice(0, -1), libres.length ? tomar(libres) : final],
        [...conSinonimo(palabras, 1).slice(0, -1), final],
        [...conSinonimo(palabras, 2).slice(0, -1), libres.length ? tomar(libres) : final],
        [...conSinonimo(palabras, 1).slice(0, -1), libres.length ? tomar(libres) : final],
        [...conSinonimo(palabras, 2).slice(0, -1), final],
    ];
    return variantes.map(v => v.join(' ')).slice(0, PEDIDAS_IA);
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
// La palabra nueva tiene que rimar (pedido de Swa): con la que reemplaza o con algún final de su estrofa.
export function validarRevision(lista, texto) {
    const lineas = texto.split('\n');
    const palabras = lineas.map(l => palabrasDeVerso(l, p => p));
    const estrofas = numerarEstrofas(palabras);
    const finalesDe = n => palabras.filter((p, j) => p.length && estrofas[j] === estrofas[n]).map(p => claveAsonante(p.at(-1)));
    const vistos = new Set();
    const cambios = [];
    for (const { titulo, verso, viejo, nuevo } of lista) {
        const limpio = String(nuevo ?? '').trim();
        if (!limpio || limpio.length > 140 || limpio.toLowerCase() === String(viejo).trim().toLowerCase()) continue;
        const lugar = ubicarCambio(texto, verso, String(viejo).trim());
        if (!lugar || vistos.has(lugar.inicio)) continue;
        vistos.add(lugar.inicio);
        const original = texto.slice(lugar.inicio, lugar.fin);
        const suena = claveAsonante(limpio.split(/\s+/).at(-1));
        if (!suena || (suena !== claveAsonante(original) && !finalesDe(verso).includes(suena))) continue;
        cambios.push({
            titulo: String(titulo).trim(), n: verso, ...lugar, viejo: original,
            nuevo: /^\p{Lu}/u.test(original) ? limpio[0].toUpperCase() + limpio.slice(1) : limpio,
            verso: lineas[verso],
        });
    }
    return cambios.slice(0, CAMBIOS_REVISION);
}

// Simuladas con el motor propio: palabras repetidas (se cambia la segunda por un sinónimo que rime con
// ella y no esté en la letra) y finales que no riman con ningún otro de su estrofa (por una rima del anterior).
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
                const nuevo = libre(sinonimosDe(clave).filter(p => claveAsonante(p) === claveAsonante(clave)));
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
// Vinculada con el iPhone, el plan y los créditos IA son los del iPhone (`plan-iphone`, ver js/web.js).
const CLAVE_PLAN_WEB = 'metrica.web-plan';
const CLAVE_RESTANTES_WEB = 'metrica.web-restantes';
const planWeb = almacen => { try { return JSON.parse(almacen.getItem(CLAVE_PLAN_WEB)) ?? {}; } catch { return {}; } };
export const tienePlanIA = almacen => almacen.getItem(CLAVE_PLAN) === 'comprado' || planWeb(almacen).ia === true;

// Los mismos headers que manda el iPhone al Worker: así la web gasta sus créditos, no unos propios.
export function cabecerasIA(almacen) {
    const cuenta = planWeb(almacen).cuenta;
    if (!cuenta?.id) return {};
    const cabeceras = { 'X-Metrica-Id': cuenta.id };
    if (cuenta.jws?.length) cabeceras['X-Metrica-JWS'] = cuenta.jws.join(',');
    if (cuenta.simulada) cabeceras['X-Metrica-Simulada'] = cuenta.simulada;
    if (cuenta.paquetesPrueba?.length) cabeceras['X-Metrica-Paquetes-Prueba'] = cuenta.paquetesPrueba.join(',');
    if (cuenta.prueba) cabeceras['X-Metrica-Prueba'] = cuenta.prueba;
    if (cuenta.pais) cabeceras['X-Metrica-Pais'] = cuenta.pais;
    return cabeceras;
}
// Lo que contestó el Worker (`X-Metrica-Restantes`) a un pedido de la web, hasta que el iPhone mande el suyo.
export const guardarRestantesWeb = (almacen, quedan, ahora = Date.now()) =>
    almacen.setItem(CLAVE_RESTANTES_WEB, JSON.stringify({ mes: mesDe(ahora), quedan }));
function cupoDelIphone(almacen, ahora) {
    const { cupo, cuenta } = planWeb(almacen);
    if (!cupo || !cuenta) return null;
    let quedan = cupo.quedan;
    try {
        const web = JSON.parse(almacen.getItem(CLAVE_RESTANTES_WEB));
        if (web?.mes === mesDe(ahora) && Number.isFinite(web.quedan)) quedan = Math.min(quedan, web.quedan);
    } catch { /* sin pedidos desde la web */ }
    const tope = Math.max(1, cupo.total, quedan);
    // Como en Swift: «del mes» solo con la cuota del mes sola; las extra no vencen.
    const delMes = !cupo.extra && cupo.total === cupo.mesTope;
    return { usadas: tope - quedan, tope, quedan, plan: Boolean(cupo.plan), delIphone: true, delMes };
}
export const comprarPlanIA = almacen => { almacen.setItem(CLAVE_PLAN, 'comprado'); return true; };
export const borrarPlanIA = almacen => almacen.setItem(CLAVE_PLAN, '');

function leerUso(almacen) {
    try { return JSON.parse(almacen.getItem(CLAVE_USO)) ?? {}; } catch { return {}; }
}

// { usadas, tope, quedan, plan } del mes de `ahora`. Cada pedido (una tanda de 3 o 4) cuenta uno.
export function usoDelMes(almacen, ahora = Date.now()) {
    const delIphone = cupoDelIphone(almacen, ahora);
    if (delIphone) return delIphone;
    const uso = leerUso(almacen);
    const usadas = uso.mes === mesDe(ahora) ? uso.usadas ?? 0 : 0;
    const plan = tienePlanIA(almacen);
    const tope = plan ? PLAN_IA.tope : CUPO_GRATIS;
    return { usadas, tope, quedan: Math.max(0, tope - usadas), plan };
}

// Además del mes: como mucho 10 por día en cada letra (pedido de Swa).
export const TOPE_POR_LETRA = 10;
const CLAVE_LETRAS = 'metrica.ia-letras';
const diaDe = ms => `${mesDe(ms)}-${String(new Date(ms).getDate()).padStart(2, '0')}`;
function leerLetras(almacen, ahora) {
    let uso = {};
    try { uso = JSON.parse(almacen.getItem(CLAVE_LETRAS)) ?? {}; } catch { /* vacío */ }
    return uso.dia === diaDe(ahora) ? uso.letras ?? {} : {};
}

// El cupo que manda: { usadas, tope, quedan, plan } del mes y, si hay letra, el del día en esa letra
// (`porLetra: true` cuando es el que queda más corto).
export function cupoIA(almacen, letra = null, ahora = Date.now()) {
    const mes = usoDelMes(almacen, ahora);
    if (letra == null) return mes;
    const usadas = leerLetras(almacen, ahora)[letra] ?? 0;
    const quedan = Math.max(0, TOPE_POR_LETRA - usadas);
    return quedan < mes.quedan ? { ...mes, usadas, tope: TOPE_POR_LETRA, quedan, porLetra: true } : mes;
}

export function anotarSugerencia(almacen, ahora = Date.now(), letra = null) {
    const mes = usoDelMes(almacen, ahora);
    // Con el iPhone, lo que queda lo dice el Worker (`guardarRestantesWeb`).
    if (!mes.delIphone) almacen.setItem(CLAVE_USO, JSON.stringify({ mes: mesDe(ahora), usadas: mes.usadas + 1 }));
    if (letra != null) {
        const letras = leerLetras(almacen, ahora);
        letras[letra] = (letras[letra] ?? 0) + 1;
        almacen.setItem(CLAVE_LETRAS, JSON.stringify({ dia: diaDe(ahora), letras }));
    }
    return cupoIA(almacen, letra, ahora);
}

// Como en Swift: el porcentaje que queda, en créditos IA (pedido de Swa: ni usos ni consultas).
export const textoCupo = ({ quedan, tope, plan, porLetra, delMes = true }) => porLetra
    ? `${quedan === 1 ? 'Queda' : 'Quedan'} ${quedan} de ${tope} hoy en esta letra`
    : `${Math.round(100 * quedan / tope)}% de ${etiquetaCreditos({ tope, plan, delMes })}`;
// «20 créditos IA gratis del mes», o con extra (que no vencen) «1.683 créditos IA», sin «mes».
export const etiquetaCreditos = ({ tope, plan, delMes = true }) =>
    `${String(tope).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} créditos IA${delMes ? `${plan ? '' : ' gratis'} del mes` : ''}`;

// Lo que se dice cuando no queda.
export const textoSinCupo = ({ porLetra }) => porLetra
    ? `Ya usaste las ${TOPE_POR_LETRA} de hoy en esta letra. Mañana hay más.`
    : 'Créditos IA insuficientes. Se renuevan el mes que viene.';

// ---------- Cliente del Worker ----------
export const endpointIA = almacen => almacen.getItem(CLAVE_ENDPOINT) || ENDPOINT_IA;

// Un id anónimo por teléfono, para el cupo gratis. La app nativa manda además X-Metrica-JWS
// (el jwsRepresentation de StoreKit); el Worker verifica la compra y la cuota (ver worker/README.md).
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
    servidor: 'No se pudo. Prueba de nuevo en un rato.',
};
const errorIA = motivo => Object.assign(new Error(MENSAJES_ERROR_IA[motivo]), { motivo });

// Pide las sugerencias: al Worker si hay endpoint, o simuladas si no. Devuelve
// { sugerencias: [...], quedan?, simulada? }; si falla, un Error con `motivo` (red, cupo, servidor).
export const pedirSugerencias = (pedido, opciones) => llamarIA({ pedido }, opciones);
// La letra entera, para la pestaña «Sugerencias»: vuelven cambios { titulo, verso, viejo, nuevo }.
export const pedirRevision = (revision, opciones) => llamarIA({ revision }, opciones);

async function llamarIA(cuerpo, { endpoint = '', id = '', cabeceras = {}, alRestantes = () => {}, fetch = globalThis.fetch, simular = () => [] } = {}) {
    if (!endpoint) return { sugerencias: simular(), simulada: true };
    let respuesta;
    try {
        respuesta = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Metrica-Id': id, ...cabeceras },
            body: JSON.stringify(cuerpo),
        });
    } catch {
        throw errorIA('red');
    }
    const restantes = parseInt(respuesta.headers?.get?.('X-Metrica-Restantes') ?? '', 10);
    if (Number.isFinite(restantes)) alRestantes(restantes);
    else if (respuesta.status === 402) alRestantes(0);
    if (respuesta.status === 402 || respuesta.status === 429) throw errorIA('cupo');
    if (!respuesta.ok) throw errorIA('servidor');
    const datos = await respuesta.json().catch(() => ({}));
    if (!Array.isArray(datos.sugerencias)) throw errorIA('servidor');
    return { sugerencias: datos.sugerencias, quedan: datos.quedan };
}
