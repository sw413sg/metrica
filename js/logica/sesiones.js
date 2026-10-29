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

// Las letras guardadas, de la última editada a la primera, salvo las que se acomodaron a mano
// (`orden`). Editar una letra la vuelve a poner primera.
const puesto = letra => letra.orden ?? letra.editada;
export function listarLetras(almacen) {
    return leer(almacen, CLAVE_LETRAS).sort((a, b) => puesto(b) - puesto(a));
}

// Acomoda una letra en otro lugar de la lista (0 es la primera). Se reparten los mismos
// puestos que había, así una letra editada después igual queda primera.
export function moverLetra(almacen, id, lugar) {
    const letras = listarLetras(almacen);
    const puestos = letras.map(puesto);
    const desde = letras.findIndex(l => l.id === id);
    if (desde < 0) return;
    const [letra] = letras.splice(desde, 1);
    letras.splice(lugar, 0, letra);
    escribir(almacen, CLAVE_LETRAS, letras.map((l, i) => ({ ...l, orden: puestos[i] })));
}

// Si la tarjeta de una letra es larga (dos filas) o chica. Sale de su id, así es al azar pero
// siempre la misma para cada letra, aunque cambie de lugar. Más o menos 4 de cada 10 son largas.
export function esLarga(id) {
    let h = 2166136261;
    for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0) % 10 < 4;
}

// Dónde va cada tarjeta en la grilla de dos columnas, en orden. La tarjeta "+" ocupa arriba a
// la izquierda; cada tarjeta va a la columna más corta (empate: la izquierda), con el alto de
// esLarga. Así las alturas se mezclan sin un patrón fijo. En SwiftUI: un Grid con estos lugares.
export function lugaresEnGrilla(ids) {
    const alto = [1, 0];
    return ids.map(id => {
        const columna = alto[1] < alto[0] ? 2 : 1, larga = esLarga(id);
        const fila = alto[columna - 1] + 1;
        alto[columna - 1] += larga ? 2 : 1;
        return { columna, fila, larga };
    });
}

// Guarda (o actualiza) la letra y la devuelve con la fecha de edición nueva.
// Una letra sin título ni texto no se guarda: se borra si estaba.
export function guardarLetra(almacen, letra, ahora = Date.now()) {
    const otras = leer(almacen, CLAVE_LETRAS).filter(l => l.id !== letra.id);
    if (!letra.titulo.trim() && !letra.texto.trim()) {
        escribir(almacen, CLAVE_LETRAS, otras);
        return letra;
    }
    const guardada = { ...letra, editada: ahora, orden: ahora };
    escribir(almacen, CLAVE_LETRAS, [...otras, guardada]);
    return guardada;
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
