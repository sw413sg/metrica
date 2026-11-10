// Verificación del JWS de StoreKit 2 (jwsRepresentation) con WebCrypto, sin librerías.
// La cadena x5c del header se chequea hasta Apple Root CA - G3 (embebida): la raíz que
// venga adentro del JWS no se cree. La firma del JWS es ES256 con la hoja. La raíz de
// Apple es P-384 / SHA-384; la hoja que firma la transacción es P-256.
import { APPLE_RAIZ_B64 } from './raiz-apple.js';

const OID_APPLE = '1.2.840.113635.100.6.11.1'; // hoja: firma de compras
const OID_WWDR = '1.2.840.113635.100.6.2.1'; // intermedio: Apple Worldwide Developer Relations
const OID_CA = '2.5.29.19';
const CURVAS = {
    '1.2.840.10045.3.1.7': { nombre: 'P-256', tam: 32 },
    '1.3.132.0.34': { nombre: 'P-384', tam: 48 },
};
const HASHES = {
    '1.2.840.10045.4.3.2': 'SHA-256',
    '1.2.840.10045.4.3.3': 'SHA-384',
    '1.2.840.10045.4.3.4': 'SHA-512',
};

export function desdeBase64(texto) {
    const limpio = String(texto).replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = limpio.length % 4 === 0 ? '' : '='.repeat(4 - (limpio.length % 4));
    const bin = atob(limpio + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export const APPLE_RAIZ = desdeBase64(APPLE_RAIZ_B64);

function copia(bytes) {
    const out = new Uint8Array(bytes.length);
    out.set(bytes);
    return out;
}

function leerDer(buf, i = 0) {
    if (i + 2 > buf.length) throw new Error('der');
    const tag = buf[i];
    let largo = buf[i + 1];
    let p = i + 2;
    if (largo & 0x80) {
        const n = largo & 0x7f;
        if (n === 0 || n > 4 || p + n > buf.length) throw new Error('der');
        largo = 0;
        for (let k = 0; k < n; k++) largo = largo * 256 + buf[p++];
    }
    const fin = p + largo;
    if (fin > buf.length) throw new Error('der');
    const hijos = [];
    // Construido: bit 6 del tag (SEQUENCE, SET o contexto explícito).
    if (tag & 0x20) {
        let q = p;
        while (q < fin) {
            const hijo = leerDer(buf, q);
            hijos.push(hijo);
            q = hijo.fin;
        }
        if (q !== fin) throw new Error('der');
    }
    return { tag, inicio: i, valor: buf.subarray(p, fin), fin, hijos };
}

function oidATexto(bytes) {
    if (!bytes.length) throw new Error('oid');
    const nums = [Math.floor(bytes[0] / 40), bytes[0] % 40];
    let valor = 0;
    for (let i = 1; i < bytes.length; i++) {
        valor = valor * 128 + (bytes[i] & 0x7f);
        if ((bytes[i] & 0x80) === 0) { nums.push(valor); valor = 0; }
    }
    return nums.join('.');
}

function leerFecha(nodo) {
    const s = new TextDecoder().decode(nodo.valor);
    const n = (desde, cuanto) => Number(s.slice(desde, desde + cuanto));
    let anio;
    let o;
    if (nodo.tag === 0x17) {
        anio = n(0, 2);
        anio += anio >= 50 ? 1900 : 2000;
        o = 2;
    } else if (nodo.tag === 0x18) {
        anio = n(0, 4);
        o = 4;
    } else throw new Error('fecha');
    return Date.UTC(anio, n(o, 2) - 1, n(o + 2, 2), n(o + 4, 2), n(o + 6, 2), n(o + 8, 2));
}

function extension(cert, oid) {
    if (!cert.extensiones) return null;
    const lista = cert.extensiones.hijos[0];
    for (const ext of lista?.hijos ?? []) {
        if (oidATexto(ext.hijos[0].valor) === oid) return ext;
    }
    return null;
}

function esCa(cert) {
    const ext = extension(cert, OID_CA);
    if (!ext) return false;
    const octeto = ext.hijos.at(-1)?.valor;
    if (!octeto) return false;
    for (let i = 0; i < octeto.length - 2; i++) {
        if (octeto[i] === 0x01 && octeto[i + 1] === 0x01 && octeto[i + 2] === 0xff) return true;
    }
    return false;
}

export function parsearCert(der) {
    const buf = der instanceof Uint8Array ? der : desdeBase64(der);
    const cert = leerDer(buf);
    if (cert.tag !== 0x30 || cert.hijos.length < 3) throw new Error('cert');
    const tbsNodo = cert.hijos[0];
    const hash = HASHES[oidATexto(cert.hijos[1].hijos[0].valor)];
    if (!hash) throw new Error('hash');
    // BIT STRING: el primer byte es cuántos bits sobran.
    const firma = cert.hijos[2].valor.subarray(1);
    let i = tbsNodo.hijos[0].tag === 0xa0 ? 1 : 0;
    i += 3; // serie, algoritmo, emisor
    const validez = tbsNodo.hijos[i++];
    i++; // sujeto
    const spki = tbsNodo.hijos[i];
    const curva = CURVAS[oidATexto(spki.hijos[0].hijos[1].valor)];
    if (!curva) throw new Error('curva');
    const parseado = {
        tbs: buf.subarray(tbsNodo.inicio, tbsNodo.fin),
        spki: buf.subarray(spki.inicio, spki.fin),
        firma,
        hash,
        curva: curva.nombre,
        tam: curva.tam,
        notBefore: leerFecha(validez.hijos[0]),
        notAfter: leerFecha(validez.hijos[1]),
        extensiones: tbsNodo.hijos.find(h => h.tag === 0xa3) ?? null,
    };
    parseado.ca = esCa(parseado);
    parseado.oidApple = Boolean(extension(parseado, OID_APPLE));
    parseado.oidWwdr = Boolean(extension(parseado, OID_WWDR));
    return parseado;
}

function vigente(cert, ahora) {
    return ahora >= cert.notBefore && ahora <= cert.notAfter;
}

function ecdsaDerARaw(der, tam) {
    let i = 0;
    if (der[i++] !== 0x30) throw new Error('firma');
    if (der[i] & 0x80) i += 1 + (der[i] & 0x7f);
    else i++;
    if (der[i++] !== 0x02) throw new Error('firma');
    const rlen = der[i++];
    let r = der.subarray(i, i + rlen);
    i += rlen;
    if (der[i++] !== 0x02) throw new Error('firma');
    const slen = der[i++];
    let s = der.subarray(i, i + slen);
    const ajustar = (parte) => {
        let k = 0;
        while (parte.length - k > tam && parte[k] === 0) k++;
        const recortada = parte.subarray(k);
        if (recortada.length > tam) throw new Error('firma');
        const out = new Uint8Array(tam);
        out.set(recortada, tam - recortada.length);
        return out;
    };
    const raw = new Uint8Array(tam * 2);
    raw.set(ajustar(r), 0);
    raw.set(ajustar(s), tam);
    return raw;
}

async function verificarFirma(spki, curva, tam, hash, firmaDer, datos) {
    const clave = await crypto.subtle.importKey(
        'spki', copia(spki), { name: 'ECDSA', namedCurve: curva }, false, ['verify'],
    );
    const raw = ecdsaDerARaw(firmaDer, tam);
    return crypto.subtle.verify({ name: 'ECDSA', hash }, clave, raw, datos);
}

function iguales(a, b) {
    if (a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
    return dif === 0;
}

// La autofirma de la raíz embebida: sirve para saber que el parser lee un certificado real.
export function autofirmaDeRaiz(raiz = APPLE_RAIZ) {
    const cert = parsearCert(raiz);
    return verificarFirma(cert.spki, cert.curva, cert.tam, cert.hash, cert.firma, cert.tbs);
}

// { ok, transaccion } o { ok: false, error: 'firma' }. No mira el productId: eso es de la cuota.
export async function verificarJws(token, { raiz = APPLE_RAIZ, bundleId, ahora }) {
    try {
        const partes = String(token).split('.');
        if (partes.length !== 3 || partes.some(p => !p)) return { ok: false, error: 'firma' };
        const header = JSON.parse(new TextDecoder().decode(desdeBase64(partes[0])));
        if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 1 || header.x5c.length > 5) {
            return { ok: false, error: 'firma' };
        }
        const certs = header.x5c.map(c => parsearCert(desdeBase64(c)));
        const raizCert = parsearCert(raiz);
        while (certs.length && iguales(certs.at(-1).spki, raizCert.spki)) certs.pop();
        // Hace falta un intermedio (no alcanza la hoja firmada directo por la raíz).
        if (certs.length < 2 || !vigente(raizCert, ahora)) return { ok: false, error: 'firma' };
        for (let i = 0; i < certs.length - 1; i++) {
            const padre = certs[i + 1];
            if (!padre.ca || !padre.oidWwdr || !vigente(padre, ahora)) return { ok: false, error: 'firma' };
            const ok = await verificarFirma(padre.spki, padre.curva, padre.tam, certs[i].hash, certs[i].firma, certs[i].tbs);
            if (!ok) return { ok: false, error: 'firma' };
        }
        const ultimo = certs.at(-1);
        const llega = await verificarFirma(raizCert.spki, raizCert.curva, raizCert.tam, ultimo.hash, ultimo.firma, ultimo.tbs);
        if (!llega) return { ok: false, error: 'firma' };
        const hoja = certs[0];
        if (!vigente(hoja, ahora) || !hoja.oidApple || hoja.curva !== 'P-256') return { ok: false, error: 'firma' };
        const clave = await crypto.subtle.importKey(
            'spki', copia(hoja.spki), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
        );
        const firma = desdeBase64(partes[2]);
        if (firma.length !== 64) return { ok: false, error: 'firma' };
        const datos = new TextEncoder().encode(`${partes[0]}.${partes[1]}`);
        const firmaOk = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, clave, copia(firma), datos);
        if (!firmaOk) return { ok: false, error: 'firma' };
        const payload = JSON.parse(new TextDecoder().decode(desdeBase64(partes[1])));
        if (payload.bundleId !== bundleId) return { ok: false, error: 'firma' };
        return {
            ok: true,
            transaccion: {
                productId: typeof payload.productId === 'string' ? payload.productId : '',
                transactionId: payload.transactionId == null ? '' : String(payload.transactionId),
                originalTransactionId: payload.originalTransactionId == null ? '' : String(payload.originalTransactionId),
                type: typeof payload.type === 'string' ? payload.type : '',
                expiresDate: payload.expiresDate ?? null,
                revocationDate: payload.revocationDate ?? null,
                quantity: payload.quantity ?? null,
                environment: typeof payload.environment === 'string' ? payload.environment : '',
                // Solo lo trae el AppTransaction (la «prueba de instalación»): Production, Sandbox (TestFlight) o Xcode.
                receiptType: typeof payload.receiptType === 'string' ? payload.receiptType : '',
            },
        };
    } catch {
        return { ok: false, error: 'firma' };
    }
}
