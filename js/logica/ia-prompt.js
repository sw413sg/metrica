// Lo que se le manda al modelo para «Mejorar frase» (pedido de Swa): las instrucciones y el pedido
// armado por la app (js/logica/ia.js), con las rimas y sílabas que ya calcula el motor propio.
// No importa nada: lo usa también el Worker de Cloudflare (worker/src/index.js), que es quien arma
// el mensaje de verdad, así el servidor no sirve para pedirle cualquier cosa al modelo.

export const MODELO_IA = 'gpt-6.1-terra';
// Cuánto gasta cada consulta de la cuota del mes (pedido de Swa): la letra entera piensa más y lee todo.
export const GASTO_IA = { frase: 1, temas: 1, revision: 3 };
// Cuántas pide la app: 3 o 4 por frase. Se piden algunas de más porque el motor descarta las que no cumplen.
export const SUGERENCIAS_IA = 4;
export const PEDIDAS_IA = 6;

// Una palabra sola (la tocada): cuántas alternativas se piden para pasar con las flechas de la viñeta.
export const PALABRAS_IA = 8;

const LARGO_MAXIMO = 140;
const VERSOS_ESTROFA = 8;

const texto = (valor, largo = LARGO_MAXIMO) => typeof valor === 'string' && valor.trim() && valor.length <= largo;
const versoValido = v => v && texto(v.texto) && Number.isInteger(v.silabas) && v.silabas >= 0 && v.silabas < 60
    && (v.final == null || texto(v.final.palabra, 40))
    && (v.internas == null || (Array.isArray(v.internas) && v.internas.length <= 12 && v.internas.every(i => texto(i?.palabra, 40))));

// La letra entera de contexto (renglones vacíos incluidos, separan estrofas) y cuál es el verso.
const letraValida = (letra, en) => Array.isArray(letra) && letra.length <= VERSOS_REVISION
    && letra.every(v => typeof v === 'string' && v.length <= LARGO_MAXIMO)
    && Number.isInteger(en) && en >= 0 && en < letra.length;

// El servidor revisa que el pedido tenga la forma de siempre y no sea largo (si no, no lo manda).
export function pedidoValido(pedido) {
    return Boolean(pedido && versoValido(pedido.verso)
        && (pedido.anterior == null || versoValido(pedido.anterior))
        && Array.isArray(pedido.estrofa) && pedido.estrofa.length <= VERSOS_ESTROFA && pedido.estrofa.every(v => texto(v))
        && Number.isInteger(pedido.objetivo?.silabas)
        && (pedido.enVerso == null || texto(pedido.enVerso))
        && (pedido.letra == null || letraValida(pedido.letra, pedido.enLetra))
        && (pedido.palabra == null || (texto(pedido.palabra.texto, 40) && typeof pedido.palabra.final === 'boolean')));
}

const describir = v => {
    const partes = [`«${v.texto}» (${v.silabas} sílabas)`];
    if (v.final) partes.push(`termina en «${v.final.palabra}» (rima consonante «-${v.final.consonante}», asonante «${v.final.asonante}»)`);
    if (v.internas?.length) partes.push(`rimas internas: ${v.internas.map(i => `«${i.palabra}»`).join(', ')}`);
    return partes.join('; ');
};

// { instrucciones, entrada }: el mensaje de sistema y el del usuario, en texto.
export function promptDeSugerencias(pedido, cantidad = pedido.palabra ? PALABRAS_IA : PEDIDAS_IA) {
    const contexto = [];
    // La letra entera va primero y solo de contexto: el tema, el tono y lo que ya se dijo (pedido de Swa).
    if (pedido.letra?.some(v => v.trim())) {
        const letra = pedido.letra.map((v, n) => n === pedido.enLetra ? `>> ${v}` : v).join('\n').replace(/\n{3,}/g, '\n\n');
        contexto.push(`Letra entera, solo para entender de qué habla y qué ya se dijo (el verso marcado con >> es el de la frase):\n${letra.trim()}`);
    }
    if (pedido.estrofa.length) contexto.push(`Estrofa:\n${pedido.estrofa.join('\n')}`);
    if (pedido.anterior) contexto.push(`Verso anterior: ${describir(pedido.anterior)}.`);
    if (pedido.palabra) {
        const instrucciones = [
            'Sos un compositor de rap y canciones en español rioplatense que ayuda a elegir una palabra.',
            `Devolvé ${cantidad} palabras sueltas que puedan reemplazar a la elegida en su verso, que encajen con el sentido y suenen bien.`,
            pedido.palabra.final && pedido.objetivo.rimaCon
                ? `Es la última del verso: tienen que rimar con «${pedido.objetivo.rimaCon}» (mejor consonante, si no asonante).`
                : 'Va en el medio del verso: mejor si suenan con las rimas internas de la estrofa.',
            'Que siga el tema y el tono de la letra, sin repetir palabras que ya están en ella.',
            'Respondé solo con JSON: {"sugerencias": ["...", "..."]}.',
        ].join('\n');
        contexto.push(`Verso: ${describir(pedido.verso)}.`, `Palabra para cambiar: «${pedido.palabra.texto}».`);
        return { instrucciones, entrada: contexto.join('\n\n') };
    }
    // La frase seleccionada: frases relacionadas con ella y con sus propias rimas (pedido de Swa).
    const { final, internas } = pedido.verso;
    const instrucciones = [
        'Sos un compositor de rap y canciones en español rioplatense que ayuda a escribir.',
        `Escribí ${cantidad} frases nuevas que puedan reemplazar a la elegida en la letra: que digan lo mismo o lo lleven más lejos, con imágenes concretas y sin clichés.`,
        'Reescribila de verdad: otras palabras, otra construcción y otra imagen. Prohibido devolver la misma frase cambiando una o dos palabras por sinónimos (de «tiene la jaula que merece, la cerré» a «tiene la celda que merece, la sellé» NO sirve).',
        'Leé la letra entera: que sigan su tema, su historia y su tono, sin repetir imágenes ni palabras fuertes que ya usa.',
        'Que sean distintas entre sí: una más directa, una con una metáfora, una más de calle o de barrio, una que cambie el punto de vista.',
        'La última palabra tiene que rimar con la de la frase elegida (mejor consonante; puede ser otra palabra distinta, y como mucho una puede repetirla). Si tiene rimas internas, que suenen parecido en el medio, aunque sean otras palabras.',
        'Cada una es una sola frase, sin comillas, sin numerar y sin explicar nada, con la cantidad de sílabas pedida (dos de diferencia como mucho).',
        'Respondé solo con JSON: {"sugerencias": ["...", "..."]}.',
    ].join('\n');
    const lineas = contexto;
    if (pedido.enVerso) lineas.push(`La frase está en el verso: «${pedido.enVerso}».`);
    lineas.push(`Frase elegida: ${describir(pedido.verso)}.`);
    lineas.push(`Sílabas buscadas: ${pedido.objetivo.silabas}.`);
    lineas.push(`La última palabra tiene que rimar con «${final.palabra}» (consonante «-${final.consonante}»).`);
    if (internas.length) lineas.push(`Rimas internas para mantener: ${internas.map(i => `«${i.palabra}»`).join(', ')}.`);
    return { instrucciones, entrada: lineas.join('\n\n') };
}

// ---------- Sugerencias de la letra entera (pestaña «Sugerencias» de «¿Por dónde empiezo?») ----------
// La app manda los versos con su número de renglón, sus sílabas y su estrofa; el modelo devuelve
// cambios chicos: una palabra (o unas pocas) de un verso por otra.
export const VERSOS_REVISION = 80;
export const CAMBIOS_REVISION = 2; // «Lo que cambiaría»: 2 como mucho, así la hoja no queda muy alta (pedido de Swa)

export function revisionValida(revision) {
    const versos = revision?.versos;
    return Boolean(Array.isArray(versos) && versos.length && versos.length <= VERSOS_REVISION
        && versos.every(v => v && Number.isInteger(v.n) && v.n >= 0 && texto(v.texto) && Number.isInteger(v.silabas) && Number.isInteger(v.estrofa)));
}

export function promptDeRevision(revision, cantidad = CAMBIOS_REVISION) {
    const instrucciones = [
        'Sos un compositor de rap y canciones en español rioplatense que revisa la letra de otro, con respeto por su estilo.',
        `Leé la letra y devolvé hasta ${cantidad} sugerencias concretas, de la más importante a la menos. Buscá, en este orden:`,
        '1. Sentido: frases que no se entienden, que se contradicen o que no siguen la idea de la estrofa.',
        '2. Métrica despareja: un verso con muchas más o muchas menos sílabas que los otros de su estrofa (cada renglón trae sus sílabas entre paréntesis). Proponé un cambio que lo acerque a los demás.',
        '3. Frases muy largas o con relleno que se pueden decir con menos palabras.',
        '4. Palabras repetidas sin querer, finales que no riman con su estrofa, palabras flojas o clichés.',
        'Cada sugerencia cambia una palabra o unas pocas seguidas (hasta cuatro) de un solo verso, copiadas tal cual en "viejo", por otras que tengan sentido en esa frase. La última palabra de lo nuevo tiene que rimar (al menos asonante) con la última de lo que reemplaza o, si es el final del verso, con los finales de su estrofa.',
        'Antes de elegir, leé la letra entera y entendé de qué habla. Proponé solo lo que de verdad la mejora: nada de cambios por cambiar. Si está bien, devolvé menos (o ninguna).',
        'El título dice el motivo en pocas palabras, por ejemplo: «No se entiende la frase», «Este verso es más largo que los otros», «Sobran palabras», «Cambiar la repetición de la palabra «x»» o «Cambiar la palabra «x» por «y»».',
        'Respondé solo con JSON: {"sugerencias": [{"titulo": "...", "verso": 3, "viejo": "...", "nuevo": "..."}]}, donde verso es el número de renglón.',
    ].join('\n');
    let estrofa = revision.versos[0]?.estrofa;
    const lineas = revision.versos.map(v => {
        const corte = v.estrofa !== estrofa ? '\n' : '';
        estrofa = v.estrofa;
        return `${corte}${v.n} (${v.silabas}) ${v.texto}`;
    });
    return { instrucciones, entrada: `Letra (número de renglón, sílabas y verso):\n${lineas.join('\n')}` };
}

// La lista de cambios que contesta el modelo, solo con los campos que sirven.
export function leerRevision(contenido) {
    try {
        const json = JSON.parse(String(contenido).match(/\{[\s\S]*\}/)?.[0] ?? '');
        return (Array.isArray(json.sugerencias) ? json.sugerencias : [])
            .filter(s => s && Number.isInteger(s.verso) && ['titulo', 'viejo', 'nuevo'].every(c => typeof s[c] === 'string' && s[c].trim()))
            .map(({ titulo, verso, viejo, nuevo }) => ({ titulo, verso, viejo, nuevo }))
            .slice(0, CAMBIOS_REVISION + 2);
    } catch {
        return [];
    }
}

// Lo que contesta el modelo: saca la lista de versos, aunque venga con algo más alrededor.
export function leerRespuesta(contenido) {
    try {
        const json = JSON.parse(String(contenido).match(/\{[\s\S]*\}/)?.[0] ?? '');
        return Array.isArray(json.sugerencias) ? json.sugerencias.filter(s => typeof s === 'string') : [];
    } catch {
        return [];
    }
}

// ---------- Temas: de qué hablar en una canción (pestaña «Sugerencias IA» de la letra vacía y el baúl) ----------
// La app manda solo las ideas que ya se vieron (para no repetir); vuelven ideas de una frase.
export const TEMAS_IA = 4;
const TEMAS_VISTOS = 20;
const LARGO_TEMA = 200;

export function temasValido(temas) {
    const vistas = temas?.vistas ?? [];
    return Boolean(temas && typeof temas === 'object' && Array.isArray(vistas) && vistas.length <= TEMAS_VISTOS
        && vistas.every(v => texto(v, LARGO_TEMA)));
}

export function promptDeTemas(temas, cantidad = TEMAS_IA) {
    const instrucciones = [
        'Sos un compositor de rap y canciones en español rioplatense que ayuda a alguien a arrancar una letra nueva.',
        `Proponé ${cantidad} ideas de qué hablar en una canción. Cada una es un tema concreto con su ángulo: una situación, un momento, una persona o un lugar, no una palabra suelta ni algo genérico como «el amor» o «la vida».`,
        'Cosas que una persona común vivió o puede vivir: amor y desamor, el barrio, la familia, los amigos, el laburo, la plata que no alcanza, salir de noche, superarse, extrañar, viajar. Nada de lujos ni de vidas que casi nadie vive (ser millonario, autos caros, fama).',
        'Que sean distintas entre sí en tema y en tono: una tierna, una con bronca, una de fiesta, una que dé nostalgia.',
        'Cada una es una sola frase en segunda persona que invite a escribir, de 25 palabras como mucho, sin comillas, sin numerar y sin explicar nada (por ejemplo: «Contá la última vez que viste a alguien sin saber que era la última»).',
        'Respondé solo con JSON: {"sugerencias": ["...", "..."]}.',
    ].join('\n');
    const lineas = [`Dame ${cantidad} ideas de qué hablar en una canción.`];
    if (temas.vistas?.length) lineas.push(`Que no se parezcan a estas, que ya vio:\n${temas.vistas.map(v => `- ${v}`).join('\n')}`);
    return { instrucciones, entrada: lineas.join('\n\n') };
}

// Las ideas que vuelven: frases con algo, no muy largas, sin repetir. Hasta 4.
export function leerTemas(contenido) {
    const vistas = new Set();
    return leerRespuesta(contenido)
        .map(t => t.trim().replace(/^[«"“]+|[»"”]+$/g, '').trim())
        .filter(t => t && t.length <= LARGO_TEMA && !vistas.has(t.toLowerCase()) && vistas.add(t.toLowerCase()))
        .slice(0, TEMAS_IA);
}
