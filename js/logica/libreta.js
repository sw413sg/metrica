// Ajustes de la libreta: tamaño de letra, separación entre renglones y entre letras, y fuente.
// Se guardan en el almacén (localStorage en la web). Sin DOM.
export const AJUSTES_LIBRETA = {
    tamano: {
        nombre: 'Tamaño de letra',
        porDefecto: 'mediano',
        opciones: { chico: { nombre: 'Chico', valor: 15 }, mediano: { nombre: 'Mediano', valor: 17 }, grande: { nombre: 'Grande', valor: 20 } },
    },
    separacion: {
        nombre: 'Separación de renglones',
        porDefecto: 'normal',
        opciones: { junta: { nombre: 'Junta', valor: 1.2 }, normal: { nombre: 'Normal', valor: 1.35 }, amplia: { nombre: 'Amplia', valor: 1.7 } },
    },
    // Separación horizontal entre letras (letter-spacing, en SwiftUI .tracking), en em.
    letras: {
        nombre: 'Separación de letras',
        porDefecto: 'normal',
        opciones: { junta: { nombre: 'Junta', valor: -0.04 }, normal: { nombre: 'Normal', valor: 0 }, amplia: { nombre: 'Amplia', valor: 0.06 } },
    },
    fuente: {
        nombre: 'Fuente',
        porDefecto: 'sistema',
        opciones: {
            sistema: { nombre: 'Sistema', valor: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif' },
            serif: { nombre: 'Serif', valor: 'ui-serif, "New York", Georgia, "Times New Roman", serif' },
            maquina: { nombre: 'Máquina', valor: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
        },
    },
};

const CLAVE = 'metrica.libreta';

// { tamano, separacion, fuente } con lo elegido, o lo de por defecto si no hay nada (o algo raro).
export function leerAjustesLibreta(almacen) {
    let guardados = {};
    try { guardados = JSON.parse(almacen.getItem(CLAVE)) ?? {}; } catch { /* queda lo de por defecto */ }
    return Object.fromEntries(Object.entries(AJUSTES_LIBRETA).map(([clave, ajuste]) =>
        [clave, guardados[clave] in ajuste.opciones ? guardados[clave] : ajuste.porDefecto]));
}

export function guardarAjusteLibreta(almacen, clave, opcion) {
    if (!(opcion in (AJUSTES_LIBRETA[clave]?.opciones ?? {}))) return leerAjustesLibreta(almacen);
    const ajustes = { ...leerAjustesLibreta(almacen), [clave]: opcion };
    almacen.setItem(CLAVE, JSON.stringify(ajustes));
    return ajustes;
}

// Lo que necesita la pantalla: tamaño y alto de renglón en px (enteros, para que los renglones
// pintados caigan justo), la separación entre letras en em y la fuente.
export function estiloLibreta(ajustes) {
    const tamano = AJUSTES_LIBRETA.tamano.opciones[ajustes.tamano].valor;
    return {
        tamano,
        alto: Math.round(tamano * AJUSTES_LIBRETA.separacion.opciones[ajustes.separacion].valor),
        letras: AJUSTES_LIBRETA.letras.opciones[ajustes.letras].valor,
        fuente: AJUSTES_LIBRETA.fuente.opciones[ajustes.fuente].valor,
    };
}
