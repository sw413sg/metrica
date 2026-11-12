// Letras y palabras guardadas. Sin DOM: el almacenamiento se pasa como
// parámetro (localStorage en la web; en SwiftUI será SwiftData o similar).
// Solo usa getItem/setItem, así que en los tests alcanza con un objeto simple.

import { mandarAPapelera } from './papelera.js';
import { temaParaModo } from './compra.js';

const CLAVE_LETRAS = 'metrica.letras';
const CLAVE_GUARDADAS = 'metrica.guardadas';

function leer(almacen, clave) {
    try {
        const valor = JSON.parse(almacen.getItem(clave));
        return Array.isArray(valor) ? valor : [];
    } catch {
        return [];
    }
}

const escribir = (almacen, clave, valor) => almacen.setItem(clave, JSON.stringify(valor));

export function nuevaLetra(ahora = Date.now()) {
    return { id: String(ahora), titulo: '', texto: '', creada: ahora, editada: ahora };
}

// Las letras guardadas, de la última creada a la primera, salvo las que se acomodaron a mano
// (`lugar`). Editar una letra no la cambia de lugar (pedido de Swa, como en Swift). Una sin fecha
// de creación (vieja o importada) va por su última edición.
const puesto = letra => letra.lugar ?? (letra.creada || letra.editada || 0);
export function listarLetras(almacen) {
    return leer(almacen, CLAVE_LETRAS).sort((a, b) => puesto(b) - puesto(a));
}

// Acomoda una letra en otro lugar de la lista (0 es la primera). Se reparten los mismos puestos
// que había, así una letra creada después igual queda primera. Con `carpeta`, el lugar es dentro
// de esa carpeta (el orden de un disco): solo se reparten los puestos de sus letras.
export function moverLetra(almacen, id, lugar, carpeta = null) {
    const todas = listarLetras(almacen);
    const letras = carpeta ? todas.filter(l => l.carpeta === carpeta) : [...todas];
    const puestos = letras.map(puesto);
    const desde = letras.findIndex(l => l.id === id);
    if (desde < 0) return;
    const [letra] = letras.splice(desde, 1);
    letras.splice(lugar, 0, letra);
    const nuevos = new Map(letras.map((l, i) => [l.id, puestos[i]]));
    escribir(almacen, CLAVE_LETRAS, todas.map(l => (nuevos.has(l.id) ? { ...l, lugar: nuevos.get(l.id) } : l)));
}

// Si la tarjeta de una letra es larga (dos filas) o chica. Sale de su id, así es al azar pero
// siempre la misma para cada letra, aunque cambie de lugar. Más o menos 4 de cada 10 son largas.
export function esLarga(id) {
    let h = 2166136261;
    for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0) % 10 < 4;
}

// Dónde va cada tarjeta en la grilla (de dos columnas en el iPhone; en la computadora, las que
// entren), en orden. La tarjeta "+" ocupa arriba a la izquierda; cada tarjeta va a la columna más
// corta (empate: la de más a la izquierda), con el alto de esLarga. Así las alturas se mezclan sin
// un patrón fijo. En SwiftUI: un Grid con estos lugares.
export function lugaresEnGrilla(ids, columnas = 2) {
    const alto = Array.from({ length: Math.max(1, columnas) }, (_, i) => (i === 0 ? 1 : 0));
    return ids.map(id => {
        const columna = alto.indexOf(Math.min(...alto)) + 1, larga = esLarga(id);
        const fila = alto[columna - 1] + 1;
        alto[columna - 1] += larga ? 2 : 1;
        return { columna, fila, larga };
    });
}

// Guarda (o actualiza) la letra y la devuelve con la fecha de edición nueva, en el mismo lugar.
// Una letra nueva (sin fecha de creación) toma la de ahora, así va primera.
// Una letra sin título ni texto no se guarda: se borra si estaba.
export function guardarLetra(almacen, letra, ahora = Date.now()) {
    const todas = leer(almacen, CLAVE_LETRAS), otras = todas.filter(l => l.id !== letra.id);
    if (!letra.titulo.trim() && !letra.texto.trim()) {
        escribir(almacen, CLAVE_LETRAS, otras);
        return letra;
    }
    const guardada = { ...letra, editada: ahora };
    // El lugar y la carpeta son los guardados: se cambian desde la lista (o desde el iPhone),
    // no desde la letra abierta.
    const vieja = todas.find(l => l.id === letra.id);
    if (vieja) {
        if (vieja.lugar != null) guardada.lugar = vieja.lugar; else delete guardada.lugar;
        if (vieja.carpeta != null) guardada.carpeta = vieja.carpeta; else delete guardada.carpeta;
    }
    if (!guardada.creada) guardada.creada = ahora;
    escribir(almacen, CLAVE_LETRAS, [...otras, guardada]);
    return guardada;
}

// Las letras en el orden elegido en el menú de Letras (como en Swift): «fecha» es el de siempre
// (de la última creada a la primera, con las acomodadas a mano), «modificacion» por la última
// edición y «titulo» de la A a la Z (sin título, siempre al final). `ascendente` lo da vuelta.
export const ORDENES_LETRAS = ['fecha', 'titulo', 'modificacion'];
export const ascendentePorDefecto = orden => orden === 'titulo';
export function ordenarLetras(letras, orden = 'fecha', ascendente = false) {
    if (orden === 'modificacion') return [...letras].sort((a, b) => (ascendente ? a.editada - b.editada : b.editada - a.editada));
    if (orden === 'titulo') {
        return [...letras].sort((a, b) => {
            const ta = (a.titulo || '').trim(), tb = (b.titulo || '').trim();
            if (!ta !== !tb) return ta ? -1 : 1;
            const c = ta.localeCompare(tb, 'es', { numeric: true, sensitivity: 'base' });
            return ascendente ? c : -c;
        });
    }
    return ascendente ? [...letras].reverse() : letras;
}

// Si la letra sale en el buscador de Letras: por el título o el texto, sin tildes ni mayúsculas.
const sinMarcas = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function coincideBusqueda(letra, buscado) {
    const b = sinMarcas(buscado).trim();
    return !b || sinMarcas(letra.titulo).includes(b) || sinMarcas(letra.texto).includes(b);
}

// Suma letras que vienen de otro lado (Google Keep) tal como están, con sus fechas.
export function agregarLetras(almacen, letras) {
    escribir(almacen, CLAVE_LETRAS, [...leer(almacen, CLAVE_LETRAS), ...letras]);
}

// Borrar una letra la manda a la papelera (js/logica/papelera.js), donde queda 7 días.
export function borrarLetra(almacen, id, ahora = Date.now()) {
    const letras = leer(almacen, CLAVE_LETRAS), letra = letras.find(l => l.id === id);
    if (letra) mandarAPapelera(almacen, 'letra', letra, ahora);
    escribir(almacen, CLAVE_LETRAS, letras.filter(l => l.id !== id));
}

// La letra vuelve de la papelera tal como estaba, en su lugar.
export function restaurarLetra(almacen, letra) {
    escribir(almacen, CLAVE_LETRAS, [...leer(almacen, CLAVE_LETRAS).filter(l => l.id !== letra.id), letra]);
}

// Palabras guardadas desde Rimas, de la última guardada a la primera.
export function listarGuardadas(almacen) {
    return leer(almacen, CLAVE_GUARDADAS);
}

// Guarda o saca una palabra. Devuelve true si quedó guardada.
export function alternarGuardada(almacen, palabra) {
    const guardadas = leer(almacen, CLAVE_GUARDADAS);
    const queda = !guardadas.includes(palabra);
    escribir(almacen, CLAVE_GUARDADAS, queda ? [palabra, ...guardadas] : guardadas.filter(g => g !== palabra));
    return queda;
}

// Al cambiar la app entre claro y oscuro, cada letra pasa al último tema que usó en ese modo
// (temaParaModo en compra.js), sin cambiar de lugar en la lista.
export function adaptarTemasDeLetras(almacen, modo) {
    escribir(almacen, CLAVE_LETRAS, leer(almacen, CLAVE_LETRAS).map(letra => {
        if (!letra.tema) return letra;
        const { tema, temas } = temaParaModo(almacen, letra.tema, letra.temas, modo);
        return { ...letra, tema, temas };
    }));
}
