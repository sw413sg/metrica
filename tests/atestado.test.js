// App Attest en el Worker: una CA de prueba hace de Apple App Attestation Root CA.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, sign } from 'node:crypto';
import worker from '../worker/src/index.js';
import { Cuota } from '../worker/src/cuota-do.js';
import { Atestados, leerCbor } from '../worker/src/atestado.js';
import { fraseElegida } from '../js/logica/ia.js';
import { tlv, seq, nombre, extension, emitir, par, EXT_CA } from './cadena-prueba.js';

const LETRA = 'Te busco en el balcón sin razón\ny me quedo solo con mi canción';
const { pedido } = fraseElegida(LETRA, LETRA.indexOf('me quedo'), LETRA.length);
const ID = 'abcdefghij0123456789';
const APP_ID = '6VAZAKJKS7.app.metrica.prueba';
const sha = (...partes) => createHash('sha256').update(Buffer.concat(partes.map(p => Buffer.from(p)))).digest();

// CBOR mínimo para armar lo que manda el iPhone.
function cbor(v) {
    const cab = (tipo, n) => (n < 24 ? Buffer.from([(tipo << 5) | n]) : n < 256 ? Buffer.from([(tipo << 5) | 24, n]) : Buffer.from([(tipo << 5) | 25, n >> 8, n & 0xff]));
    if (typeof v === 'number') return cab(0, v);
    if (typeof v === 'string') return Buffer.concat([cab(3, Buffer.byteLength(v)), Buffer.from(v)]);
    if (Buffer.isBuffer(v)) return Buffer.concat([cab(2, v.length), v]);
    if (Array.isArray(v)) return Buffer.concat([cab(4, v.length), ...v.map(cbor)]);
    const pares = Object.entries(v);
    return Buffer.concat([cab(5, pares.length), ...pares.flatMap(([k, x]) => [cbor(k), cbor(x)])]);
}

function almacenDO() {
    const datos = new Map();
    let alarma = null;
    const txn = {
        get: async k => datos.get(k),
        put: async (k, v) => { datos.set(k, structuredClone(v)); },
        delete: async k => { for (const x of [k].flat()) datos.delete(x); },
    };
    let cola = Promise.resolve();
    return {
        datos,
        ...txn,
        transaction(fn) { const corre = cola.then(() => fn(txn)); cola = corre.then(() => {}, () => {}); return corre; },
        getAlarm: async () => alarma,
        setAlarm: async t => { alarma = t; },
        list: async ({ prefix, limit = Infinity }) => new Map([...datos].filter(([k]) => k.startsWith(prefix)).slice(0, limit)),
    };
}

function binding(Clase) {
    const storage = almacenDO();
    const objeto = new Clase({ storage });
    return { storage, idFromName: () => 'uno', get: () => ({ fetch: (input, init) => objeto.fetch(new Request(input, init)) }) };
}

// La raíz y la intermedia de prueba (P-384, como las de Apple) y un iPhone con su clave P-256.
const raiz = par('P-384');
const media = par('P-384');
const nombreRaiz = nombre('Raiz de prueba');
const nombreMedia = nombre('Intermedia de prueba');
const desde = Date.UTC(2024, 0, 1), hasta = Date.UTC(2040, 0, 1);
const certRaiz = emitir({ serial: 1, emisor: nombreRaiz, sujeto: nombreRaiz, publica: raiz.publicKey, firmante: raiz.privateKey, curvaFirmante: 'P-384', notBefore: desde, notAfter: hasta, extensiones: [EXT_CA] });
const certMedia = emitir({ serial: 2, emisor: nombreRaiz, sujeto: nombreMedia, publica: media.publicKey, firmante: raiz.privateKey, curvaFirmante: 'P-384', notBefore: desde, notAfter: hasta, extensiones: [EXT_CA] });

function iPhone({ appId = APP_ID, aaguid = 'appattestdevelop' } = {}) {
    const clave = par('P-256');
    const punto = clave.publicKey.export({ type: 'spki', format: 'der' }).subarray(-65);
    const idClave = sha(punto);
    const keyId = idClave.toString('base64');
    let contador = 0;
    return {
        keyId,
        atestar(reto, id, { nonceMalo = false } = {}) {
            const authData = Buffer.concat([sha(appId), Buffer.from([0x40]), Buffer.alloc(4), Buffer.from(aaguid.padEnd(16, '\0')), Buffer.from([0, 32]), idClave]);
            const nonce = sha(authData, sha(`${reto}\n${id}`));
            if (nonceMalo) nonce[0] ^= 1;
            const ext = extension('1.2.840.113635.100.8.2', seq(tlv(0xa1, tlv(0x04, nonce))));
            const hoja = emitir({ serial: 3, emisor: nombreMedia, sujeto: nombre('Hoja'), publica: clave.publicKey, firmante: media.privateKey, curvaFirmante: 'P-384', notBefore: desde, notAfter: hasta, extensiones: [ext] });
            return cbor({ fmt: 'apple-appattest', attStmt: { x5c: [hoja, certMedia], receipt: Buffer.alloc(0) }, authData }).toString('base64');
        },
        afirmar(id, cuerpo, n = ++contador) {
            const authData = Buffer.concat([sha(appId), Buffer.from([0x40]), Buffer.from([n >> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])]);
            const nonce = sha(authData, sha(`${id}\n`, cuerpo));
            return cbor({ signature: sign('sha256', nonce, clave.privateKey), authenticatorData: authData }).toString('base64');
        },
    };
}

let env, fetchOriginal;
beforeEach(() => {
    env = {
        CUPO_GRATIS: '20', TOPE_IP: '1', TOPE_DIA: '100', OPENAI_API_KEY: 'sk', BUNDLE_ID: 'app.metrica.prueba', TEAM_ID: '6VAZAKJKS7',
        APP_ATTEST: 'pedir', PRUEBA: 'si', RAIZ_ATESTADO_DE_PRUEBA: certRaiz.toString('base64'),
        ORIGENES: 'https://sw413sg.github.io',
        CUOTA: (() => { const b = binding(Cuota); b.get = (() => { const o = new Cuota({ storage: b.storage }); return () => ({ fetch: (i, init) => o.fetch(new Request(i, init)) }); })(); return b; })(),
        ATESTADOS: binding(Atestados),
    };
    fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"sugerencias":["me quedo solo con mi perdón"]}' } }] }));
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

const llamar = (ruta, cuerpo, cabeceras = {}) => worker.fetch(new Request(`https://metrica.ejemplo${ruta}`, {
    method: 'POST', body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), headers: { 'Content-Type': 'application/json', ...cabeceras },
}), env);

async function registrar(tel, id = ID, opciones) {
    const { reto } = await (await llamar('/ia/reto', {})).json();
    return llamar('/ia/atestiguar', { keyId: tel.keyId, atestado: tel.atestar(reto, id, opciones), reto, id });
}

async function consulta(tel, id = ID, n) {
    const cuerpo = JSON.stringify({ pedido });
    return llamar('/ia', cuerpo, { 'X-Metrica-Id': id, 'X-Metrica-Clave': tel.keyId, 'X-Metrica-Atestado': tel.afirmar(id, cuerpo, n) });
}

test('el CBOR de prueba se lee', () => {
    assert.deepEqual(leerCbor(new Uint8Array(cbor({ a: [1, 'x'] }))), { a: [1, 'x'] });
});

test('una clave atestiguada consulta y no cuenta en el tope de la IP', async () => {
    const tel = iPhone();
    assert.equal((await registrar(tel)).status, 200);
    for (const quedan of [19, 18]) {
        const respuesta = await consulta(tel);
        assert.equal(respuesta.status, 200);
        assert.equal((await respuesta.json()).quedan, quedan);
    }
    // Sin atestiguar, con la misma IP, el tope de 1 sigue valiendo.
    const viejo = await llamar('/ia', { pedido }, { 'X-Metrica-Id': 'otroid0000000000' });
    assert.equal((await viejo.json()).quedan, 0);
});

test('reinstalar: una clave nueva con el mismo id sigue con la misma cuota', async () => {
    const primera = iPhone();
    await registrar(primera);
    await consulta(primera);
    const segunda = iPhone();
    await registrar(segunda);
    assert.equal((await (await consulta(segunda)).json()).quedan, 18);
});

test('un contador repetido, otro id, otro cuerpo o una clave sin registrar dan 401', async () => {
    const tel = iPhone();
    await registrar(tel);
    assert.equal((await consulta(tel, ID, 5)).status, 200);
    assert.equal((await consulta(tel, ID, 5)).status, 401);
    // Desordenadas dentro de la ventana valen.
    assert.equal((await consulta(tel, ID, 3)).status, 200);
    assert.equal((await consulta(tel, 'otroid0000000000')).status, 401);
    const cuerpo = JSON.stringify({ pedido });
    const firmaDeOtro = tel.afirmar(ID, '{"pedido":{}}');
    assert.equal((await llamar('/ia', cuerpo, { 'X-Metrica-Id': ID, 'X-Metrica-Clave': tel.keyId, 'X-Metrica-Atestado': firmaDeOtro })).status, 401);
    assert.equal((await consulta(iPhone())).status, 401);
});

test('el atestado se rechaza con otro App ID, otro nonce o un reto usado', async () => {
    assert.equal((await registrar(iPhone({ appId: 'OTRO.app.metrica.prueba' }))).status, 401);
    assert.equal((await registrar(iPhone(), ID, { nonceMalo: true })).status, 401);
    assert.equal((await registrar(iPhone({ aaguid: 'otracosa' }))).status, 401);
    const tel = iPhone();
    const { reto } = await (await llamar('/ia/reto', {})).json();
    const atestado = tel.atestar(reto, ID);
    assert.equal((await llamar('/ia/atestiguar', { keyId: tel.keyId, atestado, reto, id: ID })).status, 200);
    assert.equal((await llamar('/ia/atestiguar', { keyId: tel.keyId, atestado, reto, id: ID })).status, 401);
    // El reto no se pide desde un navegador.
    assert.equal((await llamar('/ia/reto', {}, { Origin: 'https://sw413sg.github.io' })).status, 403);
});

test('con «exigir», sin firma no hay IA', async () => {
    env.APP_ATTEST = 'exigir';
    assert.equal((await llamar('/ia', { pedido }, { 'X-Metrica-Id': ID })).status, 401);
    const tel = iPhone();
    await registrar(tel);
    assert.equal((await consulta(tel)).status, 200);
});
