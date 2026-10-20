// Modo freestyle: timer tipo batalla y beats con BPM. Sin DOM.
// TODO (paso 4 del plan): timer de rondas, beats con licencia anotada
// y la sílaba que cae en el tiempo fuerte del compás.

export function msPorTiempo(bpm) {
    return 60000 / bpm;
}
