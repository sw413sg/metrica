// Métrica Extras: el pago único (sin suscripción). Sin DOM: el almacenamiento se
// pasa como parámetro, igual que en sesiones.js. En la web la compra es simulada;
// en SwiftUI, comprarExtras será Product.purchase() de StoreKit 2 y tieneExtras
// saldrá de Transaction.currentEntitlements. Las rimas y lo básico nunca se bloquean.

const CLAVE_COMPRA = 'metrica.extras';

export const PRODUCTO = { id: 'metrica.extras', nombre: 'Métrica Extras', precio: 'USD 4,99' };

// Temas de la libreta. Los que tienen extra: true se desbloquean con el pago.
export const TEMAS = [
    { clave: 'gris', nombre: 'Gris liso', extra: false },
    { clave: 'blanco', nombre: 'Blanco', extra: false },
    { clave: 'madrugada', nombre: 'Madrugada', extra: true },
    { clave: 'sierra', nombre: 'Sierra', extra: true },
    { clave: 'ondas', nombre: 'Ondas', extra: true },
    { clave: 'arena', nombre: 'Arena', extra: true },
    { clave: 'partitura', nombre: 'Partitura', extra: true },
    // Diez más (pedido de Swa): cinco oscuros y cinco claros.
    { clave: 'vinilo', nombre: 'Vinilo', extra: true },
    { clave: 'bosque', nombre: 'Bosque', extra: true },
    { clave: 'brasa', nombre: 'Brasa', extra: true },
    { clave: 'aurora', nombre: 'Aurora', extra: true },
    { clave: 'tinta', nombre: 'Tinta', extra: true },
    { clave: 'papel', nombre: 'Papel', extra: true },
    { clave: 'menta', nombre: 'Menta', extra: true },
    { clave: 'cielo', nombre: 'Cielo', extra: true },
    { clave: 'durazno', nombre: 'Durazno', extra: true },
    { clave: 'cafe', nombre: 'Café', extra: true },
    // Del espacio (pedido de Swa): cuatro oscuros y uno claro.
    { clave: 'galaxia', nombre: 'Galaxia', extra: true },
    { clave: 'nebulosa', nombre: 'Nebulosa', extra: true },
    { clave: 'saturno', nombre: 'Saturno', extra: true },
    { clave: 'eclipse', nombre: 'Eclipse', extra: true },
    { clave: 'luna', nombre: 'Luna', extra: true },
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

// Para probar: vuelve a la versión gratis (un tema de pago elegido pasa al inicial, ver temaDeLetra).
export function borrarCompra(almacen) {
    almacen.setItem(CLAVE_COMPRA, '');
}

// Con Extras no se muestra publicidad.
export const mostrarPublicidad = almacen => !tieneExtras(almacen);

export function temaDisponible(clave, almacen) {
    const tema = TEMAS.find(t => t.clave === clave);
    return Boolean(tema) && (!tema.extra || tieneExtras(almacen));
}

// Cada letra tiene su tema (letra.tema, guardado con la letra). Si no eligió ninguno, o el suyo
// no está disponible (de Extras sin comprar), va el inicial: Gris liso.
export function temaDeLetra(letra, almacen) {
    return temaDisponible(letra?.tema, almacen) ? letra.tema : TEMA_INICIAL;
}
