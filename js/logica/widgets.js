// Widgets: los del inicio, los de la pantalla bloqueada y la acción rápida (Centro de control y
// Botón de acción). Por ahora se configuran y se ven de muestra en Ajustes > Widgets; en la app
// nativa van con WidgetKit, y los toques con App Intents. Sin DOM: el almacenamiento se pasa como
// parámetro, como en baul.js.

const CLAVE_WIDGETS = 'metrica.widgets';

// El baúl va primero: es el que lleva a anotar las frases que se le ocurren a uno durante el día.
// tamanos: los que tiene, el primero es con el que arranca. disenos: los que se pasan deslizando el
// widget (el primero es el de entrada). opciones: lo que se ajusta de cada uno, con su valor de entrada.
export const WIDGETS = [
    {
        id: 'baul', nombre: 'Baúl de frases', tamanos: ['chico', 'mediano', 'grande'],
        disenos: [{ id: 'lista', nombre: 'Lista' }, { id: 'frase', nombre: 'Frase' }, { id: 'libreta', nombre: 'Libreta' }, { id: 'anotar', nombre: 'Anotar' }],
        opciones: { mostrarFrases: true, soloSinUsar: false },
    },
    {
        id: 'palabra', nombre: 'Palabra del día', tamanos: ['chico', 'mediano'],
        disenos: [{ id: 'clasico', nombre: 'Clásico' }, { id: 'grande', nombre: 'Grande' }, { id: 'silabas', nombre: 'Sílabas' }, { id: 'rimas', nombre: 'Rimas' }],
        opciones: { tipoRima: 'consonante' },
    },
    {
        id: 'letra', nombre: 'Seguí escribiendo', tamanos: ['chico', 'mediano', 'grande'],
        disenos: [{ id: 'renglones', nombre: 'Renglones' }, { id: 'titulo', nombre: 'Título' }, { id: 'verso', nombre: 'Último verso' }],
        opciones: { letra: 'ultima' },
    },
    {
        id: 'racha', nombre: 'Racha', tamanos: ['chico', 'mediano'],
        disenos: [{ id: 'numero', nombre: 'Número' }, { id: 'llama', nombre: 'Llama' }, { id: 'semana', nombre: 'Semana' }],
        opciones: {},
    },
    {
        id: 'accesos', nombre: 'Accesos rápidos', tamanos: ['mediano', 'chico'],
        disenos: [{ id: 'cuadricula', nombre: 'Cuadrícula' }, { id: 'lista', nombre: 'Lista' }, { id: 'anotar', nombre: 'Anotar grande' }],
        opciones: {},
    },
];

// Tamaños de iOS, en celdas de íconos: chico (2×2), mediano (4×2) y grande (4×4).
export const TAMANOS = [
    { id: 'chico', nombre: 'Chico', columnas: 2, filas: 2 },
    { id: 'mediano', nombre: 'Mediano', columnas: 4, filas: 2 },
    { id: 'grande', nombre: 'Grande', columnas: 4, filas: 4 },
];

export const ESTILOS = [
    { id: 'vidrio', nombre: 'Vidrio' },
    { id: 'oscuro', nombre: 'Oscuro' },
    { id: 'claro', nombre: 'Claro' },
    { id: 'violeta', nombre: 'Violeta' },
];

// La foto de fondo (estilo «foto»): qué parte se ve (x e y, en %), el zoom y cuánto se oscurece para
// que se lea el texto. Queda solo en el teléfono (en la app nativa, en el App Group con los widgets).
export const FOTO_CENTRADA = { x: 50, y: 50, z: 1, oscuro: 0.25 };
const LIMITES_FOTO = { x: [0, 100], y: [0, 100], z: [1, 3], oscuro: [0, 0.6] };

// Lo que abre un toque: en el inicio, en la pantalla bloqueada, en el Centro de control y en el
// Botón de acción.
export const ACCIONES = [
    { id: 'anotar', nombre: 'Anotar una frase' },
    { id: 'nueva-letra', nombre: 'Nueva letra' },
    { id: 'rimas', nombre: 'Buscar rimas' },
    { id: 'freestyle', nombre: 'Arrancar freestyle' },
    { id: 'grabar', nombre: 'Grabar una idea' },
];

// Pantalla bloqueada: el redondo, el rectangular y la línea de arriba de la hora.
export const BLOQUEO = {
    redondo: [
        { id: 'anotar', nombre: 'Anotar' },
        { id: 'racha', nombre: 'Racha' },
        { id: 'freestyle', nombre: 'Freestyle' },
        { id: 'grabar', nombre: 'Grabar' },
    ],
    rectangular: [
        { id: 'baul', nombre: 'Última frase' },
        { id: 'palabra', nombre: 'Palabra del día' },
        { id: 'letra', nombre: 'Última letra' },
    ],
    linea: [
        { id: 'racha', nombre: 'Racha' },
        { id: 'palabra', nombre: 'Palabra del día' },
        { id: 'ninguna', nombre: 'Nada' },
    ],
};

const INICIAL = { estilo: 'vidrio' };
const BLOQUEO_INICIAL = { redondo: 'anotar', rectangular: 'baul', linea: 'racha', accion: 'anotar' };

// Cuántas frases entran en cada tamaño (el chico muestra la última, o el cofre si no se muestran).
const FRASES_POR_TAMANO = { chico: 1, mediano: 2, grande: 5 };
// Cuántos renglones de la letra entran en cada tamaño.
const RENGLONES_POR_TAMANO = { chico: 3, mediano: 3, grande: 11 };

function leer(almacen) {
    try {
        const valor = JSON.parse(almacen.getItem(CLAVE_WIDGETS));
        return valor && typeof valor === 'object' ? valor : {};
    } catch {
        return {};
    }
}

function escribir(almacen, id, cambios) {
    const todos = leer(almacen);
    todos[id] = { ...todos[id], ...cambios };
    almacen.setItem(CLAVE_WIDGETS, JSON.stringify(todos));
}

// Los ajustes de un widget, con lo que falta (o ya no vale) en sus valores de entrada.
export function ajustesWidget(almacen, id) {
    const widget = WIDGETS.find(w => w.id === id) ?? WIDGETS[0];
    const ajustes = { ...INICIAL, tamano: widget.tamanos[0], diseno: widget.disenos[0].id, ...widget.opciones, ...leer(almacen)[widget.id] };
    if (!widget.tamanos.includes(ajustes.tamano)) ajustes.tamano = widget.tamanos[0];
    if (!widget.disenos.some(d => d.id === ajustes.diseno)) ajustes.diseno = widget.disenos[0].id;
    const conFoto = ajustes.estilo === 'foto' && typeof ajustes.foto?.src === 'string';
    if (!conFoto && !ESTILOS.some(e => e.id === ajustes.estilo)) ajustes.estilo = INICIAL.estilo;
    return ajustes;
}

// Cambia uno o más ajustes de un widget y devuelve cómo quedó.
export function guardarAjusteWidget(almacen, id, cambios) {
    escribir(almacen, id, cambios);
    return ajustesWidget(almacen, id);
}

// Estirar el widget desde su esquina: el tamaño que tiene más cerca de lo estirado (en celdas de
// íconos). Si no tiene otro, se queda en el que está.
export function tamanoAlEstirar(tamanos, columnas, filas) {
    const distancia = t => (t.columnas - columnas) ** 2 + (t.filas - filas) ** 2;
    return TAMANOS.filter(t => tamanos.includes(t.id)).sort((a, b) => distancia(a) - distancia(b))[0]?.id ?? tamanos[0];
}

// Un toque en la esquina: el que sigue, y después del más grande vuelve al más chico.
export function siguienteTamano(tamanos, actual) {
    const orden = TAMANOS.map(t => t.id).filter(id => tamanos.includes(id));
    return orden[(orden.indexOf(actual) + 1) % orden.length];
}

// Mover, acercar u oscurecer la foto sin pasarse de los bordes.
export function ajustarFoto(foto, cambios = {}) {
    const nueva = { ...FOTO_CENTRADA, ...foto, ...cambios };
    for (const [clave, [min, max]] of Object.entries(LIMITES_FOTO)) {
        const valor = Number(nueva[clave]);
        nueva[clave] = Number.isFinite(valor) ? Math.min(max, Math.max(min, valor)) : FOTO_CENTRADA[clave];
    }
    return nueva;
}

// Lo elegido para la pantalla bloqueada y la acción rápida.
export function ajustesBloqueo(almacen) {
    const ajustes = { ...BLOQUEO_INICIAL, ...leer(almacen).bloqueo };
    for (const lugar of Object.keys(BLOQUEO)) {
        if (!BLOQUEO[lugar].some(o => o.id === ajustes[lugar])) ajustes[lugar] = BLOQUEO_INICIAL[lugar];
    }
    if (!ACCIONES.some(a => a.id === ajustes.accion)) ajustes.accion = BLOQUEO_INICIAL.accion;
    return ajustes;
}

export function guardarAjusteBloqueo(almacen, cambios) {
    escribir(almacen, 'bloqueo', cambios);
    return ajustesBloqueo(almacen);
}

// Las frases que muestra el widget del baúl, de la última anotada a la primera.
export function frasesDelWidget(frases, { tamano = 'chico', mostrarFrases = true, soloSinUsar = false } = {}) {
    if (!mostrarFrases) return [];
    return frases
        .filter(f => !soloSinUsar || !f.usada)
        .sort((a, b) => b.creada - a.creada)
        .slice(0, FRASES_POR_TAMANO[tamano] ?? 1)
        .map(f => f.texto);
}

// La letra del widget «Seguí escribiendo»: la última editada o la elegida (si se borró, la última).
// Devuelve el título, los primeros renglones con texto y el último (donde quedó), sin las marcas de parte ([Estribillo]).
export function letraDelWidget(letras, { letra = 'ultima', tamano = 'chico' } = {}) {
    const elegida = letras.find(l => l.id === letra) ?? [...letras].sort((a, b) => b.editada - a.editada)[0];
    if (!elegida) return null;
    const renglones = (elegida.texto ?? '').split('\n').map(r => r.trim()).filter(r => r && !/^\[.*\]$/.test(r));
    return {
        id: elegida.id,
        titulo: elegida.titulo?.trim() || 'Sin título',
        renglones: renglones.slice(0, RENGLONES_POR_TAMANO[tamano] ?? 3),
        ultimo: renglones.at(-1) ?? '',
        versos: renglones.length,
    };
}

// El día como número, a la hora del teléfono: cambia a la medianoche, no en UTC.
const dia = fecha => {
    const d = new Date(fecha);
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
};

// Uno de la lista por día: el mismo todo el día y otro al siguiente. Saltando de a un primo, días
// seguidos no traen vecinos del archivo (que se parecen).
const delDia = (lista, ahora, salto) => (lista.length ? lista[(dia(ahora) * salto) % lista.length] : null);

export function palabraDelDia(palabras, ahora = Date.now()) {
    return delDia(palabras, ahora, 104729);
}

// Días seguidos escribiendo (una frase anotada o una letra editada), hasta hoy. Si hoy todavía no
// se escribió, la racha de ayer sigue en pie: «Seguí hoy».
export function racha(fechas, ahora = Date.now()) {
    const dias = new Set(fechas.filter(Number.isFinite).map(dia));
    const hoy = dia(ahora);
    const escribioHoy = dias.has(hoy);
    const desde = escribioHoy ? hoy : hoy - 1;
    let seguidos = 0;
    while (dias.has(desde - seguidos)) seguidos++;
    return { dias: seguidos, escribioHoy };
}

// La semana de la racha: los últimos 7 días hasta hoy, con su inicial y si se escribió.
const INICIALES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export function ultimaSemana(fechas, ahora = Date.now()) {
    const dias = new Set(fechas.filter(Number.isFinite).map(dia));
    const hoy = dia(ahora);
    return Array.from({ length: 7 }, (_, i) => {
        const d = hoy - 6 + i;
        // El día 0 (1/1/1970) fue jueves.
        return { inicial: INICIALES[(d + 4) % 7], escribio: dias.has(d), hoy: d === hoy };
    });
}
