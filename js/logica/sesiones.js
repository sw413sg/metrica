// Letras guardadas y favoritos. Sin DOM: el almacenamiento se pasa como
// parámetro (localStorage en la web; en SwiftUI será SwiftData o similar).
// Solo usa getItem/setItem, así que en los tests alcanza con un objeto simple.

const CLAVE_LETRAS = 'metrica.letras';
const CLAVE_FAVORITOS = 'metrica.favoritos';

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

// Las letras guardadas, de la última editada a la primera.
export function listarLetras(almacen) {
    return leer(almacen, CLAVE_LETRAS).sort((a, b) => b.editada - a.editada);
}

// Guarda (o actualiza) la letra y la devuelve con la fecha de edición nueva.
// Una letra sin título ni texto no se guarda: se borra si estaba.
export function guardarLetra(almacen, letra, ahora = Date.now()) {
    const otras = leer(almacen, CLAVE_LETRAS).filter(l => l.id !== letra.id);
    if (!letra.titulo.trim() && !letra.texto.trim()) {
        escribir(almacen, CLAVE_LETRAS, otras);
        return letra;
    }
    const guardada = { ...letra, editada: ahora };
    escribir(almacen, CLAVE_LETRAS, [...otras, guardada]);
    return guardada;
}

export function borrarLetra(almacen, id) {
    escribir(almacen, CLAVE_LETRAS, leer(almacen, CLAVE_LETRAS).filter(l => l.id !== id));
}

// Palabras favoritas, de la última marcada a la primera.
export function listarFavoritos(almacen) {
    return leer(almacen, CLAVE_FAVORITOS);
}

// Marca o desmarca una palabra. Devuelve true si quedó como favorita.
export function alternarFavorito(almacen, palabra) {
    const favoritos = leer(almacen, CLAVE_FAVORITOS);
    const queda = !favoritos.includes(palabra);
    escribir(almacen, CLAVE_FAVORITOS, queda ? [palabra, ...favoritos] : favoritos.filter(f => f !== palabra));
    return queda;
}
