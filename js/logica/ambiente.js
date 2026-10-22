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
