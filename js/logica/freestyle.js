// Modo freestyle: beats con BPM, la sílaba que cae en el tiempo fuerte y el timer
// de la ronda tipo batalla. Sin DOM ni audio: acá solo se decide qué suena y cuándo.
import { analizarPalabra } from './rimas.js';
import { separarSilabas } from './silabas.js';

// Un compás de 4/4 dividido en 16 pasos (semicorcheas). 1 = suena, 0 = silencio.
// Patrones propios de Métrica, escritos para la app (ver beats/LICENCIA.md).
export const BEATS = {
    'boom-bap': {
        nombre: 'Boom bap',
        bombo: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
        caja:  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    },
    trap: {
        nombre: 'Trap',
        bombo: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
        caja:  [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        hihat: [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    metronomo: {
        nombre: 'Metrónomo',
        bombo: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        caja:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        hihat: [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    },
};

export const PASOS_POR_COMPAS = 16;

export function msPorTiempo(bpm) {
    return 60000 / bpm;
}

// Cuánto dura cada palabra: `compases` compases de 4 tiempos. La barrita de abajo de la
// palabra se vacía en este tiempo.
export function msPorPalabra(bpm, compases) {
    return msPorTiempo(bpm) * 4 * compases;
}

// Cada paso es un cuarto de tiempo.
export function msPorPaso(bpm) {
    return msPorTiempo(bpm) / 4;
}

// Qué suena en el paso número `paso` (cuenta desde 0 y sigue de largo).
export function sonidosDelPaso(beat, paso) {
    const i = paso % PASOS_POR_COMPAS;
    return ['bombo', 'caja', 'hihat'].filter(sonido => beat[sonido][i]);
}

// Tiempo del compás (1 a 4) en el que cae el paso.
export function tiempoDelPaso(paso) {
    return Math.floor((paso % PASOS_POR_COMPAS) / 4) + 1;
}

// La palabra cambia al principio de cada bloque de `compases` compases.
export function cambiaLaPalabra(paso, compases) {
    return paso % (PASOS_POR_COMPAS * compases) === 0;
}

// Una ronda del aro son 8 compases: el aro se carga y los puntitos se van llenando.
export const COMPASES_POR_RONDA = 8;

// Dónde va el aro. `paso` cuenta desde 0 y sigue de largo.
// El compás 5 de la ronda 3 (paso 320) -> { compas: 5, de: 8, ronda: 3, avance: 0.5 }.
export function estadoCompas(paso, compases = COMPASES_POR_RONDA) {
    const indice = Math.floor(paso / PASOS_POR_COMPAS);
    const compas = (indice % compases) + 1;
    const fraccion = (paso % PASOS_POR_COMPAS) / PASOS_POR_COMPAS;
    return {
        compas,
        de: compases,
        ronda: Math.floor(indice / compases) + 1,
        avance: (compas - 1 + fraccion) / compases,
    };
}

// Cola de freestyle: la primera es la de ahora, la segunda «después» y la tercera «y luego».
export function proximasPalabras(cola) {
    return { ahora: cola[0] ?? null, despues: cola[1] ?? null, luego: cola[2] ?? null };
}

// Corre la cola cuando cambia la palabra y deja la nueva al final.
export function avanzarPalabras(cola, nueva) {
    return [...cola.slice(1), nueva];
}

// Sílabas de la palabra y cuál es la tónica: la que hay que hacer caer en el tiempo fuerte.
// "canción" -> { silabas: ['can', 'ción'], tonica: 1 }. null si no es una palabra.
export function silabaFuerte(palabra) {
    const analisis = analizarPalabra(palabra);
    return analisis && { silabas: separarSilabas(palabra), tonica: analisis.tonico };
}

// Segundos que le quedan a la ronda (nunca menos de 0).
export function segundosRestantes(inicioMs, ahoraMs, duracionSegundos) {
    return Math.max(0, Math.ceil(duracionSegundos - (ahoraMs - inicioMs) / 1000));
}

// "1:05"
export function formatoReloj(segundos) {
    return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}

// Duración de la ronda. Ilimitado es de Métrica Extras: sin el pago no se elige.
// En la web el pago es el simulado de compra.js; no hay StoreKit.
export const DURACIONES = [
    { id: '60', etiqueta: '1 min', segundos: 60 },
    { id: '90', etiqueta: '1:30', segundos: 90 },
    { id: '120', etiqueta: '2 min', segundos: 120 },
    { id: 'ilimitado', etiqueta: 'Ilimitado', segundos: null, premium: true },
];

export const DURACION_INICIAL = '60';

// null si no existe o si es ilimitado y no hay Extras.
export function elegirDuracion(id, tieneExtras) {
    const duracion = DURACIONES.find(d => d.id === id);
    if (!duracion || (duracion.premium && !tieneExtras)) return null;
    return duracion;
}

// Lo que muestra el aro: los segundos que quedan y cuánto se llenó (0 al empezar, 1 al terminar).
// Ilimitado no se acaba: el aro no se llena y no se muestra tiempo.
export function estadoRonda(inicioMs, ahoraMs, duracionSegundos) {
    if (duracionSegundos == null) return { restantes: null, avance: 0, texto: '' };
    const transcurrido = Math.max(0, (ahoraMs - inicioMs) / 1000);
    const restantes = Math.max(0, Math.ceil(duracionSegundos - transcurrido));
    const avance = duracionSegundos > 0 ? Math.min(1, transcurrido / duracionSegundos) : 0;
    return { restantes, avance, texto: formatoReloj(restantes) };
}

// Beats para elegir cuando no hay link: 2 géneros × 3, en el orden en que se ofrecen
// (pedido de Swa): Boombap 1 (Batería), Trap 1 (Seco), Boombap 2 (Jazz) y después el resto.
// Los «Clásico» son el sintetizador de BEATS. Los otros cuatro son mp3 en beats/,
// con licencia CC0 (ver beats/CREDITS.md). `compases` es el largo del loop:
// un número entero, para que al repetir siga cayendo en el tiempo 1.
export const CATALOGO_BEATS = [
    { id: 'boom-bap-bateria', genero: 'Boombap', nombre: 'Boombap 1', archivo: 'beats/boom-bap-bateria.mp3', bpm: 90, compases: 8 },
    { id: 'trap-seco', genero: 'Trap', nombre: 'Trap 1', archivo: 'beats/trap-seco.mp3', bpm: 140, compases: 4 },
    { id: 'boom-bap-jazz', genero: 'Boombap', nombre: 'Boombap 2', archivo: 'beats/boom-bap-jazz.mp3', bpm: 93, compases: 2 },
    { id: 'boom-bap-clasico', genero: 'Boombap', nombre: 'Boombap 3', patron: 'boom-bap' },
    { id: 'trap-grave', genero: 'Trap', nombre: 'Trap 2', archivo: 'beats/trap-grave.mp3', bpm: 140, compases: 8 },
    { id: 'trap-clasico', genero: 'Trap', nombre: 'Trap 3', patron: 'trap' },
];

// Un botón por género, en el orden del catálogo.
export const GENEROS_BEAT = [...new Set(CATALOGO_BEATS.map(b => b.genero))];

export function beatsDeGenero(genero) {
    return CATALOGO_BEATS.filter(b => b.genero === genero);
}

// Deslizar el botón de un género: el beat de al lado en ese género (-1 o +1),
// sin dar la vuelta. Si no hay más, queda el mismo.
export function beatVecino(id, paso) {
    const beat = CATALOGO_BEATS.find(b => b.id === id);
    if (!beat) return CATALOGO_BEATS[0].id;
    const lista = beatsDeGenero(beat.genero);
    const i = Math.min(lista.length - 1, Math.max(0, lista.indexOf(beat) + Math.sign(paso)));
    return lista[i].id;
}

export function etiquetaBeat(beat) {
    return beat.nombre;
}

// El patrón sintetizado, o null si ese beat es un mp3 (o no existe).
export function patronDeBeat(id) {
    const beat = CATALOGO_BEATS.find(b => b.id === id);
    return beat?.patron ? BEATS[beat.patron] ?? null : null;
}

// El mp3 que hay que loopear, o null si ese beat es sintetizado (o no existe).
export function archivoDeBeat(id) {
    const beat = CATALOGO_BEATS.find(b => b.id === id);
    if (!beat?.archivo) return null;
    return { archivo: beat.archivo, bpm: beat.bpm, compases: beat.compases };
}

// Segundos de un loop de `compases` compases de 4/4. El mp3 dura exactamente esto,
// así el cierre coincide con el reloj de las palabras.
export function segundosDeLoop(bpm, compases) {
    return compases * 4 * (60 / bpm);
}

// Un link pega y reemplaza al beat. Sin link, el beat elegido (o el primero).
export function fuenteFreestyle({ beatId, link } = {}) {
    if (link) return { tipo: 'link', link, beat: null };
    const beat = CATALOGO_BEATS.find(b => b.id === beatId) ?? CATALOGO_BEATS[0];
    return { tipo: 'beat', link: null, beat };
}

// Con un link hay un solo play: el del reproductor. La bandeja no muestra el suyo.
export function playEnBandeja(fuente) {
    return fuente.tipo === 'beat';
}
