// Sílabas y métrica. Sin DOM.
// Los núcleos vocálicos (diptongos, hiatos, u muda) y el acento salen de rimas.js.
import { analizarPalabra, vocalPrincipal } from './rimas.js';

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

// Dónde empieza la sílaba tónica: desde ahí se pinta la rima ("can|ción" -> 3, "ra|zón" -> 2).
// -1 si no es una palabra.
export function inicioTonica(palabra) {
    const a = analizarPalabra(palabra);
    if (!a) return -1;
    return separarSilabas(palabra).slice(0, a.tonico).join('').length;
}

// Rimas multisilábicas: además de rimar desde la tónica, coinciden las vocales de las sílabas
// de antes, aunque sean de otras palabras ("se pasa vo-lan-do" / "un tune so-nan-do": o-a-o).
// versos: las palabras de cada verso; grupos: el grupo de rima de cada verso (de agruparRimas).
// Devuelve, para cada verso, desde qué letra pintar cada palabra ([null, 0, 0]: la segunda
// y la tercera enteras), o [] si rima con una sola sílaba. Se miran hasta 3 sílabas de más,
// y solo contra versos cercanos (a menos de `distancia`), para no pintar de más en letras largas.
export function rimasMultisilabicas(versos, grupos, distancia = 4) {
    const silabas = versos.map(palabras => {
        const lista = [];
        let tonica = -1;
        palabras.forEach((palabra, n) => {
            const a = analizarPalabra(palabra);
            if (!a) return;
            let inicio = 0;
            separarSilabas(palabra).forEach((silaba, k) => {
                const vocal = a.palabra[vocalPrincipal(a.palabra, a.nucleos[k])].normalize('NFD')[0];
                lista.push({ n, inicio, vocal });
                inicio += silaba.length;
            });
            if (n === palabras.length - 1) tonica = lista.length - a.nucleos.length + a.tonico;
        });
        return { lista, tonica };
    });
    const iguales = (a, b, k) => a.lista[a.tonica - k] && b.lista[b.tonica - k] && a.lista[a.tonica - k].vocal === b.lista[b.tonica - k].vocal;
    return silabas.map((verso, i) => {
        if (grupos[i] == null || verso.tonica < 0) return [];
        let extra = 0;
        silabas.forEach((otro, j) => {
            if (j === i || Math.abs(j - i) >= distancia || grupos[j] !== grupos[i] || otro.tonica < 0) return;
            let k = 0;
            while (k < 3 && iguales(verso, otro, k + 1)) k++;
            extra = Math.max(extra, k);
        });
        if (!extra) return [];
        const desde = versos[i].map(() => null);
        for (const { n, inicio } of verso.lista.slice(verso.tonica - extra, verso.tonica + 1)) desde[n] = Math.min(desde[n] ?? inicio, inicio);
        return desde;
    });
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
