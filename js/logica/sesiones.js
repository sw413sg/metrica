// Letras guardadas y favoritos. Sin DOM: el almacenamiento se pasa como
// parámetro (localStorage en la web; en SwiftUI será SwiftData o similar).
// TODO (paso 3 del plan): listar, guardar y borrar letras; favoritos.

export function nuevaLetra(ahora = Date.now()) {
    return { id: String(ahora), titulo: '', texto: '', creada: ahora, editada: ahora };
}

export function listarLetras(almacen) {
    return [];
}

export function guardarLetra(almacen, letra) {
    // Sin implementar todavía.
}
