// Carpetas de letras (como Carpetas.swift; pedido de Swa del 2026-11-11): «Disco 2026», «Para
// Juan»... Una letra va en una sola carpeta (`letra.carpeta`, el id), o en ninguna. Dentro de una
// carpeta las letras se acomodan a mano (`moverLetra(almacen, id, lugar, carpeta)`), como el orden de
// un EP. Gratis, hasta CARPETAS_GRATIS; con Métrica+, sin límite. Viajan con el iPhone por Métrica web.

const CLAVE_CARPETAS = 'metrica.carpetas';
const CLAVE_LETRAS = 'metrica.letras';

/** Cuántas carpetas se pueden crear sin Métrica+. */
export const CARPETAS_GRATIS = 2;

function leer(almacen, clave) {
    try {
        const valor = JSON.parse(almacen.getItem(clave));
        return Array.isArray(valor) ? valor.filter(v => v && typeof v === 'object') : [];
    } catch {
        return [];
    }
}

const escribir = (almacen, clave, valor) => almacen.setItem(clave, JSON.stringify(valor));
const limpiar = nombre => String(nombre ?? '').trim();

/** Las carpetas, de la primera creada a la última (así no cambian de lugar al crear otra). */
export function listarCarpetas(almacen) {
    return leer(almacen, CLAVE_CARPETAS).sort((a, b) => (a.creada ?? 0) - (b.creada ?? 0));
}

/** Si se puede crear otra: gratis, hasta CARPETAS_GRATIS; con Métrica+, siempre. */
export function puedeCrearCarpeta(almacen, extras) {
    return Boolean(extras) || leer(almacen, CLAVE_CARPETAS).length < CARPETAS_GRATIS;
}

/** Crea una carpeta. Sin nombre, o pasado el límite, no crea nada (null). */
export function crearCarpeta(almacen, nombre, extras, ahora = Date.now()) {
    const limpio = limpiar(nombre);
    if (!limpio || !puedeCrearCarpeta(almacen, extras)) return null;
    const carpetas = leer(almacen, CLAVE_CARPETAS);
    // Dos creadas en el mismo milisegundo no comparten id.
    let id = ahora;
    while (carpetas.some(c => c.id === String(id))) id += 1;
    const carpeta = { id: String(id), nombre: limpio, creada: ahora };
    escribir(almacen, CLAVE_CARPETAS, [...carpetas, carpeta]);
    return carpeta;
}

/** Cambia el nombre; sin nombre, queda el de antes. */
export function renombrarCarpeta(almacen, id, nombre) {
    const limpio = limpiar(nombre);
    if (!limpio) return;
    escribir(almacen, CLAVE_CARPETAS, leer(almacen, CLAVE_CARPETAS).map(c => (c.id === id ? { ...c, nombre: limpio } : c)));
}

/** Borra la carpeta, no sus letras: quedan sueltas, en «Todas las letras». */
export function borrarCarpeta(almacen, id) {
    escribir(almacen, CLAVE_CARPETAS, leer(almacen, CLAVE_CARPETAS).filter(c => c.id !== id));
    const letras = leer(almacen, CLAVE_LETRAS);
    if (!letras.some(l => l.carpeta === id)) return;
    escribir(almacen, CLAVE_LETRAS, letras.map(l => {
        if (l.carpeta !== id) return l;
        const { carpeta, ...suelta } = l;
        return suelta;
    }));
}

/** Pasa las letras a una carpeta (null: las saca de la que tengan). No cambian de lugar en «Todas». */
export function moverACarpeta(almacen, ids, carpeta) {
    const elegidas = new Set(ids);
    if (carpeta != null && !leer(almacen, CLAVE_CARPETAS).some(c => c.id === carpeta)) return;
    const letras = leer(almacen, CLAVE_LETRAS);
    if (!letras.some(l => elegidas.has(l.id) && (l.carpeta ?? null) !== carpeta)) return;
    escribir(almacen, CLAVE_LETRAS, letras.map(l => {
        if (!elegidas.has(l.id)) return l;
        const { carpeta: _vieja, ...movida } = l;
        return carpeta == null ? movida : { ...movida, carpeta };
    }));
}

/** Las letras de una carpeta (null: todas), en el orden en que vienen. */
export function letrasDeCarpeta(letras, carpeta) {
    return carpeta == null ? letras : letras.filter(l => l.carpeta === carpeta);
}

/** Cuántas letras tiene cada carpeta (id → cantidad). */
export function cantidadesPorCarpeta(almacen) {
    const cuantas = {};
    for (const l of leer(almacen, CLAVE_LETRAS)) if (l.carpeta != null) cuantas[l.carpeta] = (cuantas[l.carpeta] ?? 0) + 1;
    return cuantas;
}

/** «1 letra», «5 letras». */
export const textoCantidadLetras = cantidad => (cantidad === 1 ? '1 letra' : `${cantidad} letras`);

/** Sin las letras de las carpetas protegidas (con Face ID en el iPhone): esas no se ven en la web. */
export function sinCarpetasProtegidas(letras, almacen) {
    const protegidas = new Set(leer(almacen, CLAVE_CARPETAS).filter(c => c.protegida === true).map(c => c.id));
    return protegidas.size ? letras.filter(l => l.carpeta == null || !protegidas.has(l.carpeta)) : letras;
}

/** Las carpetas que se ven en la web: las protegidas con Face ID quedan solo en el iPhone. */
export const carpetasVisibles = almacen => listarCarpetas(almacen).filter(c => c.protegida !== true);
