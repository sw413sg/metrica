import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { Cuota } from '../worker/src/cuota-do.js';
import { fraseElegida } from '../js/logica/ia.js';
import { crearCadena, romperFirma } from './cadena-prueba.js';

const LETRA = 'Te busco en el balcón sin razón\ny me quedo solo con mi canción';
const { pedido } = fraseElegida(LETRA, LETRA.indexOf('me quedo'), LETRA.length);
const ID = 'abcdefghij0123456789';
const OTRO = 'zzzzzzzzzzzzzzzz';
let env, llamadas, fetchOriginal, cadena;

// El mismo almacenamiento transaccional que el Durable Object: los pedidos en paralelo
// entran de a uno, así el segundo ve lo que escribió el primero.
function cuotaDePrueba() {
    const datos = new Map();
    let cola = Promise.resolve();
    const storage = {
        transaction(fn) {
            const corre = cola.then(async () => {
                const copia = new Map(datos);
                const txn = {
                    get: async k => copia.has(k) ? copia.get(k) : undefined,
                    put: async (k, v) => { copia.set(k, v); },
                    delete: async k => { copia.delete(k); },
                };
                const resultado = await fn(txn);
                datos.clear();
                for (const [k, v] of copia) datos.set(k, v);
                return resultado;
            });
            cola = corre.then(() => {}, () => {});
            return corre;
        },
    };
    const objeto = new Cuota({ storage });
    return {
        datos,
        idFromName: () => 'metrica-cuota',
        get: () => ({ fetch: (input, init) => objeto.fetch(new Request(input, init)) }),
    };
}

before(async () => { cadena = crearCadena(); });

beforeEach(() => {
    const kv = new Map();
    env = {
        ORIGENES: 'https://sw413sg.github.io', ESFUERZO: 'low', ESFUERZO_REVISION: 'medium', CUPO_GRATIS: '2', TOPE_DIA: '100', TOPE_IP: '100',
        SANDBOX_CONSULTAS_MES: '30', OPENAI_API_KEY: 'sk-prueba', BUNDLE_ID: 'app.metrica.prueba',
        USO: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) },
        CUOTA: cuotaDePrueba(),
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
    assert.equal(llamadas[0].cuerpo.reasoning_effort, 'low');
    assert.match(llamadas[0].cuerpo.messages[1].content, /rimar con «canción»/);
    assert.equal(respuesta.headers.get('Access-Control-Allow-Origin'), 'https://sw413sg.github.io');
    assert.equal(respuesta.headers.get('X-Metrica-Restantes'), '1');
});

test('el Worker corta al llegar al cupo del mes', async () => {
    await pedir();
    await pedir();
    const respuesta = await pedir();
    assert.equal(respuesta.status, 402);
    assert.equal(respuesta.headers.get('X-Metrica-Restantes'), '0');
    assert.equal((await respuesta.json()).error, 'cupo');
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
    env.CUPO_GRATIS = '10'; // la letra entera gasta 2 o más
    globalThis.fetch = async (url, opciones) => {
        llamadas.push(JSON.parse(opciones.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":[{"titulo":"Cambiar la palabra «canción» por «pasión»","verso":1,"viejo":"canción","nuevo":"pasión"}]}' } }] }));
    };
    const revision = { versos: [{ n: 0, texto: 'Te busco en el balcón', silabas: 7, estrofa: 0 }, { n: 1, texto: 'y me quedo con mi canción', silabas: 9, estrofa: 0 }] };
    const respuesta = await pedir({ revision });
    assert.equal(respuesta.status, 200);
    assert.deepEqual((await respuesta.json()).sugerencias, [{ titulo: 'Cambiar la palabra «canción» por «pasión»', verso: 1, viejo: 'canción', nuevo: 'pasión' }]);
    assert.match(llamadas[0].messages[1].content, /1 \(9\) y me quedo con mi canción/);
    // La letra entera piensa más (ESFUERZO_REVISION) y busca sentido y métrica despareja.
    assert.equal(llamadas[0].reasoning_effort, 'medium');
    assert.match(llamadas[0].messages[0].content, /Métrica despareja/);
    assert.equal((await pedir({ revision: { versos: 'todo' } })).status, 400);
});

test('la letra entera (corta) gasta 2 de la cuota y no se pide si no alcanza', async () => {
    env.CUPO_GRATIS = '3';
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":[{"titulo":"t","verso":1,"viejo":"canción","nuevo":"pasión"}]}' } }] }));
    const revision = { versos: [{ n: 0, texto: 'Te busco en el balcón', silabas: 7, estrofa: 0 }, { n: 1, texto: 'y me quedo con mi canción', silabas: 9, estrofa: 0 }] };
    assert.equal((await (await pedir({ revision })).json()).quedan, 1);
    assert.equal((await pedir({ revision })).status, 402);
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":["uno"]}' } }] }));
    const respuesta = await pedir();
    assert.equal(respuesta.status, 200);
    assert.equal((await respuesta.json()).quedan, 0);
    // Una letra de más de 40 versos gasta 4.
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":[{"titulo":"t","verso":1,"viejo":"canción","nuevo":"pasión"}]}' } }] }));
    env.CUPO_GRATIS = '100';
    const larga = { versos: Array.from({ length: 41 }, (_, n) => ({ n, texto: 'y me quedo con mi canción', silabas: 9, estrofa: 0 })) };
    assert.equal((await (await pedir({ revision: larga })).json()).quedan, 100 - 3 - 4);
});

test('la letra entera sin cambios no gasta, hasta 10 por mes', async () => {
    env.CUPO_GRATIS = '20';
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":[]}' } }] }));
    const revision = { versos: [{ n: 0, texto: 'Te busco en el balcón', silabas: 7, estrofa: 0 }, { n: 1, texto: 'y me quedo con mi canción', silabas: 9, estrofa: 0 }] };
    for (let i = 0; i < 10; i++) {
        const respuesta = await pedir({ revision });
        assert.equal(respuesta.status, 200);
        assert.deepEqual(await respuesta.json(), { sugerencias: [], quedan: 20 });
    }
    assert.equal((await (await pedir({ revision })).json()).quedan, 18);
    // Un texto que no se puede leer sigue siendo un error, y no gasta.
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'nada' } }] }));
    assert.equal((await pedir({ revision })).status, 502);
});

test('X-Metrica-Plan y X-Metrica-Extra no suman cuota', async () => {
    const respuesta = await pedir(undefined, { 'X-Metrica-Plan': 'metrica.ia', 'X-Metrica-Extra': '999999' });
    assert.equal(respuesta.status, 200);
    assert.equal((await respuesta.json()).quedan, 1);
});

function conRaiz() {
    env.PRUEBA = 'si';
    env.RAIZ_DE_PRUEBA = cadena.raizB64;
    env.CUPO_GRATIS = '0';
}

test('un JWS válido de la suscripción da 300 y el header de restantes', async () => {
    conRaiz();
    const jws = cadena.jws({ transactionId: 'sub1', originalTransactionId: 'sub1' });
    const respuesta = await pedir(undefined, { 'X-Metrica-JWS': jws });
    assert.equal(respuesta.status, 200);
    assert.equal((await respuesta.json()).quedan, 299);
    assert.equal(respuesta.headers.get('X-Metrica-Restantes'), '299');
    assert.equal((await (await pedir(undefined, { 'X-Metrica-JWS': jws })).json()).quedan, 298);
});

test('una firma mala se rechaza y no llama a OpenAI', async () => {
    conRaiz();
    const jws = romperFirma(cadena.jws({ transactionId: 'sub2', originalTransactionId: 'sub2' }));
    const respuesta = await pedir(undefined, { 'X-Metrica-JWS': jws });
    assert.equal(respuesta.status, 401);
    assert.equal((await respuesta.json()).error, 'firma');
    assert.equal(llamadas.length, 0);
});

test('una cadena que no llega a Apple Root CA - G3 se rechaza', async () => {
    const jws = cadena.jws({ transactionId: 'sub3', originalTransactionId: 'sub3' });
    const respuesta = await pedir(undefined, { 'X-Metrica-JWS': jws });
    assert.equal(respuesta.status, 401);
    assert.equal((await respuesta.json()).error, 'firma');
    assert.equal(llamadas.length, 0);
});

test('una suscripción vencida no da las 300', async () => {
    conRaiz();
    env.CUPO_GRATIS = '2';
    const jws = cadena.jws({ transactionId: 'sub4', originalTransactionId: 'sub4', expiresDate: Date.now() - 60_000 });
    const respuesta = await pedir(undefined, { 'X-Metrica-JWS': jws });
    assert.equal(respuesta.status, 200);
    assert.equal((await respuesta.json()).quedan, 1);
});

test('el mismo transactionId de un paquete no suma dos veces', async () => {
    conRaiz();
    const jws = cadena.jws({
        productId: 'metrica.ia.mas', type: 'Consumable', transactionId: 'paq1', originalTransactionId: 'paq1',
    });
    const primera = await pedir(undefined, { 'X-Metrica-JWS': jws });
    assert.equal((await primera.json()).quedan, 299);
    const segunda = await pedir(undefined, { 'X-Metrica-JWS': jws });
    assert.equal((await segunda.json()).quedan, 298);
    // Otro id, el mismo JWS: comparte la bolsa, no la vuelve a llenar.
    const otra = await pedir(undefined, { 'X-Metrica-JWS': jws, 'X-Metrica-Id': OTRO });
    assert.equal((await otra.json()).quedan, 297);
});

test('sin cuota responde 402 y X-Metrica-Restantes en 0', async () => {
    conRaiz();
    env.CUOTA.datos.set('cuota:bolsa:paq2', '0');
    const jws = cadena.jws({
        productId: 'metrica.ia.mas5', type: 'Consumable', transactionId: 'paq2', originalTransactionId: 'paq2',
    });
    const respuesta = await pedir(undefined, { 'X-Metrica-JWS': jws });
    assert.equal(respuesta.status, 402);
    assert.equal(respuesta.headers.get('X-Metrica-Restantes'), '0');
    assert.equal(llamadas.length, 0);
});

test('Sandbox con mas50 da solo el tope, no las 8500', async () => {
    conRaiz();
    env.CUPO_GRATIS = '20';
    env.SANDBOX_CONSULTAS_MES = '30';
    env.TOPE_IP = '1';
    const jws = cadena.jws({
        productId: 'metrica.ia.mas50', type: 'Consumable', transactionId: 'sb50', originalTransactionId: 'sb50',
        environment: 'Sandbox',
    });
    const respuesta = await pedir(undefined, { 'X-Metrica-JWS': jws });
    assert.equal(respuesta.status, 200);
    assert.equal((await respuesta.json()).quedan, 29);
    env.TOPE_IP = '100';
    const real = cadena.jws({
        productId: 'metrica.ia.mas50', type: 'Consumable', transactionId: 'pr50', originalTransactionId: 'pr50',
        environment: 'Production',
    });
    // La de Production sí suma las 8.500, además de las 20 gratis.
    assert.equal((await (await pedir(undefined, { 'X-Metrica-JWS': real })).json()).quedan, 20 + 8500 - 1);
});

test('dos pedidos en paralelo no inflan la bolsa', async () => {
    conRaiz();
    const jws = cadena.jws({
        productId: 'metrica.ia.mas', type: 'Consumable', transactionId: 'paralelo', originalTransactionId: 'paralelo',
    });
    const [a, b] = await Promise.all([
        pedir(undefined, { 'X-Metrica-JWS': jws }),
        pedir(undefined, { 'X-Metrica-JWS': jws }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const quedans = [await a.json(), await b.json()].map(d => d.quedan).sort((x, y) => x - y);
    assert.deepEqual(quedans, [298, 299]);
    assert.equal(env.CUOTA.datos.get('cuota:bolsa:paralelo'), '298');
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
    assert.deepEqual({ ...datos, nombres: undefined }, { ok: true, modelo: 'gpt-6.1-terra', clave: true, kv: true, cuota: true, nombres: undefined });
    assert.ok(datos.nombres.includes('OPENAI_API_KEY'));
    assert.ok(!JSON.stringify(datos).includes('sk-prueba'));
    assert.equal(llamadas.length, 0);
});

test('/probar dice el error de OpenAI tal cual y tiene tope propio', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Unsupported value: reasoning_effort' } }), { status: 400 });
    const probar = () => worker.fetch(new Request('https://metrica.ejemplo/probar'), env);
    assert.deepEqual(await (await probar()).json(), { ok: false, error: '400: Unsupported value: reasoning_effort' });
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":["hola"]}' } }] }));
    assert.deepEqual(await (await probar()).json(), { ok: true, respuesta: '{"sugerencias":["hola"]}' });
    for (let i = 0; i < 28; i++) await probar();
    assert.equal((await probar()).status, 429);
});

test('sin ESFUERZO no se manda reasoning_effort (queda el de OpenAI)', async () => {
    delete env.ESFUERZO;
    await pedir();
    assert.equal('reasoning_effort' in llamadas[0].cuerpo, false);
});

test('el Worker también propone de qué hablar en una canción, sin repetir las ya vistas', async () => {
    globalThis.fetch = async (url, opciones) => {
        llamadas.push(JSON.parse(opciones.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":["«Contá la última noche en el barrio antes de mudarte»","Contá la última noche en el barrio antes de mudarte","Escribile a tu abuela lo que nunca le dijiste"]}' } }] }));
    };
    const respuesta = await pedir({ temas: { vistas: ['Hablá del primer sueldo'] } });
    assert.equal(respuesta.status, 200);
    assert.deepEqual((await respuesta.json()).sugerencias, ['Contá la última noche en el barrio antes de mudarte', 'Escribile a tu abuela lo que nunca le dijiste']);
    assert.match(llamadas[0].messages[0].content, /ideas de qué hablar en una canción/);
    assert.match(llamadas[0].messages[1].content, /- Hablá del primer sueldo/);
    assert.equal(llamadas[0].reasoning_effort, 'low');
    assert.equal((await pedir({ temas: { vistas: 'todo' } })).status, 400);
    assert.equal((await pedir({ temas: { vistas: Array(21).fill('idea') } })).status, 400);
});

test('el cupo gratis se cuenta por id y tiene tope por IP; una compra verificada no', async () => {
    env.CUPO_GRATIS = '5';
    env.TOPE_IP = '1';
    const ip = { 'CF-Connecting-IP': '203.0.113.8' };
    const primera = await pedir(undefined, ip);
    assert.equal(primera.headers.get('X-Metrica-Restantes'), '0');
    const mismaIp = await pedir(undefined, { ...ip, 'X-Metrica-Id': OTRO });
    assert.equal(mismaIp.status, 402);
    assert.equal(llamadas.length, 1);
    const otraIp = await pedir(undefined, { 'CF-Connecting-IP': '203.0.113.9', 'X-Metrica-Id': OTRO });
    assert.equal(otraIp.status, 200);
    conRaiz();
    env.TOPE_IP = '0';
    const jws = cadena.jws({ transactionId: 'sub5', originalTransactionId: 'sub5' });
    const paga = await pedir(undefined, { ...ip, 'X-Metrica-JWS': jws });
    assert.equal((await paga.json()).quedan, 299);
});
