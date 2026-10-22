// Suena el beat con Web Audio. El bombo, la caja y el hi-hat de Clásico se sintetizan
// acá mismo. Batería, Jazz, Seco y Grave son mp3 en beats/ (ver beats/CREDITS.md).
// Qué suena en cada paso del sintetizador lo decide js/logica/freestyle.js.
import { msPorPaso, sonidosDelPaso } from './logica/freestyle.js';

let contexto = null;
let ruido = null;
let temporizador = null;
let corrida = 0; // para ignorar avisos que quedaron de un beat anterior
let fuenteLoop = null;
const buffers = new Map();

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

function asegurarContexto() {
    contexto ??= new AudioContext();
    return contexto;
}

function cargarBuffer(url) {
    if (!buffers.has(url)) {
        const ctx = asegurarContexto();
        buffers.set(url, fetch(url).then(respuesta => {
            if (!respuesta.ok) throw new Error(String(respuesta.status));
            return respuesta.arrayBuffer();
        }).then(datos => ctx.decodeAudioData(datos)));
    }
    return buffers.get(url);
}

// Baja el mp3 apenas se muestra Freestyle, para que el play no espere la red.
export function precargarArchivo(url) {
    return cargarBuffer(url).catch(() => buffers.delete(url));
}

// Agenda los pasos un poco por adelantado. sonar(paso, cuando) toca y devuelve el bpm.
function agendarPasos(esta, inicio, sonar, alPaso) {
    let paso = 0;
    let proximo = inicio;
    const agendar = () => {
        if (esta !== corrida) return;
        while (proximo < contexto.currentTime + 0.1) {
            const bpm = sonar(paso, proximo);
            const estePaso = paso;
            setTimeout(() => esta === corrida && alPaso(estePaso), Math.max(0, (proximo - contexto.currentTime) * 1000));
            proximo += msPorPaso(bpm) / 1000;
            paso++;
        }
    };
    temporizador = setInterval(agendar, 25);
    agendar();
}

// Arranca el beat sintetizado. obtener() devuelve { beat, bpm } en cada paso.
// alPaso(paso) se llama cuando suena cada paso (para la pantalla).
export function iniciarBeat(obtener, alPaso) {
    detenerBeat();
    const ctx = asegurarContexto();
    ctx.resume();
    if (!ruido) {
        ruido = contexto.createBuffer(1, contexto.sampleRate, contexto.sampleRate);
        const datos = ruido.getChannelData(0);
        for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
    }
    const esta = corrida;
    agendarPasos(esta, ctx.currentTime + 0.05, (paso, cuando) => {
        const { beat, bpm } = obtener();
        for (const sonido of sonidosDelPaso(beat, paso)) tocar(sonido, cuando);
        return bpm;
    }, alPaso);
}

// El mp3 da vueltas. El largo es un número entero de compases, así el cierre
// cae en el tiempo 1 y la palabra (cada 2 compases) no se desfasa del loop.
export function iniciarArchivo(url, bpm, alPaso, alFallar) {
    detenerBeat();
    const ctx = asegurarContexto();
    ctx.resume();
    const esta = corrida;
    cargarBuffer(url).then(buffer => {
        if (esta !== corrida) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(ctx.destination);
        fuenteLoop = source;
        const cuando = ctx.currentTime + 0.05;
        source.start(cuando);
        agendarPasos(esta, cuando, () => bpm, alPaso);
    }).catch(() => {
        buffers.delete(url);
        if (esta === corrida) alFallar?.();
    });
}

export function detenerBeat() {
    clearInterval(temporizador);
    temporizador = null;
    if (fuenteLoop) {
        try { fuenteLoop.stop(); } catch { /* ya estaba parado */ }
        fuenteLoop.disconnect();
        fuenteLoop = null;
    }
    corrida++;
}
