// Suena el beat con Web Audio. El bombo, la caja y el hi-hat se sintetizan acá mismo,
// sin archivos de audio (ver beats/LICENCIA.md). Qué suena en cada paso lo decide
// js/logica/freestyle.js; esto solo lo toca a tiempo.
import { msPorPaso, sonidosDelPaso } from './logica/freestyle.js';

let contexto = null;
let ruido = null;
let temporizador = null;
let corrida = 0; // para ignorar avisos que quedaron de un beat anterior

function tocar(sonido, cuando) {
    const volumen = contexto.createGain();
    volumen.connect(contexto.destination);
    if (sonido === 'bombo') {
        const osc = contexto.createOscillator();
        osc.frequency.setValueAtTime(150, cuando);
        osc.frequency.exponentialRampToValueAtTime(40, cuando + 0.12);
        volumen.gain.setValueAtTime(1, cuando);
        volumen.gain.exponentialRampToValueAtTime(0.001, cuando + 0.35);
        osc.connect(volumen);
        osc.start(cuando);
        osc.stop(cuando + 0.35);
        return;
    }
    // Caja y hi-hat: ruido blanco filtrado.
    const fuente = contexto.createBufferSource();
    fuente.buffer = ruido;
    const filtro = contexto.createBiquadFilter();
    filtro.type = 'highpass';
    filtro.frequency.value = sonido === 'caja' ? 1200 : 7000;
    const dura = sonido === 'caja' ? 0.16 : 0.05;
    volumen.gain.setValueAtTime(sonido === 'caja' ? 0.7 : 0.25, cuando);
    volumen.gain.exponentialRampToValueAtTime(0.001, cuando + dura);
    fuente.connect(filtro).connect(volumen);
    fuente.start(cuando);
    fuente.stop(cuando + dura);
}

// Arranca el beat. obtener() devuelve { beat, bpm } en cada paso, así se pueden
// cambiar en vivo. alPaso(paso) se llama cuando suena cada paso (para la pantalla).
export function iniciarBeat(obtener, alPaso) {
    detenerBeat();
    contexto ??= new AudioContext();
    contexto.resume();
    if (!ruido) {
        ruido = contexto.createBuffer(1, contexto.sampleRate, contexto.sampleRate);
        const datos = ruido.getChannelData(0);
        for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
    }
    const esta = corrida;
    let paso = 0;
    let proximo = contexto.currentTime + 0.05;
    // Se agenda un poco por adelantado para que el ritmo no dependa de los timers.
    const agendar = () => {
        while (proximo < contexto.currentTime + 0.1) {
            const { beat, bpm } = obtener();
            for (const sonido of sonidosDelPaso(beat, paso)) tocar(sonido, proximo);
            const estePaso = paso;
            setTimeout(() => esta === corrida && alPaso(estePaso), Math.max(0, (proximo - contexto.currentTime) * 1000));
            proximo += msPorPaso(bpm) / 1000;
            paso++;
        }
    };
    temporizador = setInterval(agendar, 25);
    agendar();
}

export function detenerBeat() {
    clearInterval(temporizador);
    temporizador = null;
    corrida++;
}
