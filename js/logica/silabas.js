// Sílabas y métrica. Sin DOM.
// Los núcleos vocálicos (diptongos, hiatos, u muda) y el acento salen de rimas.js.
import { analizarPalabra } from './rimas.js';

// Grupos de dos consonantes que no se separan: van juntos a la sílaba siguiente.
const INSEPARABLES = new Set(['pr', 'pl', 'br', 'bl', 'fr', 'fl', 'tr', 'dr', 'cr', 'cl', 'gr', 'gl', 'kr', 'kl',
    'ch', 'll', 'rr', 'qu', 'gu']);

// "cuidado" -> ["cui", "da", "do"]. Lista vacía si no es una palabra.
export function separarSilabas(palabra) {
    const a = analizarPalabra(palabra);
    if (!a) return [];
    const { palabra: p, nucleos } = a;
    const silabas = [];
    let inicio = 0;
    for (let n = 0; n < nucleos.length - 1; n++) {
        const finNucleo = nucleos[n][nucleos[n].length - 1] + 1;
        const consonantes = p.slice(finNucleo, nucleos[n + 1][0]);
        // A la sílaba siguiente va la última consonante, o las dos últimas si no se separan.
        const pasan = consonantes.length >= 2 && INSEPARABLES.has(consonantes.slice(-2)) ? 2 : Math.min(1, consonantes.length);
        const corte = nucleos[n + 1][0] - pasan;
        silabas.push(p.slice(inicio, corte));
        inicio = corte;
    }
    silabas.push(p.slice(inicio));
    return silabas;
}

const VOCAL_INICIAL = /^h?[aeiouáéíóúü]/;
const VOCAL_FINAL = /[aeiouáéíóúü]$/;

// Sílabas métricas de un verso: suma las de cada palabra, une con sinalefa la vocal
// final de una palabra con la inicial de la siguiente ("no hay" = "noay"), y ajusta
// por la última palabra: aguda +1, grave igual, esdrújula -1.
// Devuelve 0 si el verso no tiene palabras.
export function contarSilabasVerso(verso) {
    const palabras = (String(verso).toLowerCase().normalize('NFC').match(/\p{L}+/gu) ?? [])
        .map(texto => ({ texto, analisis: analizarPalabra(texto) }))
        // "y" sola es una vocal (conjunción); otras palabras sin vocales no suenan.
        .filter(({ texto, analisis }) => analisis || texto === 'y');
    if (!palabras.length) return 0;

    let total = 0;
    palabras.forEach(({ texto, analisis }, i) => {
        total += analisis ? analisis.nucleos.length : 1;
        const anterior = palabras[i - 1]?.texto;
        const terminaEnVocal = anterior && (VOCAL_FINAL.test(anterior) || anterior === 'y');
        if (terminaEnVocal && (VOCAL_INICIAL.test(texto) || texto === 'y')) total -= 1;
    });

    const ultima = palabras[palabras.length - 1].analisis;
    const despuesDeLaTonica = ultima ? ultima.nucleos.length - 1 - ultima.tonico : 0;
    if (despuesDeLaTonica === 0) total += 1;
    else if (despuesDeLaTonica >= 2) total -= 1;
    return total;
}
