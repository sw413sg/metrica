// Suena el beat con Web Audio. El bombo, la caja y el hi-hat de Clásico se sintetizan
// acá mismo. Batería, Jazz, Seco y Grave son mp3 en beats/ (ver beats/CREDITS.md).
// Qué suena en cada paso del sintetizador lo decide js/logica/freestyle.js.
import { msPorPaso, sonidosDelPaso } from './logica/freestyle.js';
import { pasosDeBombo } from './logica/ambiente.js';

let contexto = null;
let salida = null; // todo lo que suena pasa por acá, para poder grabarlo
let ruido = null;
let temporizador = null;
let corrida = 0; // para ignorar avisos que quedaron de un beat anterior
let fuenteLoop = null;
const buffers = new Map();
const bombos = new Map(); // url -> Set de pasos del loop donde suena el kick

function tocar(sonido, cuando) {
    const volumen = contexto.createGain();
    volumen.connect(salida);
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
    if (!contexto) {
        contexto = new AudioContext();
        salida = contexto.createGain();
        salida.connect(contexto.destination);
    }
    return contexto;
}

// Lo que suena, para grabarlo aparte de la voz (en silencio mientras no hay beat), y
// cuánto tarda en salir por el parlante.
export function grabarBeat() {
    const ctx = asegurarContexto();
    const destino = ctx.createMediaStreamDestination();
    salida.connect(destino);
    return { flujo: destino.stream, latencia: { salida: ctx.outputLatency, base: ctx.baseLatency }, soltar: () => salida.disconnect(destino) };
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

// Agenda los pasos un poco por adelantado. sonar(paso, cuando) toca y devuelve
// { bpm, bombo }: bombo dice si en ese paso suena el kick (para las luces).
function agendarPasos(esta, inicio, sonar, alPaso) {
    let paso = 0;
    let proximo = inicio;
    const agendar = () => {
        if (esta !== corrida) return;
        while (proximo < contexto.currentTime + 0.1) {
            const { bpm, bombo } = sonar(paso, proximo);
            const estePaso = paso;
            setTimeout(() => esta === corrida && alPaso(estePaso, bombo), Math.max(0, (proximo - contexto.currentTime) * 1000));
            proximo += msPorPaso(bpm) / 1000;
            paso++;
        }
    };
    temporizador = setInterval(agendar, 25);
    agendar();
}

// Arranca el beat sintetizado. obtener() devuelve { beat, bpm } en cada paso.
// alPaso(paso, bombo) se llama cuando suena cada paso (para la pantalla).
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
        const sonidos = sonidosDelPaso(beat, paso);
        for (const sonido of sonidos) tocar(sonido, cuando);
        return { bpm, bombo: sonidos.includes('bombo') };
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
        source.connect(salida);
        fuenteLoop = source;
        const cuando = ctx.currentTime + 0.05;
        source.start(cuando);
        // Dónde caen los kicks del mp3: se calcula una vez por archivo.
        if (!bombos.has(url)) bombos.set(url, new Set(pasosDeBombo(buffer.getChannelData(0), buffer.sampleRate, bpm)));
        const kicks = bombos.get(url);
        const pasosLoop = Math.round(buffer.duration / (msPorPaso(bpm) / 1000));
        agendarPasos(esta, cuando, paso => ({ bpm, bombo: kicks.has(paso % pasosLoop) }), alPaso);
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
