// Lo que se le manda al modelo para «Mejorar frase» (pedido de Swa): las instrucciones y el pedido
// armado por la app (js/logica/ia.js), con las rimas y sílabas que ya calcula el motor propio.
// No importa nada: lo usa también el Worker de Cloudflare (worker/src/index.js), que es quien arma
// el mensaje de verdad, así el servidor no sirve para pedirle cualquier cosa al modelo.

export const MODELO_IA = 'gpt-6.1-terra';
// Cuánto gasta cada consulta de la cuota del mes (pedido de Swa). La letra entera piensa más y lee
// todo, así que gasta según sus versos: 2 hasta 20, 3 hasta 40 y 4 si es más larga.
export const GASTO_IA = { frase: 1, temas: 1, revision: versos => versos <= 20 ? 2 : versos <= 40 ? 3 : 4 };
// «¿Qué cambiaría Métrica IA?» que no encuentra nada no gasta cuota (pedido de Swa), pero igual cuesta
// tokens: hasta estas por mes y por persona; después gasta como cualquier otra.
export const REVISIONES_SIN_CAMBIOS = 10;
// Cuántas muestra la app por frase: hasta 10 por pedido, porque pedir más casi no cambia el costo
// (pedido de Swa). Se piden algunas de más porque el motor descarta las que no cumplen.
export const SUGERENCIAS_IA = 10;
export const PEDIDAS_IA = 14;

// Una palabra sola (la tocada): cuántas alternativas se piden para pasar con las flechas de la viñeta.
export const PALABRAS_IA = 8;

// ---------- Métrica IA: personalidad y voz (pedido de Swa) ----------
// Una sola personalidad para todo: compañera de escritura con oído de rapero, honesta y cálida, que
// respeta el estilo de quien escribe. El país sale del iPhone (cabecera X-Metrica-Pais, código ISO):
// solo con Argentina habla rioplatense con voseo y lunfardo; si no, español neutro de ese país.
export function personalidad(pais) {
    const codigo = typeof pais === 'string' && /^[A-Z]{2}$/.test(pais) ? pais : '';
    const voz = codigo === 'AR'
        ? 'La persona es de Argentina: hablale de vos, en rioplatense, y podés usar lunfardo si la letra lo usa.'
        : `La persona escribe en español${codigo ? ` (su iPhone está en el país con código ${codigo})` : ''}: usá un español neutro y natural de su región, sin lunfardo argentino ni voseo, salvo que su letra los use.`;
    return [
        'Sos Métrica IA, la compañera de escritura de Métrica, una app para escribir canciones y rap en español.',
        'Tu personalidad: oído fino para la rima y la métrica, directa y cálida, honesta sin ser cruel, con ganas de que la letra quede mejor pero siempre respetando la voz, el tema y el estilo de quien escribe. Nunca suenes a manual ni a robot.',
        voz,
        'En lo que va dentro de la letra (frases, versos, palabras), seguí el registro y el vocabulario de la propia letra antes que el tuyo.',
    ].join('\n');
}

// Para que cada pedido salga distinto (pedido de Swa: nada de patrones repetidos, como que la primera
// idea sea siempre de una abuela). Mezcla con `azar` (Math.random en el Worker; fijo en los tests).
export function mezclar(lista, azar = Math.random) {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(azar() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

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
export function promptDeSugerencias(pedido, cantidad = pedido.palabra ? PALABRAS_IA : PEDIDAS_IA, { pais, azar = Math.random } = {}) {
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
            personalidad(pais),
            'Ahora ayudás a elegir una palabra.',
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
    // Los caminos para reescribirla, en otro orden cada vez, así no salen siempre iguales.
    const caminos = mezclar(['más directa', 'con una metáfora', 'con una imagen concreta de la vida diaria', 'que cambie el punto de vista',
        'más íntima', 'con más actitud', 'con un giro inesperado al final', 'con un detalle sensorial (un olor, un sonido, una textura)'], azar).slice(0, 4);
    const instrucciones = [
        personalidad(pais),
        'Ahora ayudás a reescribir una frase de su letra.',
        `Escribí ${cantidad} frases nuevas que puedan reemplazar a la elegida en la letra: que digan lo mismo o lo lleven más lejos, con imágenes concretas y sin clichés.`,
        'Reescribila de verdad: otras palabras, otra construcción y otra imagen. Prohibido devolver la misma frase cambiando una o dos palabras por sinónimos (de «tiene la jaula que merece, la cerré» a «tiene la celda que merece, la sellé» NO sirve).',
        'Cada una tiene que tener sentido completo por sí sola y encajar gramaticalmente en el verso donde va: nada de frases cortadas, palabras sueltas al final ni ideas que no se entienden.',
        'Leé la letra entera: que sigan su tema, su historia y su tono, sin repetir imágenes ni palabras fuertes que ya usa.',
        `Que sean distintas entre sí; por ejemplo: ${caminos.join(', ')}.`,
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
export const CAMBIOS_REVISION = 6; // «Lo que cambiaría»: uno por página con puntitos, así que pueden ser más sin casi costo (pedido de Swa)

export function revisionValida(revision) {
    const versos = revision?.versos;
    return Boolean(Array.isArray(versos) && versos.length && versos.length <= VERSOS_REVISION
        && versos.every(v => v && Number.isInteger(v.n) && v.n >= 0 && texto(v.texto) && Number.isInteger(v.silabas) && Number.isInteger(v.estrofa))
        && (revision.ya === undefined || revision.ya === null || (Array.isArray(revision.ya) && revision.ya.length <= VERSOS_REVISION
            && revision.ya.every(n => Number.isInteger(n) && n >= 0))));
}

export function promptDeRevision(revision, cantidad = CAMBIOS_REVISION, { pais } = {}) {
    const instrucciones = [
        personalidad(pais),
        'Ahora revisás su letra entera, como una amiga que sabe: con respeto por su estilo.',
        `Leé la letra y devolvé hasta ${cantidad} sugerencias concretas, de la más importante a la menos. Buscá, en este orden:`,
        '1. Sentido: frases que no se entienden, que se contradicen o que no siguen la idea de la estrofa.',
        '2. Métrica despareja: un verso con muchas más o muchas menos sílabas que los otros de su estrofa (cada renglón trae sus sílabas entre paréntesis). Proponé un cambio que lo acerque a los demás.',
        '3. Frases muy largas o con relleno que se pueden decir con menos palabras.',
        '4. Palabras repetidas sin querer, finales que no riman con su estrofa, palabras flojas o clichés.',
        'Cada sugerencia cambia una palabra o unas pocas seguidas (hasta cuatro) de un solo verso, copiadas tal cual en "viejo", por otras que tengan sentido en esa frase. La última palabra de lo nuevo tiene que rimar (al menos asonante) con la última de lo que reemplaza o, si es el final del verso, con los finales de su estrofa.',
        'Antes de elegir, leé la letra entera y entendé de qué habla. Proponé solo lo que de verdad la mejora: nada de cambios por cambiar. Si está bien, devolvé menos (o ninguna).',
        'El título dice el motivo en pocas palabras y con tu voz (cercana, nunca de manual), por ejemplo: «No se entiende la frase», «Este verso es más largo que los otros», «Sobran palabras», «Cambiar la repetición de la palabra «x»» o «Cambiar la palabra «x» por «y»».',
        'Respondé solo con JSON: {"sugerencias": [{"titulo": "...", "verso": 3, "viejo": "...", "nuevo": "..."}]}, donde verso es el número de renglón.',
    ].join('\n');
    // «¿Qué más cambiaría Métrica IA?»: los renglones donde ya propuso algo no se repiten (pedido de Swa).
    const ya = Array.isArray(revision.ya) ? revision.ya : [];
    const yaPropuestos = ya.length ? `\nYa propusiste cambios en los renglones ${ya.join(', ')}: no propongas nada en esos renglones.` : '';
    let estrofa = revision.versos[0]?.estrofa;
    const lineas = revision.versos.map(v => {
        const corte = v.estrofa !== estrofa ? '\n' : '';
        estrofa = v.estrofa;
        return `${corte}${v.n} (${v.silabas}) ${v.texto}`;
    });
    return { instrucciones: instrucciones + yaPropuestos, entrada: `Letra (número de renglón, sílabas y verso):\n${lineas.join('\n')}` };
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

// De dónde sale cada idea: se eligen al azar en cada pedido, así no se repite siempre lo mismo (pedido de
// Swa: la primera idea salía siempre de una abuela). Cosas que una persona común vivió o puede vivir:
// nada de lujos ni de vidas que casi nadie vive.
export const SEMILLAS_TEMAS = [
    'un amor que empieza', 'un desamor reciente', 'alguien que te gusta y no lo sabe', 'una pelea de pareja', 'volver con un ex',
    'una amistad que se rompió', 'el mejor amigo de toda la vida', 'un amigo que te falló', 'la primera vez que saliste solo de noche',
    'una fiesta que se descontroló', 'la vuelta a casa de madrugada', 'el colectivo o el subte de todos los días', 'un trabajo que odiás',
    'la plata que no alcanza', 'un sueño que todavía no se cumplió', 'entrenar o prepararte para algo', 'una revancha', 'un error que te enseñó algo',
    'el barrio donde creciste', 'una calle de noche', 'la escuela o el secundario', 'una mudanza', 'un viaje en ruta', 'una ciudad nueva',
    'el mar o un río', 'un día de lluvia', 'el verano', 'un domingo aburrido', 'una canción que te recuerda a alguien', 'tu primer instrumento o tu primer beat',
    'la presión de las redes', 'el celular a las 3 de la mañana', 'la ansiedad antes de algo importante', 'estar solo y estar bien', 'sentirte fuera de lugar',
    'tu vieja o tu viejo', 'un hermano o una hermana', 'una mascota', 'alguien que ya no está', 'una promesa que no cumpliste',
    'el orgullo de dónde venís', 'alguien que no creyó en vos', 'una noche sin dormir', 'un recuerdo de la infancia', 'el primer sueldo',
    'una despedida en un aeropuerto o una terminal', 'una cita que salió mal', 'un mensaje que nunca mandaste', 'bailar hasta que cierren', 'un secreto',
];

export function promptDeTemas(temas, cantidad = TEMAS_IA, { pais, azar = Math.random } = {}) {
    const semillas = mezclar(SEMILLAS_TEMAS, azar).slice(0, cantidad);
    const tonos = mezclar(['tierna', 'con bronca', 'de fiesta', 'nostálgica', 'con humor', 'oscura', 'esperanzada', 'con actitud'], azar).slice(0, cantidad);
    const instrucciones = [
        personalidad(pais),
        'Ahora ayudás a alguien a arrancar una letra nueva.',
        `Proponé ${cantidad} ideas de qué hablar en una canción. Cada una es un tema concreto con su ángulo: una situación, un momento, una persona o un lugar, no una palabra suelta ni algo genérico como «el amor» o «la vida».`,
        'Cosas que una persona común vivió o puede vivir. Nada de lujos ni de vidas que casi nadie vive (ser millonario, autos caros, fama).',
        `Para esta vez, una idea por cada punto de partida, en este orden: ${semillas.map((t, n) => `${t} (${tonos[n]})`).join('; ')}. Tomalos como punto de partida, no como frase: buscá un ángulo propio y sorprendente.`,
        'Cada una es una sola frase en segunda persona que invite a escribir, de 25 palabras como mucho, sin comillas, sin numerar y sin explicar nada.',
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
