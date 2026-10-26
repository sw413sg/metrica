// Grabaciones de Freestyle: la voz va aparte del beat, así el volumen del beat se elige
// después. Con un beat de la app se graba también lo que suena; con un archivo del
// teléfono se guarda el archivo y desde dónde sonaba; con YouTube o SoundCloud, solo
// el link y el segundo (su audio no se puede leer ni descargar).
// En SwiftUI: AVAudioEngine con voiceProcessing y AVAudioFile.

// Los volúmenes de la voz y del beat se eligen arriba de Grabaciones, para todas (0 a 10).
export const VOLUMENES_INICIALES = { voz: 10, beat: 5 };
const CLAVE_VOLUMEN = 'metrica.grabaciones.volumen-';

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

// Sincronizar la voz con el beat en cada grabación: de a 20 ms, hasta medio segundo para
// cada lado. Positivo es la voz más tarde.
export const PASO_SINCRONIA = 20;
export const SINCRONIA_MAXIMA = 500;
export function moverSincronia(ms, pasos) {
    return Math.max(-SINCRONIA_MAXIMA, Math.min(SINCRONIA_MAXIMA, (ms || 0) + pasos * PASO_SINCRONIA));
}
export const textoSincronia = ms => (ms > 0 ? `+${ms} ms` : `${ms || 0} ms`);

// Desde dónde suena la voz para escuchar desde el segundo pedido: se saltea lo que llegó
// tarde (el desfase) y se corre lo que diga la sincronía. Si queda antes del principio,
// la voz espera.
export function inicioDeVoz(desfase, sincroniaMs, desde) {
    const en = desfase - (sincroniaMs || 0) / 1000 + desde;
    return en >= 0 ? { espera: 0, desde: en } : { espera: -en, desde: 0 };
}

// Qué se guarda junto con la voz, según lo que suena al tocar REC.
export function tipoDeGrabacion({ link, acapella }) {
    if (link?.fuente === 'archivo') return 'archivo';
    if (link) return 'link';
    return acapella ? 'voz' : 'beat';
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

// «Boombap 1» y abajo «25/10 · 23:51 · 1:12 · YouTube».
export function describirGrabacion({ titulo, fecha, duracion, fuente }) {
    const f = new Date(fecha);
    const partes = [`${dos(f.getDate())}/${dos(f.getMonth() + 1)}`, `${dos(f.getHours())}:${dos(f.getMinutes())}`, minutos(duracion || 0)];
    if (FUENTES[fuente]) partes.push(FUENTES[fuente]);
    return { titulo: titulo || 'Freestyle', detalle: partes.join(' · ') };
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
