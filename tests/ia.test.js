import { test } from 'node:test';
import assert from 'node:assert/strict';
import { letraParaRevisar, revisionSimulada, validarRevision, ubicarCambio, pedirRevision, fraseElegida, palabraElegida, validarPalabras, palabrasSimuladas, conEnfoque, validarSugerencias, sugerenciasSimuladas, usoDelMes, anotarSugerencia, comprarPlanIA, borrarPlanIA, CUPO_GRATIS, PLAN_IA, textoCupo, idDeUsuario, pedirSugerencias, endpointIA, ENDPOINT_IA } from '../js/logica/ia.js';
import { pedidoValido, promptDeSugerencias, leerRespuesta, revisionValida, promptDeRevision, leerRevision } from '../js/logica/ia-prompt.js';

const almacenNuevo = () => {
    const datos = new Map();
    return { getItem: k => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)) };
};

const LETRA = 'Te busco en el balcón sin razón\ny me quedo solo con mi canción\n\n[Estribillo]\nOtra estrofa acá';
const elegir = (texto, frase) => fraseElegida(LETRA, LETRA.indexOf(texto), LETRA.indexOf(texto) + texto.length);

test('fraseElegida toma el verso entero y el anterior de la misma estrofa', () => {
    const r = elegir('me quedo solo');
    assert.equal(LETRA.slice(r.inicio, r.fin), 'y me quedo solo con mi canción');
    assert.equal(r.pedido.anterior.texto, 'Te busco en el balcón sin razón');
    assert.deepEqual(r.pedido.anterior.final, { palabra: 'razón', consonante: 'on', asonante: 'o' });
    assert.deepEqual(r.pedido.anterior.internas, [{ palabra: 'balcón', asonante: 'o' }]);
    assert.deepEqual(r.pedido.objetivo, { silabas: 10, rimaCon: 'razón' });
    assert.ok(pedidoValido(r.pedido));
});

test('fraseElegida: una sola palabra, dos versos o un renglón vacío no cuentan', () => {
    assert.equal(elegir('balcón'), null);
    assert.equal(elegir('razón\ny me'), null);
    assert.equal(fraseElegida('', 0, 0), null);
});

test('fraseElegida: el primero de la estrofa no tiene anterior y sigue rimando como rima', () => {
    const r = elegir('Otra estrofa');
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
    const { pedido } = elegir('me quedo solo');
    const lista = validarSugerencias([
        '1. y me quedo solo con mi canción', // igual a la frase
        'me quedo solo con la luna',         // no rima
        'me quedo solo esperando a Ramón',   // asonante no, consonante sí
        '«me quedo solo con mi perdón»',
        'me quedo solo con mi perdón',       // repetida
        'me quedo solo con el sol',          // asonante
        '',
    ], pedido);
    assert.deepEqual(lista.map(s => s.texto), ['me quedo solo con mi perdón', 'me quedo solo esperando a Ramón', 'me quedo solo con el sol', 'me quedo solo con la luna']);
    assert.deepEqual(lista.map(s => s.rima), ['consonante', 'consonante', 'asonante', null]);
    assert.equal(lista[0].silabas, 10);
});

test('validarSugerencias deja 4 como mucho', () => {
    const { pedido } = elegir('me quedo solo');
    const muchas = ['pasión', 'perdón', 'ilusión', 'corazón', 'balcón', 'canción'].map(p => `vuelvo solo por ${p}`);
    assert.equal(validarSugerencias(muchas, pedido).length, 4);
});

test('sugerenciasSimuladas usa rimas del índice y no repite la del anterior', () => {
    const { pedido } = elegir('me quedo solo');
    const simuladas = sugerenciasSimuladas(pedido, ['razón', 'pasión', 'perdón', 'ilusión'], () => 0);
    assert.equal(simuladas.length, 4); // 3 rimas libres y una sin rima
    assert.ok(simuladas.every(s => !s.endsWith('razón')));
    assert.ok(validarSugerencias(simuladas, pedido).length >= 3);
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
    const { pedido } = elegir('me quedo solo');
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
    const { pedido } = elegir('me quedo solo');
    const con = respuesta => ({ endpoint: 'https://ia.ejemplo', fetch: async () => respuesta });
    await assert.rejects(pedirSugerencias(pedido, { endpoint: 'https://ia.ejemplo', fetch: async () => { throw new TypeError(); } }), { motivo: 'red' });
    await assert.rejects(pedirSugerencias(pedido, con({ ok: false, status: 429 })), { motivo: 'cupo' });
    await assert.rejects(pedirSugerencias(pedido, con({ ok: false, status: 500 })), { motivo: 'servidor' });
});

test('el prompt lleva las rimas y sílabas del motor, y la respuesta se lee aunque venga envuelta', () => {
    const { pedido } = elegir('me quedo solo');
    const { instrucciones, entrada } = promptDeSugerencias(pedido);
    assert.match(instrucciones, /JSON/);
    assert.match(entrada, /rimas internas: «balcón»/);
    assert.match(entrada, /Sílabas buscadas: 10/);
    assert.match(entrada, /rimar con «razón»/);
    assert.deepEqual(leerRespuesta('Acá van:\n{"sugerencias": ["uno", 2, "dos"]}'), ['uno', 'dos']);
    assert.deepEqual(leerRespuesta('nada'), []);
});

test('pedidoValido rechaza pedidos raros o largos', () => {
    const { pedido } = elegir('me quedo solo');
    assert.equal(pedidoValido(null), false);
    assert.equal(pedidoValido({ ...pedido, verso: { ...pedido.verso, texto: 'x'.repeat(500) } }), false);
    assert.equal(pedidoValido({ ...pedido, estrofa: Array(20).fill('verso') }), false);
});

test('palabraElegida: la última rima con el anterior, una del medio no', () => {
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

test('conEnfoque: «Más corta» pide dos sílabas menos y va en el pedido', () => {
    const { pedido } = elegir('me quedo solo');
    assert.equal(conEnfoque(pedido, 'corta').objetivo.silabas, 8);
    assert.equal(conEnfoque(pedido, 'rimas').objetivo.silabas, 10);
    assert.ok(pedidoValido(conEnfoque(pedido, 'imagen')));
    assert.match(promptDeSugerencias(conEnfoque(pedido, 'imagen')).instrucciones, /imagen concreta/);
    assert.equal(pedidoValido({ ...pedido, enfoque: 'cualquiera' }), false);
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
        sinonimosDe: p => p === 'noche' ? ['noche', 'madrugada'] : [],
        rimasDe: p => p === 'avenida' ? ['salida', 'herida'] : [],
    });
    assert.deepEqual(cambios, [
        { titulo: 'Cambiar la repetición de la palabra «noche»', verso: 1, viejo: 'noche', nuevo: 'madrugada' },
        { titulo: 'Cambiar la palabra «encuentro» por «herida»', verso: 3, viejo: 'encuentro', nuevo: 'herida' },
    ]);
});

test('validarRevision ubica cada cambio en la letra y respeta la mayúscula', () => {
    const cambios = validarRevision([
        { titulo: 'a', verso: 0, viejo: 'noche', nuevo: 'madrugada' },
        { titulo: 'b', verso: 2, viejo: 'nada', nuevo: 'algo' },        // no está
        { titulo: 'c', verso: 0, viejo: 'noche', nuevo: 'luna' },       // mismo lugar
        { titulo: 'd', verso: 3, viejo: 'cara', nuevo: 'cara' },        // no cambia
        { titulo: 'e', verso: 1, viejo: 'sigue', nuevo: 'persigue' },
    ], CANCION);
    assert.deepEqual(cambios.map(c => [c.titulo, c.viejo, c.nuevo, CANCION.slice(c.inicio, c.fin)]), [
        ['a', 'noche', 'madrugada', 'noche'], ['e', 'sigue', 'persigue', 'sigue'],
    ]);
    assert.equal(ubicarCambio('La noche', 0, 'la').inicio, 0);
    assert.equal(validarRevision([{ titulo: 'x', verso: 0, viejo: 'la', nuevo: 'una' }], CANCION)[0].nuevo, 'Una');
    assert.equal(ubicarCambio('nochecita noche', 0, 'noche').inicio, 10);
});

test('el prompt de la revisión lleva los renglones y la respuesta se filtra', () => {
    const { entrada } = promptDeRevision(letraParaRevisar('uno dos tres\n\ncuatro cinco'));
    assert.match(entrada, /^Letra.*\n0 \(5\) uno dos tres\n\n2 \(4\) cuatro cinco$/s);
    assert.deepEqual(leerRevision('{"sugerencias":[{"titulo":"t","verso":1,"viejo":"a","nuevo":"b","extra":1},{"titulo":"t"}]}'),
        [{ titulo: 't', verso: 1, viejo: 'a', nuevo: 'b' }]);
    assert.equal(revisionValida({ versos: [] }), false);
});
