// Ajustes de la libreta: tamaño de letra, separación entre renglones y entre letras, rimas internas y fuente.
// Se guardan en el almacén (localStorage en la web). Sin DOM.
// Tamaño y separaciones van en una barra de 10 puntos imantados: opciones '1' a '10'.
const diezPuntos = valores => Object.fromEntries(valores.map((valor, i) => [String(i + 1), { nombre: String(i + 1), valor }]));

export const AJUSTES_LIBRETA = {
    tamano: {
        nombre: 'Tamaño de letra',
        deslizador: true,
        porDefecto: '4',
        opciones: diezPuntos([13, 14, 15, 16, 17, 18, 19, 20, 22, 24]),
    },
    separacion: {
        nombre: 'Separación de renglones',
        deslizador: true,
        porDefecto: '4',
        opciones: diezPuntos([1.1, 1.2, 1.3, 1.35, 1.45, 1.55, 1.65, 1.75, 1.85, 2]),
    },
    // Separación horizontal entre letras (letter-spacing, en SwiftUI .tracking), en em.
    letras: {
        nombre: 'Separación de letras',
        deslizador: true,
        porDefecto: '5',
        opciones: diezPuntos([-0.05, -0.04, -0.03, -0.02, -0.01, 0, 0.02, 0.04, 0.06, 0.08]),
    },
    // Rimas internas: a cuántos versos se buscan las palabras del medio que riman.
    internas: {
        nombre: 'Rimas internas',
        etiqueta: 'Distancia',
        porDefecto: 'dos',
        opciones: { no: { nombre: 'No', valor: 0 }, dos: { nombre: '2 versos', valor: 2 }, cuatro: { nombre: '4 versos', valor: 4 }, ocho: { nombre: '8 versos', valor: 8 } },
    },
    // Fuentes que ya vienen en el iPhone (andan sin internet), con otras parecidas de respaldo.
    fuente: {
        nombre: 'Fuente',
        porDefecto: 'sistema',
        opciones: {
            sistema: { nombre: 'Sistema', valor: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif' },
            avenir: { nombre: 'Avenir', valor: '"Avenir Next", Avenir, "Century Gothic", "Trebuchet MS", sans-serif' },
            maquina: { nombre: 'Máquina', valor: '"American Typewriter", "Courier New", Courier, monospace' },
            mano: { nombre: 'A mano', valor: 'Noteworthy, "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive' },
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
        internas: AJUSTES_LIBRETA.internas.opciones[ajustes.internas].valor,
        fuente: AJUSTES_LIBRETA.fuente.opciones[ajustes.fuente].valor,
    };
}

// Compartir una letra con la hoja del sistema (Web Share API; en SwiftUI, ShareLink): el título
// va aparte y el texto es solo el cuerpo, así «Copiar» no se lleva el título (pedido de Swa).
export function datosParaCompartir(letra) {
    const titulo = (letra?.titulo || '').trim();
    const texto = (letra?.texto || '').trim();
    return titulo ? { title: titulo, text: texto } : { text: texto };
}
