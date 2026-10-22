// Ambiente del aro de Freestyle: luces que laten con el beat y cambian según el mood.
// El mood sale del título del link (YouTube o SoundCloud) o del género del beat propio.
// Sin DOM: acá solo se decide qué mood, a qué BPM y cuánto brilla en cada momento.
// En SwiftUI: Canvas + TimelineView(.animation).

// Cada mood: colores, qué partículas vuelan y cuánto se mueven (1 = normal).
export const MOODS = {
    sad: { nombre: 'Sad', colores: ['#5b8def', '#8fb4ff', '#b7c8f5'], particulas: 'luciernagas', velocidad: 0.5 },
    rage: { nombre: 'Rage', colores: ['#ff3b30', '#ff7a1a', '#ffd23f'], particulas: 'rayos', velocidad: 1.8 },
    hyperpop: { nombre: 'Hyperpop', colores: ['#ff4fd8', '#3ff2ff', '#c6ff3f'], particulas: 'brillos', velocidad: 1.6 },
    boombap: { nombre: 'Boom bap', colores: ['#f2b25c', '#d98b3a', '#fff0c9'], particulas: 'polvo', velocidad: 0.7 },
    trap: { nombre: 'Trap', colores: ['#9b7bff', '#c86bff', '#6b5bff'], particulas: 'anillos', velocidad: 1.1 },
    drill: { nombre: 'Drill', colores: ['#7fd1ff', '#d9f2ff', '#4a7bd1'], particulas: 'rayos', velocidad: 1.3 },
    lofi: { nombre: 'Lo-fi', colores: ['#ffb38a', '#ffd6a5', '#c3a6ff'], particulas: 'luciernagas', velocidad: 0.4 },
    love: { nombre: 'Love', colores: ['#ff6f91', '#ff9ec4', '#ffc2d1'], particulas: 'luciernagas', velocidad: 0.6 },
    reggaeton: { nombre: 'Reggaetón', colores: ['#ffcf3f', '#ff7a59', '#3fe0b5'], particulas: 'brillos', velocidad: 1.2 },
    neutro: { nombre: 'Freestyle', colores: ['#9b7bff', '#c3b2ff', '#ffffff'], particulas: 'luciernagas', velocidad: 0.8 },
};

// Palabras del título que deciden el mood, en orden: gana la primera que aparece en esta
// lista (así «sad trap» es sad y «rage trap» es rage). Sin tildes y en minúscula.
const PISTAS = [
    ['hyperpop', ['hyperpop', 'hyper pop', 'glitchcore', 'digicore', 'pluggnb', 'jersey club', 'bubblegum']],
    ['rage', ['rage', 'hard', 'aggressive', 'agresivo', 'agresiva', 'angry', 'opium', 'metal', 'distorted', 'hardstyle', 'phonk']],
    ['sad', ['sad', 'triste', 'melancol', 'emotional', 'emocional', 'depre', 'cry', 'lonely', 'soledad', 'dolor', 'pain', 'heartbreak', 'rain', 'lluvia', 'piano', 'guitar']],
    ['drill', ['drill']],
    ['lofi', ['lofi', 'lo-fi', 'lo fi', 'chill', 'relax', 'study', 'jazzhop', 'jazz hop', 'chillhop']],
    ['love', ['love', 'amor', 'romantic', 'romantico', 'r&b', 'rnb', 'soul']],
    ['reggaeton', ['reggaeton', 'dembow', 'perreo', 'dancehall', 'afrobeat', 'cumbia', 'rkt']],
    ['boombap', ['boombap', 'boom bap', 'boom-bap', 'old school', 'oldschool', 'old-school', '90s', '90\'s', 'jazz', 'golden era', 'underground', 'vinyl', 'dusty', 'sample']],
    ['trap', ['trap', 'dark', 'oscuro', 'type beat', '808']],
];

// «TenchnoSad_88bpm» -> «tenchno sad 88bpm»: se separan las palabras pegadas en camelCase.
function normalizar(texto) {
    return String(texto ?? '').replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_]+/g, ' ');
}

// Busca la pista como palabra o comienzo de palabra: «hard» no salta con «richard».
function aparece(texto, pista) {
    const escapada = pista.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escapada}`).test(texto);
}

// "TenchnoSad_88bpm" -> 'sad'. Sin pistas, 'neutro'.
export function moodDeTitulo(titulo) {
    const texto = normalizar(titulo);
    return PISTAS.find(([, pistas]) => pistas.some(p => aparece(texto, p)))?.[0] ?? 'neutro';
}

// Los beats propios ya dicen su género.
export function moodDeBeat(beat) {
    const genero = normalizar(beat?.genero);
    if (genero.includes('boom')) return 'boombap';
    if (genero.includes('trap')) return 'trap';
    return 'neutro';
}

// "Beat 140 BPM", "88bpm" -> 140, 88. null si el título no lo dice o es raro.
export function bpmDeTitulo(titulo) {
    const numero = Number(normalizar(titulo).match(/(\d{2,3})\s*bpm/)?.[1]);
    return numero >= 50 && numero <= 220 ? numero : null;
}

// Cantidad de efectos, de 0 (apagados) a 10 (todos). Se elige en Ajustes > Freestyle.
const CLAVE_EFECTOS = 'metrica.efectos';
export const EFECTOS_MAXIMO = 10;

export function leerCantidadEfectos(almacen) {
    const guardada = almacen.getItem(CLAVE_EFECTOS);
    const numero = Number(guardada);
    return guardada !== null && Number.isInteger(numero) && numero >= 0 && numero <= EFECTOS_MAXIMO ? numero : EFECTOS_MAXIMO;
}

export function guardarCantidadEfectos(almacen, cantidad) {
    const numero = Math.round(Math.min(EFECTOS_MAXIMO, Math.max(0, Number(cantidad) || 0)));
    almacen.setItem(CLAVE_EFECTOS, String(numero));
    return numero;
}

// En qué pasos (semicorcheas, desde 0) de un loop suena el bombo, leyendo el audio:
// se queda con los graves (filtro de un polo a ~120 Hz), mide la energía cada 5 ms y
// marca donde sube de golpe. Así las luces laten en el kick de verdad y no en cada tiempo.
// `muestras` es un canal (Float32Array), `frecuencia` las muestras por segundo.
const UMBRAL_BOMBO = 0.2;
export function pasosDeBombo(muestras, frecuencia, bpm) {
    if (!muestras?.length || !(frecuencia > 0) || !(bpm > 0)) return [];
    const a = Math.exp(-2 * Math.PI * 120 / frecuencia);
    const ventana = Math.max(1, Math.round(frecuencia * 0.005));
    const energias = [];
    let grave = 0, masGrave = 0, suma = 0;
    for (let i = 0; i < muestras.length; i++) {
        // Dos filtros seguidos: corta más los medios (voz, caja) que uno solo.
        grave = (1 - a) * muestras[i] + a * grave;
        masGrave = (1 - a) * grave + a * masGrave;
        suma += masGrave * masGrave;
        if ((i + 1) % ventana === 0) { energias.push(suma); suma = 0; }
    }
    // Cuánto sube la energía de una ventana a la otra: el golpe del kick es una subida fuerte.
    const subidas = energias.map((e, i) => i ? Math.max(0, e - energias[i - 1]) : 0);
    const maximo = Math.max(...subidas);
    if (!(maximo > 0)) return [];
    const segundosPorPaso = 60 / bpm / 4;
    const totalPasos = Math.max(1, Math.round(muestras.length / frecuencia / segundosPorPaso));
    const pasos = new Set();
    let ultimo = -Infinity;
    for (let i = 1; i < subidas.length - 1; i++) {
        const t = i * ventana / frecuencia;
        const pico = subidas[i] >= subidas[i - 1] && subidas[i] >= subidas[i + 1];
        if (!pico || subidas[i] < maximo * UMBRAL_BOMBO || t - ultimo < 0.18) continue;
        ultimo = t;
        pasos.add(Math.round(t / segundosPorPaso) % totalPasos);
    }
    // Si casi no encontró (un 808 que tapa el kick), al menos late en el 1 de cada compás.
    if (pasos.size < totalPasos / 16) for (let p = 0; p < totalPasos; p += 16) pasos.add(p);
    return [...pasos].sort((x, y) => x - y);
}

// Tiempos (negras) que pasaron desde el principio del tema, con decimales.
export function tiemposEn(segundos, bpm) {
    if (!(bpm > 0) || !(segundos >= 0)) return 0;
    return segundos * bpm / 60;
}

// Cuánto brilla un golpe a medida que pasa (de 1 recién dado a casi 0). `ms` desde el golpe.
export function brilloDeGolpe(ms, bpm) {
    if (!(ms >= 0)) return 0;
    const largo = 60000 / (bpm > 0 ? bpm : 90);
    return Math.exp(-4 * ms / largo);
}
