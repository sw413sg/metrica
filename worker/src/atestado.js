// App Attest (DCAppAttestService): que los pedidos a /ia vengan de la app de Métrica de verdad, en un
// iPhone de verdad, y que cada clave quede atada a un solo X-Metrica-Id. Sin esto, cualquiera podía
// inventar ids desde un script y tener 20 créditos gratis por cada uno (el tope de la IP era el único
// freno, y en datos móviles muchos comparten la IP).
//
// 1. La app pide un reto (POST /ia/reto), crea una clave en el Secure Enclave y la hace certificar por
//    Apple con clientDataHash = SHA-256(«reto\nid»). Manda el objeto a POST /ia/atestiguar.
// 2. Acá se verifica la cadena hasta Apple App Attestation Root CA, el nonce, el App ID, el contador y
//    el keyId, y se guarda la clave pública atada a ese id (Durable Object `Atestados`).
// 3. Cada pedido a /ia lleva X-Metrica-Clave (keyId) y X-Metrica-Atestado (una afirmación firmada con
//    esa clave sobre SHA-256(«id\n» + cuerpo)). El contador de la afirmación no se puede repetir.
//
// Reinstalar la app crea otra clave, pero el id vive en el llavero (Keychain) y sobrevive: la clave
// nueva se ata al mismo id y la cuota sigue donde estaba.
import { APPLE_ATESTADO_RAIZ_B64 } from './raiz-apple.js';
import { desdeBase64, leerDer, extension, parsearCert, vigente, verificarFirma, iguales } from './verificar.js';

export const APPLE_ATESTADO_RAIZ = desdeBase64(APPLE_ATESTADO_RAIZ_B64);
const OID_NONCE = '1.2.840.113635.100.8.2';
const AAGUID_PRODUCCION = 'appattest\0\0\0\0\0\0\0';
const AAGUID_DESARROLLO = 'appattestdevelop';
const RETO_VIGENTE = 5 * 60 * 1000;
// Las afirmaciones pueden llegar desordenadas (la web vinculada pide el cupo mientras se hace una
// consulta): vale cualquier contador nuevo dentro de esta ventana, nunca uno repetido.
const VENTANA = 20;

const texto = s => new TextEncoder().encode(s);

async function sha256(...partes) {
    const largo = partes.reduce((n, p) => n + p.length, 0);
    const todo = new Uint8Array(largo);
    let i = 0;
    for (const p of partes) { todo.set(p, i); i += p.length; }
    return new Uint8Array(await crypto.subtle.digest('SHA-256', todo));
}

export function aBase64(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

// CBOR mínimo (lo que usa Apple: mapas, listas, bytes, textos y enteros).
export function leerCbor(buf) {
    let i = 0;
    const largo = info => {
        if (info < 24) return info;
        const n = { 24: 1, 25: 2, 26: 4, 27: 8 }[info];
        if (!n || i + n > buf.length) throw new Error('cbor');
        let v = 0;
        for (let k = 0; k < n; k++) v = v * 256 + buf[i++];
        return v;
    };
    const leer = (profundidad = 0) => {
        if (profundidad > 8 || i >= buf.length) throw new Error('cbor');
        const inicial = buf[i++];
        const tipo = inicial >> 5;
        const n = largo(inicial & 0x1f);
        switch (tipo) {
        case 0: return n;
        case 1: return -1 - n;
        case 2:
        case 3: {
            if (i + n > buf.length) throw new Error('cbor');
            const bytes = buf.subarray(i, i + n);
            i += n;
            return tipo === 2 ? bytes : new TextDecoder().decode(bytes);
        }
        case 4: {
            if (n > 64) throw new Error('cbor');
            return Array.from({ length: n }, () => leer(profundidad + 1));
        }
        case 5: {
            if (n > 64) throw new Error('cbor');
            const mapa = {};
            for (let k = 0; k < n; k++) {
                const clave = leer(profundidad + 1);
                mapa[String(clave)] = leer(profundidad + 1);
            }
            return mapa;
        }
        case 6: return leer(profundidad + 1);
        default:
            if ((inicial & 0x1f) === 20) return false;
            if ((inicial & 0x1f) === 21) return true;
            if ((inicial & 0x1f) === 22) return null;
            throw new Error('cbor');
        }
    };
    return leer();
}

function leerAuthData(datos) {
    if (!(datos instanceof Uint8Array) || datos.length < 37) throw new Error('authData');
    const contador = ((datos[33] << 24) >>> 0) + (datos[34] << 16) + (datos[35] << 8) + datos[36];
    const salida = { rpIdHash: datos.subarray(0, 32), contador };
    if (datos.length >= 55) {
        salida.aaguid = new TextDecoder().decode(datos.subarray(37, 53));
        const largoId = (datos[53] << 8) + datos[54];
        salida.credId = datos.subarray(55, 55 + largoId);
    }
    return salida;
}

export const hashDeAtestado = (reto, id) => sha256(texto(`${reto}\n${id}`));
export const hashDeAfirmacion = (id, cuerpo) => sha256(texto(`${id}\n`), cuerpo);

// { ok, publica (SPKI en base64), entorno } o { ok: false, error }. `appId` es «TEAMID.bundle».
export async function verificarAtestado({ keyId, atestado, reto, id, appId, raiz = APPLE_ATESTADO_RAIZ, ahora = Date.now() }) {
    try {
        const objeto = leerCbor(desdeBase64(atestado));
        if (objeto.fmt !== 'apple-appattest') return { ok: false, error: 'formato' };
        const x5c = objeto.attStmt?.x5c;
        if (!Array.isArray(x5c) || x5c.length !== 2) return { ok: false, error: 'cadena' };
        const [hoja, media] = x5c.map(c => parsearCert(c));
        const raizCert = parsearCert(raiz);
        // Hoja ← intermedia ← raíz de Apple (embebida: la que viniera en el objeto no se cree).
        if (!media.ca || ![hoja, media, raizCert].every(c => vigente(c, ahora))) return { ok: false, error: 'cadena' };
        if (!await verificarFirma(media.spki, media.curva, media.tam, hoja.hash, hoja.firma, hoja.tbs)) return { ok: false, error: 'cadena' };
        if (!await verificarFirma(raizCert.spki, raizCert.curva, raizCert.tam, media.hash, media.firma, media.tbs)) return { ok: false, error: 'cadena' };
        if (hoja.curva !== 'P-256') return { ok: false, error: 'cadena' };
        // El nonce del certificado es SHA-256(authData + clientDataHash).
        const authData = objeto.authData;
        const nonce = await sha256(authData, await hashDeAtestado(reto, id));
        const ext = extension(hoja, OID_NONCE);
        const envuelto = ext && leerDer(ext.hijos.at(-1).valor);
        const enCert = envuelto?.hijos?.[0]?.hijos?.[0]?.valor;
        if (!enCert || !iguales(enCert, nonce)) return { ok: false, error: 'nonce' };
        // keyId = SHA-256 de la clave pública (el punto sin comprimir, los últimos 65 bytes del SPKI).
        const idClave = desdeBase64(keyId);
        if (!iguales(await sha256(hoja.spki.subarray(hoja.spki.length - 65)), idClave)) return { ok: false, error: 'clave' };
        const auth = leerAuthData(authData);
        if (!iguales(auth.rpIdHash, await sha256(texto(appId)))) return { ok: false, error: 'app' };
        if (auth.contador !== 0) return { ok: false, error: 'contador' };
        if (auth.aaguid !== AAGUID_PRODUCCION && auth.aaguid !== AAGUID_DESARROLLO) return { ok: false, error: 'entorno' };
        if (!auth.credId || !iguales(auth.credId, idClave)) return { ok: false, error: 'clave' };
        return { ok: true, publica: aBase64(hoja.spki), entorno: auth.aaguid === AAGUID_DESARROLLO ? 'desarrollo' : 'produccion' };
    } catch {
        return { ok: false, error: 'formato' };
    }
}

// { ok, contador } o { ok: false }. La firma es ECDSA P-256 / SHA-256 sobre SHA-256(authData + clientDataHash).
export async function verificarAfirmacion({ afirmacion, publica, clientDataHash, appId }) {
    try {
        const objeto = leerCbor(desdeBase64(afirmacion));
        const authData = objeto.authenticatorData;
        const firma = objeto.signature;
        if (!(authData instanceof Uint8Array) || !(firma instanceof Uint8Array)) return { ok: false };
        const auth = leerAuthData(authData);
        if (!iguales(auth.rpIdHash, await sha256(texto(appId)))) return { ok: false };
        const nonce = await sha256(authData, clientDataHash);
        if (!await verificarFirma(desdeBase64(publica), 'P-256', 32, 'SHA-256', firma, nonce)) return { ok: false };
        return { ok: true, contador: auth.contador };
    } catch {
        return { ok: false };
    }
}

// Las claves y los retos, en un Durable Object (uno solo): registrar una clave y gastar un contador son
// transacciones, así dos pedidos a la vez no usan el mismo contador.
export class Atestados {
    constructor(ctx) {
        this.ctx = ctx;
    }

    async fetch(request) {
        const p = await request.json();
        const s = this.ctx.storage;
        if (p.accion === 'reto') {
            const reto = aBase64(crypto.getRandomValues(new Uint8Array(24))).replace(/[+/=]/g, '');
            await s.put(`reto:${reto}`, p.ahora);
            if (await s.getAlarm() == null) await s.setAlarm(p.ahora + 2 * RETO_VIGENTE);
            return Response.json({ reto });
        }
        if (p.accion === 'registrar') {
            const ok = await s.transaction(async txn => {
                const creado = await txn.get(`reto:${p.reto}`);
                if (creado == null || p.ahora - creado > RETO_VIGENTE) return false;
                await txn.delete(`reto:${p.reto}`);
                await txn.put(`clave:${p.keyId}`, { id: p.id, publica: p.publica, entorno: p.entorno, maximo: 0, usados: [], creada: p.ahora });
                const previo = await txn.get(`id:${p.id}`);
                await txn.put(`id:${p.id}`, { claves: (previo?.claves ?? 0) + 1, desde: previo?.desde ?? p.ahora });
                return true;
            });
            return Response.json({ ok });
        }
        if (p.accion === 'clave') return Response.json({ clave: (await s.get(`clave:${p.keyId}`)) ?? null });
        if (p.accion === 'contador') {
            const ok = await s.transaction(async txn => {
                const clave = await txn.get(`clave:${p.keyId}`);
                if (!clave || clave.id !== p.id) return false;
                const n = p.contador;
                if (!Number.isInteger(n) || n <= clave.maximo - VENTANA || clave.usados.includes(n)) return false;
                clave.usados = [...clave.usados, n].slice(-VENTANA);
                clave.maximo = Math.max(clave.maximo, n);
                await txn.put(`clave:${p.keyId}`, clave);
                return true;
            });
            return Response.json({ ok });
        }
        if (p.accion === 'id') return Response.json({ atestado: (await s.get(`id:${p.id}`)) != null });
        return Response.json({ error: 'accion' }, { status: 400 });
    }

    // Borra los retos que nadie usó.
    async alarm() {
        const ahora = Date.now();
        const viejos = [...(await this.ctx.storage.list({ prefix: 'reto:' }))].filter(([, t]) => ahora - t > RETO_VIGENTE).map(([k]) => k);
        for (let i = 0; i < viejos.length; i += 128) await this.ctx.storage.delete(viejos.slice(i, i + 128));
        if ((await this.ctx.storage.list({ prefix: 'reto:', limit: 1 })).size) await this.ctx.storage.setAlarm(ahora + 2 * RETO_VIGENTE);
    }
}

export const NOMBRE_ATESTADOS = 'metrica-atestados';

function llamar(env, pedido) {
    const stub = env.ATESTADOS.get(env.ATESTADOS.idFromName(NOMBRE_ATESTADOS));
    return stub.fetch('https://atestados.internal/', { method: 'POST', body: JSON.stringify(pedido) }).then(r => r.json());
}

export const appIdDe = env => `${env.TEAM_ID || '6VAZAKJKS7'}.${env.BUNDLE_ID || 'com.sw413sg.metrica'}`;
const ID = /^[a-z0-9]{16,64}$/;
const KEY_ID = /^[A-Za-z0-9+/]{43}=$/;

// POST /ia/reto y POST /ia/atestiguar (solo la app nativa).
export async function rutaAtestado(request, env, responder, ruta, raiz) {
    if (!env.ATESTADOS) return responder({ error: 'atestado' }, 503);
    const ahora = Date.now();
    if (ruta === '/ia/reto') return responder(await llamar(env, { accion: 'reto', ahora }));
    let cuerpo;
    try { cuerpo = await request.json(); } catch { return responder({ error: 'json' }, 400); }
    const { keyId, atestado, reto, id } = cuerpo ?? {};
    if (!KEY_ID.test(keyId ?? '') || !ID.test(id ?? '') || typeof reto !== 'string' || reto.length > 64
        || typeof atestado !== 'string' || atestado.length > 20_000) return responder({ error: 'pedido' }, 400);
    const verificado = await verificarAtestado({ keyId, atestado, reto, id, appId: appIdDe(env), raiz, ahora });
    if (!verificado.ok) {
        console.log('App Attest no verificó:', verificado.error);
        return responder({ error: 'atestado', motivo: verificado.error }, 401);
    }
    const { ok } = await llamar(env, { accion: 'registrar', keyId, id, reto, publica: verificado.publica, entorno: verificado.entorno, ahora });
    return ok ? responder({ ok: true }) : responder({ error: 'reto' }, 401);
}

// Para /ia desde la app: { ok } si la afirmación vale para este id y este cuerpo; { ok: false } si no.
export async function afirmacionValida(request, env, id, cuerpo) {
    const keyId = request.headers.get('X-Metrica-Clave') ?? '';
    const afirmacion = request.headers.get('X-Metrica-Atestado') ?? '';
    if (!env.ATESTADOS || !KEY_ID.test(keyId) || !afirmacion || afirmacion.length > 4000) return { ok: false };
    const { clave } = await llamar(env, { accion: 'clave', keyId });
    if (!clave || clave.id !== id) return { ok: false };
    const firmada = await verificarAfirmacion({ afirmacion, publica: clave.publica, clientDataHash: await hashDeAfirmacion(id, cuerpo), appId: appIdDe(env) });
    if (!firmada.ok) return { ok: false };
    return llamar(env, { accion: 'contador', keyId, id, contador: firmada.contador });
}

// Desde la web: si el id que dejó el iPhone vinculado ya se atestiguó alguna vez.
export async function idAtestado(env, id) {
    if (!env.ATESTADOS) return false;
    return (await llamar(env, { accion: 'id', id })).atestado === true;
}
