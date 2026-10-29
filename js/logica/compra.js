// Métrica Extras: el pago único (sin suscripción). Sin DOM: el almacenamiento se
// pasa como parámetro, igual que en sesiones.js. En la web la compra es simulada;
// en SwiftUI, comprarExtras será Product.purchase() de StoreKit 2 y tieneExtras
// saldrá de Transaction.currentEntitlements. Las rimas y lo básico nunca se bloquean.

const CLAVE_COMPRA = 'metrica.extras';

export const PRODUCTO = { id: 'metrica.extras', nombre: 'Métrica Extras', precio: 'USD 4,99' };

// Temas de la libreta. Los que tienen extra: true se desbloquean con el pago.
export const TEMAS = [
    // En la ruedita, los oscuros van en el renglón de arriba y los claros en el de abajo, mezclados,
    // salvo los dos gratis, que van primeros: Gris liso arriba y Blanco abajo (pedido de Swa).
    { clave: 'gris', nombre: 'Gris liso', extra: false, oscuro: true },
    { clave: 'galaxia', nombre: 'Galaxia', extra: true, oscuro: true },
    { clave: 'vinilo', nombre: 'Vinilo', extra: true, oscuro: true },
    { clave: 'sierra', nombre: 'Sierra', extra: true, oscuro: true },
    { clave: 'nebulosa', nombre: 'Nebulosa', extra: true, oscuro: true },
    { clave: 'brasa', nombre: 'Brasa', extra: true, oscuro: true },
    { clave: 'madrugada', nombre: 'Madrugada', extra: true, oscuro: true },
    { clave: 'eclipse', nombre: 'Eclipse', extra: true, oscuro: true },
    { clave: 'bosque', nombre: 'Bosque', extra: true, oscuro: true },
    { clave: 'tinta', nombre: 'Tinta', extra: true, oscuro: true },
    { clave: 'saturno', nombre: 'Saturno', extra: true, oscuro: true },
    { clave: 'aurora', nombre: 'Aurora', extra: true, oscuro: true },
    { clave: 'ondas', nombre: 'Ondas', extra: true, oscuro: true },
    { clave: 'blanco', nombre: 'Blanco', extra: false, oscuro: false },
    { clave: 'cielo', nombre: 'Cielo', extra: true, oscuro: false },
    { clave: 'cafe', nombre: 'Café', extra: true, oscuro: false },
    { clave: 'luna', nombre: 'Luna', extra: true, oscuro: false },
    { clave: 'menta', nombre: 'Menta', extra: true, oscuro: false },
    { clave: 'partitura', nombre: 'Partitura', extra: true, oscuro: false },
    { clave: 'durazno', nombre: 'Durazno', extra: true, oscuro: false },
    { clave: 'papel', nombre: 'Papel', extra: true, oscuro: false },
    { clave: 'arena', nombre: 'Arena', extra: true, oscuro: false },
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

// Qué tan fuerte se ve la ilustración del tema, de 1 a 10 (pedido de Swa). Cada letra tiene la
// suya (letra.opacidadTema) y arranca en 10, entera.
export const OPACIDAD_TEMA = { minima: 1, maxima: 10, inicial: 10 };
export function opacidadDeTema(valor) {
    const numero = Math.round(Number(valor));
    if (!Number.isFinite(numero)) return OPACIDAD_TEMA.inicial;
    return Math.min(OPACIDAD_TEMA.maxima, Math.max(OPACIDAD_TEMA.minima, numero));
}

// Modo claro y oscuro (pedido de Swa): al pasar la app a oscuro, lo que tenía un tema claro pasa
// al último tema oscuro que se usó, y al volver a claro, al último claro. Gris liso se adapta
// solo a los dos modos, así que no cambia. Cada letra (y el baúl) recuerda el último de cada
// modo en `temas`; si no tiene, va el último que se eligió en cualquier lado, y si no, Gris liso.
// Gris liso elegido a propósito no guarda `temas`, así queda fijo.
const CLAVE_ULTIMOS = 'metrica.ultimos-temas';
export const claseDeTema = clave => {
    const tema = TEMAS.find(t => t.clave === clave);
    if (!tema || clave === TEMA_INICIAL) return null;
    return tema.oscuro ? 'oscuro' : 'claro';
};

function leerUltimos(almacen) {
    try {
        return JSON.parse(almacen.getItem(CLAVE_ULTIMOS)) ?? {};
    } catch {
        return {};
    }
}

// Anota el tema que se acaba de elegir y devuelve los `temas` de quien lo eligió, al día.
export function recordarTema(almacen, clave, temas = {}) {
    const clase = claseDeTema(clave);
    // Elegir Gris liso a propósito lo deja fijo en los dos modos: se olvida lo recordado.
    if (!clase) return {};
    almacen.setItem(CLAVE_ULTIMOS, JSON.stringify({ ...leerUltimos(almacen), [clase]: clave }));
    return { ...temas, [clase]: clave };
}

// El tema que corresponde en un modo ('claro' u 'oscuro'), y los `temas` recordados al día.
export function temaParaModo(almacen, tema, temas = {}, modo) {
    const clase = claseDeTema(tema);
    const recordados = clase ? { ...temas, [clase]: tema } : { ...temas };
    if (clase === modo) return { tema, temas: recordados };
    // Gris liso puesto al cambiar de modo (no había otro) vuelve al recordado cuando lo hay.
    if (!clase) return { tema: recordados[modo] ?? tema, temas: recordados };
    return { tema: recordados[modo] ?? leerUltimos(almacen)[modo] ?? TEMA_INICIAL, temas: recordados };
}
