// Papelera: las letras y las frases del baúl borradas quedan acá 7 días, para poder
// restaurarlas, y después se borran solas. Sin DOM, con el almacenamiento como parámetro
// (localStorage en la web; en SwiftUI, lo mismo que las letras).

const CLAVE_PAPELERA = 'metrica.papelera';
export const DIAS_PAPELERA = 7;
const DIA = 864e5;

function leer(almacen) {
    try {
        const valor = JSON.parse(almacen.getItem(CLAVE_PAPELERA));
        return Array.isArray(valor) ? valor : [];
    } catch {
        return [];
    }
}

const escribir = (almacen, entradas) => almacen.setItem(CLAVE_PAPELERA, JSON.stringify(entradas));

// Una letra y una frase pueden tener el mismo id (los dos salen de la hora), así que la clave lleva el tipo.
export const claveDe = entrada => `${entrada.tipo}-${entrada.cosa.id}`;

// tipo: 'letra' o 'frase'; cosa: la letra o la frase tal como estaba.
export function mandarAPapelera(almacen, tipo, cosa, ahora = Date.now()) {
    const entrada = { tipo, cosa, borrada: ahora };
    escribir(almacen, [...leer(almacen).filter(e => claveDe(e) !== claveDe(entrada)), entrada]);
}

// Lo que hay en la papelera, lo último borrado primero. Lo que lleva 7 días se borra acá.
export function listarPapelera(almacen, ahora = Date.now()) {
    const todas = leer(almacen);
    const vigentes = todas.filter(e => ahora - e.borrada < DIAS_PAPELERA * DIA);
    if (vigentes.length !== todas.length) escribir(almacen, vigentes);
    return vigentes.sort((a, b) => b.borrada - a.borrada);
}

// La saca de la papelera (para restaurarla o borrarla para siempre) y la devuelve.
export function sacarDePapelera(almacen, clave) {
    const todas = leer(almacen);
    escribir(almacen, todas.filter(e => claveDe(e) !== clave));
    return todas.find(e => claveDe(e) === clave) ?? null;
}

export function vaciarPapelera(almacen) {
    escribir(almacen, []);
}

// Cuántos días le quedan antes de borrarse sola (al menos 1, mientras está).
export function diasQuedan(entrada, ahora = Date.now()) {
    return Math.max(1, Math.ceil((entrada.borrada + DIAS_PAPELERA * DIA - ahora) / DIA));
}
