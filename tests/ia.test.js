import { test } from 'node:test';
import assert from 'node:assert/strict';
import { letraParaRevisar, revisionSimulada, validarRevision, ubicarCambio, pedirRevision, fraseElegida, palabraElegida, validarPalabras, palabrasSimuladas, validarSugerencias, sugerenciasSimuladas, usoDelMes, anotarSugerencia, comprarPlanIA, borrarPlanIA, CUPO_GRATIS, PLAN_IA, textoCupo, idDeUsuario, pedirSugerencias, endpointIA, ENDPOINT_IA } from '../js/logica/ia.js';
import { pedidoValido, promptDeSugerencias, leerRespuesta, revisionValida, promptDeRevision, leerRevision } from '../js/logica/ia-prompt.js';

const almacenNuevo = () => {
    const datos = new Map();
    return { getItem: k => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)) };
};

const LETRA = 'Te busco en el balcón sin razón\ny me quedo solo con mi canción\n\n[Estribillo]\nOtra estrofa acá';
const elegir = (texto, frase) => fraseElegida(LETRA, LETRA.indexOf(texto), LETRA.indexOf(texto) + texto.length);

test('fraseElegida toma lo seleccionado hasta palabras enteras y busca sus propias rimas', () => {
    const r = fraseElegida(LETRA, LETRA.indexOf('uedo solo'), LETRA.indexOf('con mi can') + 10);
    assert.equal(LETRA.slice(r.inicio, r.fin), 'quedo solo con mi canción');
    assert.equal(r.pedido.verso.texto, 'quedo solo con mi canción');
    assert.equal(r.pedido.enVerso, 'y me quedo solo con mi canción');
    assert.deepEqual(r.pedido.verso.final, { palabra: 'canción', consonante: 'on', asonante: 'o' });
    // Lo que rima es la frase, no el verso anterior (que va solo de contexto).
    assert.deepEqual(r.pedido.objetivo, { silabas: 9, rimaCon: 'canción' });
    assert.equal(r.pedido.anterior.texto, 'Te busco en el balcón sin razón');
    assert.ok(pedidoValido(r.pedido));
});

test('fraseElegida suma las rimas internas de la frase', () => {
    const r = elegir('Te busco en el balcón sin razón');
    assert.equal(r.pedido.enVerso, undefined);
    assert.deepEqual(r.pedido.verso.internas, [{ palabra: 'balcón', asonante: 'o' }]);
    const sola = fraseElegida('la noche me deja sin coche', 0, 27);
    assert.deepEqual(sola.pedido.verso.internas.map(i => i.palabra), ['noche']);
});

test('fraseElegida: una sola palabra, dos versos o un renglón vacío no cuentan', () => {
    assert.equal(elegir('balcón'), null);
    assert.equal(elegir('razón\ny me'), null);
    assert.equal(fraseElegida('', 0, 0), null);
});

test('fraseElegida: el primero de la estrofa no tiene anterior y rima consigo', () => {
    const r = elegir('Otra estrofa acá');
    assert.equal(r.pedido.anterior, null);
    assert.equal(r.pedido.objetivo.rimaCon, 'acá');
    assert.deepEqual(r.pedido.estrofa, ['Otra estrofa acá']);
});

test('fraseElegida no corta en los agregados entre paréntesis', () => {
    const texto = 'yo te espero en el portón\nno me falles (nos) corazón (eh)';
    const r = fraseElegida(texto, texto.indexOf('no me'), texto.length);
    assert.equal(r.pedido.verso.final.palabra, 'corazón');
});

test('validarSugerencias ordena por rima, sílabas e internas y saca repetidas', () => {
    const { pedido } = elegir('y me quedo solo con mi canción');
    const lista = validarSugerencias([
        '1. y me quedo solo con mi canción', // igual a la frase
        'me voy sola a la luna',             // no rima
        'me sigo esperando a Ramón',         // consonante
        '«sigo solo con mi perdón»',
        'sigo solo con mi perdón',           // repetida
        'me quedé solo y con el sol',        // asonante
        '',
    ], pedido);
    assert.deepEqual(lista.map(s => s.texto), ['me sigo esperando a Ramón', 'sigo solo con mi perdón', 'me quedé solo y con el sol', 'me voy sola a la luna']);
    assert.deepEqual(lista.map(s => s.rima), ['consonante', 'consonante', 'asonante', null]);
    assert.equal(lista[0].silabas, 9); // la más cerca de las 11 de la frase
});

test('validarSugerencias deja 4 como mucho', () => {
    const { pedido } = elegir('y me quedo solo con mi canción');
    const muchas = ['pasión', 'perdón', 'ilusión', 'corazón', 'balcón', 'canción'].map(p => `vuelvo solo por ${p}`);
    assert.equal(validarSugerencias(muchas, pedido).length, 4);
});

test('sugerenciasSimuladas: la misma idea con sinónimos y la última rimando con la de la frase', () => {
    const { pedido } = elegir('y me quedo solo con mi canción');
    const simuladas = sugerenciasSimuladas(pedido, {
        rimas: ['canción', 'pasión', 'perdón'],
        sinonimosDe: p => ({ quedo: ['sigo'], solo: ['aislado'] })[p] ?? [],
    }, () => 0);
    assert.equal(simuladas.length, 5);
    assert.equal(simuladas[0], 'y me quedo solo con mi pasión');
    assert.ok(simuladas.some(s => s.includes('sigo') && s.endsWith('canción')));
    const validas = validarSugerencias(simuladas, pedido);
    assert.ok(validas.length >= 3 && validas.every(s => s.rima === 'consonante' || s.rima === 'misma'));
});

test('cupo: 20 gratis por mes, se renueva y el plan simulado sube a 500', () => {
    const almacen = almacenNuevo();
    const noviembre = Date.UTC(2026, 10, 15), diciembre = Date.UTC(2026, 11, 15);
    assert.deepEqual(usoDelMes(almacen, noviembre), { usadas: 0, tope: CUPO_GRATIS, quedan: 20, plan: false });
    for (let i = 0; i < 25; i++) anotarSugerencia(almacen, noviembre);
    assert.equal(usoDelMes(almacen, noviembre).quedan, 0);
    assert.equal(usoDelMes(almacen, diciembre).quedan, 20);
    comprarPlanIA(almacen);
    assert.deepEqual(usoDelMes(almacen, noviembre), { usadas: 25, tope: PLAN_IA.tope, quedan: 475, plan: true });
    assert.equal(textoCupo(usoDelMes(almacen, noviembre)), 'Quedan 475 de 500 este mes');
    borrarPlanIA(almacen);
    assert.equal(textoCupo({ quedan: 1, tope: 20, plan: false }), 'Queda 1 de 20 gratis este mes');
});

test('idDeUsuario se crea una vez y queda', () => {
    const almacen = almacenNuevo();
    const id = idDeUsuario(almacen, () => 0.5);
    assert.equal(id.length, 24);
    assert.equal(idDeUsuario(almacen, () => 0.1), id);
});

test('pedirSugerencias: sin endpoint, simuladas; con endpoint, al Worker', async () => {
    assert.equal(ENDPOINT_IA, '');
    assert.equal(endpointIA(almacenNuevo()), '');
    const { pedido } = elegir('y me quedo solo con mi canción');
    assert.deepEqual(await pedirSugerencias(pedido, { simular: () => ['a'] }), { sugerencias: ['a'], simulada: true });
    let enviado;
    const fetch = async (url, opciones) => {
        enviado = { url, ...opciones };
        return { ok: true, status: 200, json: async () => ({ sugerencias: ['b'], quedan: 7 }) };
    };
    assert.deepEqual(await pedirSugerencias(pedido, { endpoint: 'https://ia.ejemplo', id: 'x', fetch }), { sugerencias: ['b'], quedan: 7 });
    assert.equal(enviado.headers['X-Metrica-Id'], 'x');
    assert.deepEqual(JSON.parse(enviado.body), { pedido });
});

test('pedirSugerencias avisa sin conexión, sin cupo o con error del servidor', async () => {
    const { pedido } = elegir('y me quedo solo con mi canción');
    const con = respuesta => ({ endpoint: 'https://ia.ejemplo', fetch: async () => respuesta });
    await assert.rejects(pedirSugerencias(pedido, { endpoint: 'https://ia.ejemplo', fetch: async () => { throw new TypeError(); } }), { motivo: 'red' });
    await assert.rejects(pedirSugerencias(pedido, con({ ok: false, status: 429 })), { motivo: 'cupo' });
    await assert.rejects(pedirSugerencias(pedido, con({ ok: false, status: 500 })), { motivo: 'servidor' });
});

test('el prompt lleva las rimas y sílabas del motor, y la respuesta se lee aunque venga envuelta', () => {
    const { pedido } = elegir('y me quedo solo con mi canción');
    const { instrucciones, entrada } = promptDeSugerencias(pedido);
    assert.match(instrucciones, /JSON/);
    assert.match(entrada, /rimas internas: «balcón»/);
    assert.match(entrada, /Sílabas buscadas: 11/);
    assert.match(entrada, /rimar con «canción»/);
    assert.deepEqual(leerRespuesta('Acá van:\n{"sugerencias": ["uno", 2, "dos"]}'), ['uno', 'dos']);
    assert.deepEqual(leerRespuesta('nada'), []);
});

test('pedidoValido rechaza pedidos raros o largos', () => {
    const { pedido } = elegir('y me quedo solo con mi canción');
    assert.equal(pedidoValido(null), false);
    assert.equal(pedidoValido({ ...pedido, verso: { ...pedido.verso, texto: 'x'.repeat(500) } }), false);
    assert.equal(pedidoValido({ ...pedido, estrofa: Array(20).fill('verso') }), false);
});

test('palabraElegida: la última rima con el verso anterior, una del medio no', () => {
    const final = palabraElegida(LETRA, LETRA.indexOf('canción'), LETRA.indexOf('canción') + 7);
    assert.deepEqual(final.pedido.palabra, { texto: 'canción', final: true });
    assert.equal(final.pedido.objetivo.rimaCon, 'razón');
    const medio = palabraElegida(LETRA, LETRA.indexOf('solo'), LETRA.indexOf('solo') + 4);
    assert.deepEqual(medio.pedido.palabra, { texto: 'solo', final: false });
    assert.equal(medio.pedido.objetivo.rimaCon, null);
    assert.ok(pedidoValido(medio.pedido));
    assert.equal(palabraElegida(LETRA, 0, 9), null); // «Te busco»: dos palabras
});

test('validarPalabras saca la misma y ordena por rima si es la última', () => {
    const { pedido } = palabraElegida(LETRA, LETRA.indexOf('canción'), LETRA.indexOf('canción') + 7);
    const lista = validarPalabras(['luna', 'Canción', 'sol', '«pasión»', 'dos palabras', 'pasión'], pedido);
    assert.deepEqual(lista.map(p => p.texto), ['pasión', 'sol', 'luna']);
    assert.deepEqual(palabrasSimuladas(pedido, { rimas: ['razón', 'perdón'] }), ['perdón']);
});


const CANCION = 'La noche me encuentra en la esquina\nla noche me sigue a la salida\ncamino sin rumbo por la avenida\nbusco tu cara y no la encuentro';

test('letraParaRevisar manda los versos con renglón, sílabas y estrofa', () => {
    const revision = letraParaRevisar('Te busco en el balcón\n\n[Estribillo]\notra vez acá');
    assert.deepEqual(revision.versos.map(v => [v.n, v.estrofa]), [[0, 0], [3, 2]]);
    assert.equal(revision.versos[0].silabas, 7);
    assert.ok(revisionValida(revision));
    assert.equal(letraParaRevisar('\n\n'), null);
});

test('revisionSimulada: cambia la repetición y el final que no rima', () => {
    const revision = letraParaRevisar(CANCION);
    const cambios = revisionSimulada(revision, {
        sinonimosDe: p => p === 'noche' ? ['noche', 'madrugada', 'golpe'] : [],
        rimasDe: p => p === 'avenida' ? ['salida', 'herida'] : [],
    });
    assert.deepEqual(cambios, [
        { titulo: 'Cambiar la repetición de la palabra «noche»', verso: 1, viejo: 'noche', nuevo: 'golpe' }, // madrugada no rima
        { titulo: 'Cambiar la palabra «encuentro» por «herida»', verso: 3, viejo: 'encuentro', nuevo: 'herida' },
    ]);
});

test('validarRevision ubica cada cambio en la letra y respeta la mayúscula', () => {
    const cambios = validarRevision([
        { titulo: 'a', verso: 0, viejo: 'noche', nuevo: 'coche' },
        { titulo: 'f', verso: 3, viejo: 'cara', nuevo: 'luz' },      // no rima con «cara» ni con los finales
        { titulo: 'g', verso: 2, viejo: 'camino', nuevo: 'salida' },     // rima con los finales de la estrofa
        { titulo: 'b', verso: 2, viejo: 'nada', nuevo: 'algo' },        // no está
        { titulo: 'c', verso: 0, viejo: 'noche', nuevo: 'luna' },       // mismo lugar
        { titulo: 'd', verso: 3, viejo: 'cara', nuevo: 'cara' },        // no cambia
        { titulo: 'e', verso: 1, viejo: 'sigue', nuevo: 'persigue' },
    ], CANCION);
    assert.deepEqual(cambios.map(c => [c.titulo, c.viejo, c.nuevo, CANCION.slice(c.inicio, c.fin)]), [
        ['a', 'noche', 'coche', 'noche'], ['g', 'camino', 'salida', 'camino'], ['e', 'sigue', 'persigue', 'sigue'],
    ]);
    assert.equal(ubicarCambio('La noche', 0, 'la').inicio, 0);
    assert.equal(validarRevision([{ titulo: 'x', verso: 0, viejo: 'la', nuevo: 'ya' }], CANCION)[0].nuevo, 'Ya');
    assert.equal(ubicarCambio('nochecita noche', 0, 'noche').inicio, 10);
});

test('el prompt de la revisión lleva los renglones y la respuesta se filtra', () => {
    const { entrada } = promptDeRevision(letraParaRevisar('uno dos tres\n\ncuatro cinco'));
    assert.match(entrada, /^Letra.*\n0 \(5\) uno dos tres\n\n2 \(4\) cuatro cinco$/s);
    assert.deepEqual(leerRevision('{"sugerencias":[{"titulo":"t","verso":1,"viejo":"a","nuevo":"b","extra":1},{"titulo":"t"}]}'),
        [{ titulo: 't', verso: 1, viejo: 'a', nuevo: 'b' }]);
    assert.equal(revisionValida({ versos: [] }), false);
});
