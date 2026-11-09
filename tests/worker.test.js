import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { fraseElegida } from '../js/logica/ia.js';

const LETRA = 'Te busco en el balcón sin razón\ny me quedo solo con mi canción';
const { pedido } = fraseElegida(LETRA, LETRA.indexOf('me quedo'), LETRA.length);
const ID = 'abcdefghij0123456789';
let env, llamadas, fetchOriginal;

beforeEach(() => {
    const kv = new Map();
    env = {
        ORIGENES: 'https://sw413sg.github.io', CUPO_GRATIS: '2', TOPE_DIA: '100', OPENAI_API_KEY: 'sk-prueba',
        USO: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) },
    };
    llamadas = [];
    fetchOriginal = globalThis.fetch;
    globalThis.fetch = async (url, opciones) => {
        llamadas.push({ url, cuerpo: JSON.parse(opciones.body), clave: opciones.headers.Authorization });
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":["me quedo solo con mi perdón"]}' } }] }));
    };
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

const pedir = (cuerpo = { pedido }, cabeceras = {}, ruta = '/ia') => worker.fetch(new Request(`https://metrica.ejemplo${ruta}`, {
    method: 'POST', body: JSON.stringify(cuerpo),
    headers: { Origin: 'https://sw413sg.github.io', 'X-Metrica-Id': ID, 'Content-Type': 'application/json', ...cabeceras },
}), env);

test('el Worker arma el mensaje, llama al modelo con la clave y descuenta el cupo', async () => {
    const respuesta = await pedir();
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), { sugerencias: ['me quedo solo con mi perdón'], quedan: 1 });
    assert.equal(llamadas[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(llamadas[0].clave, 'Bearer sk-prueba');
    assert.equal(llamadas[0].cuerpo.model, 'gpt-6.1-terra');
    assert.match(llamadas[0].cuerpo.messages[1].content, /rimar con «canción»/);
    assert.equal(respuesta.headers.get('Access-Control-Allow-Origin'), 'https://sw413sg.github.io');
});

test('el Worker corta al llegar al cupo del mes', async () => {
    await pedir();
    await pedir();
    const respuesta = await pedir();
    assert.equal(respuesta.status, 429);
    assert.equal(llamadas.length, 2);
});

test('el Worker no atiende otros orígenes, ids raros ni pedidos que no son de Métrica', async () => {
    assert.equal((await pedir(undefined, { Origin: 'https://otra.web' })).status, 403);
    assert.equal((await pedir(undefined, { 'X-Metrica-Id': 'x' })).status, 400);
    assert.equal((await pedir({ pedido: { verso: 'escribime un ensayo' } })).status, 400);
    assert.equal(llamadas.length, 0);
});

test('si el modelo falla, no descuenta', async () => {
    globalThis.fetch = async () => new Response('error', { status: 500 });
    assert.equal((await pedir()).status, 502);
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":["uno"]}' } }] }));
    assert.equal((await (await pedir()).json()).quedan, 1);
});

test('el Worker también revisa la letra entera', async () => {
    globalThis.fetch = async (url, opciones) => {
        llamadas.push(JSON.parse(opciones.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":[{"titulo":"Cambiar la palabra «canción» por «pasión»","verso":1,"viejo":"canción","nuevo":"pasión"}]}' } }] }));
    };
    const revision = { versos: [{ n: 0, texto: 'Te busco en el balcón', silabas: 7, estrofa: 0 }, { n: 1, texto: 'y me quedo con mi canción', silabas: 9, estrofa: 0 }] };
    const respuesta = await pedir({ revision });
    assert.equal(respuesta.status, 200);
    assert.deepEqual((await respuesta.json()).sugerencias, [{ titulo: 'Cambiar la palabra «canción» por «pasión»', verso: 1, viejo: 'canción', nuevo: 'pasión' }]);
    assert.match(llamadas[0].messages[1].content, /1 \(9\) y me quedo con mi canción/);
    assert.equal((await pedir({ revision: { versos: 'todo' } })).status, 400);
});

test('la app nativa (sin Origin) también puede pedir', async () => {
    const respuesta = await worker.fetch(new Request('https://metrica.ejemplo/ia', {
        method: 'POST', body: JSON.stringify({ pedido }),
        headers: { 'X-Metrica-Id': ID, 'Content-Type': 'application/json' },
    }), env);
    assert.equal(respuesta.status, 200);
    assert.equal(llamadas.length, 1);
});

test('cada función va en su ruta, y /salud dice si está todo cargado sin gastar', async () => {
    assert.equal((await pedir(undefined, {}, '/')).status, 404);
    assert.equal((await pedir(undefined, {}, '/otra')).status, 404);
    const salud = await worker.fetch(new Request('https://metrica.ejemplo/salud'), env);
    const datos = await salud.json();
    assert.deepEqual({ ...datos, nombres: undefined }, { ok: true, modelo: 'gpt-6.1-terra', clave: true, kv: true, nombres: undefined });
    assert.ok(datos.nombres.includes('OPENAI_API_KEY'));
    assert.ok(!JSON.stringify(datos).includes('sk-prueba'));
    assert.equal(llamadas.length, 0);
});
