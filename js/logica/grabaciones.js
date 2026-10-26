// Grabaciones de Freestyle: la voz va aparte del beat, así el volumen del beat se elige
// después. Con un beat de la app se graba también lo que suena; con un archivo del
// teléfono se guarda el archivo y desde dónde sonaba; con YouTube o SoundCloud, solo
// el link y el segundo (su audio no se puede leer ni descargar).
// En SwiftUI: AVAudioEngine con voiceProcessing y AVAudioFile.

// Los volúmenes de la voz y del beat se eligen arriba de Grabaciones, para todas (0 a 10).
export const VOLUMENES_INICIALES = { voz: 10, beat: 5 };
const CLAVE_VOLUMEN = 'metrica.grabaciones.volumen-';
// El micrófono elegido en Grabaciones (vacío: el que elija el teléfono).
export const CLAVE_MICROFONO = 'metrica.grabaciones.microfono';
export function pedidoMicrofono(deviceId) {
    const audio = { echoCancellation: true, noiseSuppression: false, autoGainControl: false };
    if (deviceId) audio.deviceId = { ideal: deviceId };
    return { audio };
}

export function leerVolumenes(almacen) {
    const leer = clave => {
        const valor = Number(almacen.getItem(CLAVE_VOLUMEN + clave));
        return almacen.getItem(CLAVE_VOLUMEN + clave) != null && valor >= 0 && valor <= 10 ? valor : VOLUMENES_INICIALES[clave];
    };
    return { voz: leer('voz'), beat: leer('beat') };
}

export function guardarVolumen(almacen, clave, valor) {
    almacen.setItem(CLAVE_VOLUMEN + clave, String(Math.max(0, Math.min(10, Math.round(Number(valor) || 0)))));
}

// Desde dónde suena la voz para escuchar desde el segundo pedido: se saltea lo que llegó
// tarde (el desfase, calculado solo). Si queda antes del principio, la voz espera.
export function inicioDeVoz(desfase, desde) {
    const en = desfase + desde;
    return en >= 0 ? { espera: 0, desde: en } : { espera: -en, desde: 0 };
}

// Desde qué segundo del tema arrancó la voz. Mientras se graba se anota cada medio segundo
// «segundo del tema − segundo de la grabación»: si el tema se traba un rato (al abrir el
// micrófono, el iPhone frena el video), esos valores se corren, pero la mediana se queda
// con el que vale mientras el tema anda.
export function inicioDeMuestras(muestras) {
    if (!muestras.length) return null;
    const orden = [...muestras].sort((a, b) => a - b);
    const medio = Math.floor(orden.length / 2);
    return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

// Qué se guarda junto con la voz, según lo que suena al tocar REC: el tema del reproductor
// (un archivo del teléfono, o YouTube o SoundCloud), un beat de la app o nada.
export function tipoDeGrabacion({ fuente, beat }) {
    if (fuente === 'archivo') return 'archivo';
    if (fuente) return 'link';
    return beat ? 'beat' : 'voz';
}

// Nombre de la grabación: la letra abierta al tocar REC y lo que sonaba, cortos
// («Checkpoint… - Boombap 1»). Fuera de una letra, «Freestyle N», con el número que sigue.
const corto = (texto, maximo = 14) => {
    texto = (texto || '').trim().replace(/\s+/g, ' ');
    return texto.length <= maximo ? texto : `${texto.slice(0, maximo).trim()}…`;
};
export function nombreDeGrabacion({ letra, beat, nombres = [] }) {
    let primero = corto(letra);
    if (letra != null && !primero) primero = 'Sin título';
    if (!primero) {
        const usados = nombres.map(n => Number(/^Freestyle (\d+)/.exec(n)?.[1]) || 0);
        primero = `Freestyle ${Math.max(0, ...usados) + 1}`;
    }
    return beat ? `${primero} - ${corto(beat)}` : primero;
}

// La voz llega tarde: lo que tarda el beat en salir por el parlante más lo que tarda el
// micrófono en entrar. Si el navegador no lo dice, se estima (unos 100 ms en el iPhone).
export function desfaseDeVoz({ salida, base, entrada } = {}) {
    const total = (salida || 0.06) + (base || 0) + (entrada || 0.03);
    return Math.round(total * 1000) / 1000;
}

const FUENTES = { youtube: 'YouTube', soundcloud: 'SoundCloud', archivo: 'Del teléfono' };
const dos = n => String(n).padStart(2, '0');
const minutos = segundos => `${Math.floor(segundos / 60)}:${dos(Math.floor(segundos % 60))}`;

// «Checkpoint… - Boombap 1» y abajo «25/10 · 23:51 · 1:12 · YouTube».
export function describirGrabacion({ nombre, titulo, fecha, duracion, fuente }) {
    const f = new Date(fecha);
    const partes = [`${dos(f.getDate())}/${dos(f.getMonth() + 1)}`, `${dos(f.getHours())}:${dos(f.getMinutes())}`, minutos(duracion || 0)];
    if (FUENTES[fuente]) partes.push(FUENTES[fuente]);
    return { titulo: nombre || titulo || 'Freestyle', detalle: partes.join(' · ') };
}

export function extensionDeAudio(tipo = '') {
    if (tipo.includes('wav')) return 'wav';
    if (tipo.includes('webm')) return 'webm';
    if (tipo.includes('ogg')) return 'ogg';
    return 'm4a';
}

export function nombreDeArchivo({ fecha }, extension) {
    const f = new Date(fecha);
    return `Métrica freestyle ${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())} ${dos(f.getHours())}-${dos(f.getMinutes())}.${extension}`;
}

// La mezcla para descargar, en WAV de 16 bits (lo abre cualquier teléfono).
export function codificarWav(canales, frecuencia) {
    const largo = canales[0]?.length ?? 0;
    const bytes = largo * canales.length * 2;
    const datos = new DataView(new ArrayBuffer(44 + bytes));
    const texto = (en, t) => [...t].forEach((c, i) => datos.setUint8(en + i, c.charCodeAt(0)));
    texto(0, 'RIFF');
    datos.setUint32(4, 36 + bytes, true);
    texto(8, 'WAVE');
    texto(12, 'fmt ');
    datos.setUint32(16, 16, true);
    datos.setUint16(20, 1, true);
    datos.setUint16(22, canales.length, true);
    datos.setUint32(24, frecuencia, true);
    datos.setUint32(28, frecuencia * canales.length * 2, true);
    datos.setUint16(32, canales.length * 2, true);
    datos.setUint16(34, 16, true);
    texto(36, 'data');
    datos.setUint32(40, bytes, true);
    let en = 44;
    for (let i = 0; i < largo; i++) {
        for (const canal of canales) {
            const muestra = Math.max(-1, Math.min(1, canal[i]));
            datos.setInt16(en, muestra < 0 ? muestra * 0x8000 : muestra * 0x7fff, true);
            en += 2;
        }
    }
    return datos.buffer;
}
