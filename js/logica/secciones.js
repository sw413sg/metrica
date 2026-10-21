// Separadores de la letra: un renglón como "[Estribillo]" marca dónde empieza cada parte.
// No cuentan sílabas ni riman.
export const SECCIONES = ['Intro', 'Estribillo', 'Hook', 'Verso', 'Final'];

export function separador(seccion) {
    return `[${seccion}]`;
}

export function esSeparador(verso) {
    return /^\s*\[[^\]\n]+\]\s*$/.test(verso);
}
