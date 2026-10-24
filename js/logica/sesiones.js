// Letras guardadas. Sin DOM: el almacenamiento se pasa como
// parámetro (localStorage en la web; en SwiftUI será SwiftData o similar).
// Solo usa getItem/setItem, así que en los tests alcanza con un objeto simple.

const CLAVE_LETRAS = 'metrica.letras';

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

// Dónde va cada tarjeta en la grilla de dos columnas (lugar 0 es la tarjeta "+"). De a tres:
// dos chicas a la izquierda y una larga a la derecha, y en el grupo siguiente al revés
// (una larga a la izquierda y dos chicas a la derecha). En SwiftUI: un Grid con estos lugares.
export function lugarEnGrilla(lugar) {
    const grupo = Math.floor(lugar / 3), cual = lugar % 3, fila = grupo * 2 + 1;
    if (grupo % 2 === 0) {
        return [{ columna: 1, fila, larga: false }, { columna: 2, fila, larga: true }, { columna: 1, fila: fila + 1, larga: false }][cual];
    }
    return [{ columna: 1, fila, larga: true }, { columna: 2, fila, larga: false }, { columna: 2, fila: fila + 1, larga: false }][cual];
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

export function borrarLetra(almacen, id) {
    escribir(almacen, CLAVE_LETRAS, leer(almacen, CLAVE_LETRAS).filter(l => l.id !== id));
}
