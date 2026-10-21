// Métrica Extras: el pago único (sin suscripción). Sin DOM: el almacenamiento se
// pasa como parámetro, igual que en sesiones.js. En la web la compra es simulada;
// en SwiftUI, comprarExtras será Product.purchase() de StoreKit 2 y tieneExtras
// saldrá de Transaction.currentEntitlements. Las rimas y lo básico nunca se bloquean.

const CLAVE_COMPRA = 'metrica.extras';
const CLAVE_TEMA = 'metrica.tema-libreta';

export const PRODUCTO = { id: 'metrica.extras', nombre: 'Métrica Extras', precio: 'USD 4,99' };

// Temas de la libreta. Los que tienen extra: true se desbloquean con el pago.
export const TEMAS = [
    { clave: 'gris', nombre: 'Gris liso', extra: false },
    { clave: 'blanco', nombre: 'Blanco', extra: false },
    { clave: 'papel', nombre: 'Papel', extra: true },
    { clave: 'pizarra', nombre: 'Pizarra', extra: true },
    { clave: 'medianoche', nombre: 'Medianoche', extra: true },
    { clave: 'lavanda', nombre: 'Lavanda', extra: true },
];
const TEMA_INICIAL = 'gris';

export function tieneExtras(almacen) {
    return almacen.getItem(CLAVE_COMPRA) === 'comprado';
}

// Simula la compra. Devuelve true si quedó comprado.
export function comprarExtras(almacen) {
    almacen.setItem(CLAVE_COMPRA, 'comprado');
    return true;
}

// Para probar: vuelve a la versión gratis (un tema de pago elegido pasa al inicial, ver temaActual).
export function borrarCompra(almacen) {
    almacen.setItem(CLAVE_COMPRA, '');
}

// Con Extras no se muestra publicidad.
export const mostrarPublicidad = almacen => !tieneExtras(almacen);

export function temaDisponible(clave, almacen) {
    const tema = TEMAS.find(t => t.clave === clave);
    return Boolean(tema) && (!tema.extra || tieneExtras(almacen));
}

// El tema elegido; si no está disponible (o no existe), el inicial.
export function temaActual(almacen) {
    const clave = almacen.getItem(CLAVE_TEMA);
    return temaDisponible(clave, almacen) ? clave : TEMA_INICIAL;
}

// Elige un tema. Devuelve false si está bloqueado (hay que mostrar el paywall).
export function elegirTema(almacen, clave) {
    if (!temaDisponible(clave, almacen)) return false;
    almacen.setItem(CLAVE_TEMA, clave);
    return true;
}
