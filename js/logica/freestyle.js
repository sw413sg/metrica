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
