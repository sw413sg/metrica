// Arma una CA chica (raíz, intermedia y hoja) para firmar un JWS como el de StoreKit.
// La raíz se inyecta en el Worker con PRUEBA=si; en producción se usa Apple Root CA - G3.
import { generateKeyPairSync, sign } from 'node:crypto';

const CURVA = { 'P-256': 'prime256v1', 'P-384': 'secp384r1' };
const HASH = { 'P-256': 'SHA-256', 'P-384': 'SHA-384' };
const OID_HASH = { 'SHA-256': '1.2.840.10045.4.3.2', 'SHA-384': '1.2.840.10045.4.3.3' };
const TAM = { 'P-256': 32, 'P-384': 48 };

function tlv(tag, contenido) {
    const c = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido);
    let largo;
    if (c.length < 0x80) largo = Buffer.from([c.length]);
    else {
        const bytes = [];
        let n = c.length;
        while (n > 0) { bytes.unshift(n & 0xff); n = Math.floor(n / 256); }
        largo = Buffer.from([0x80 | bytes.length, ...bytes]);
    }
    return Buffer.concat([Buffer.from([tag]), largo, c]);
}
const seq = (...partes) => tlv(0x30, Buffer.concat(partes));

function oid(puntos) {
    const nums = puntos.split('.').map(Number);
    const cuerpo = [nums[0] * 40 + nums[1]];
    for (const num of nums.slice(2)) {
        const pila = [num & 0x7f];
        let v = Math.floor(num / 128);
        while (v > 0) { pila.unshift((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
        cuerpo.push(...pila);
    }
    return tlv(0x06, Buffer.from(cuerpo));
}

function entero(n) {
    if (n === 0) return tlv(0x02, Buffer.from([0]));
    const bytes = [];
    let x = n;
    while (x > 0) { bytes.unshift(x & 0xff); x = Math.floor(x / 256); }
    if (bytes[0] & 0x80) bytes.unshift(0);
    return tlv(0x02, Buffer.from(bytes));
}

function utc(ms) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    const texto = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
    return tlv(0x17, Buffer.from(texto));
}

function nombre(cn) {
    return seq(tlv(0x31, seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from(cn)))));
}

function extension(oidPuntos, valor, critico = false) {
    const partes = [oid(oidPuntos)];
    if (critico) partes.push(tlv(0x01, Buffer.from([0xff])));
    partes.push(tlv(0x04, valor));
    return seq(...partes);
}

const EXT_CA = extension('2.5.29.19', seq(tlv(0x01, Buffer.from([0xff]))), true);
const EXT_APPLE = extension('1.2.840.113635.100.6.11.1', Buffer.from([0x05, 0x00]));

function derARaw(der, tam) {
    let i = 0;
    if (der[i++] !== 0x30) throw new Error('firma');
    if (der[i] & 0x80) i += 1 + (der[i] & 0x7f);
    else i++;
    if (der[i++] !== 0x02) throw new Error('firma');
    const rl = der[i++];
    const r = der.subarray(i, i + rl);
    i += rl;
    if (der[i++] !== 0x02) throw new Error('firma');
    const sl = der[i++];
    const s = der.subarray(i, i + sl);
    const ajustar = parte => {
        let k = 0;
        while (parte.length - k > tam && parte[k] === 0) k++;
        const out = Buffer.alloc(tam);
        const recorte = parte.subarray(k);
        out.set(recorte, tam - recorte.length);
        return out;
    };
    return Buffer.concat([ajustar(r), ajustar(s)]);
}

function emitir({ serial, emisor, sujeto, publica, firmante, curvaFirmante, notBefore, notAfter, extensiones }) {
    const hash = HASH[curvaFirmante];
    const alg = seq(oid(OID_HASH[hash]));
    const tbs = seq(
        tlv(0xa0, entero(2)),
        entero(serial),
        alg,
        emisor,
        seq(utc(notBefore), utc(notAfter)),
        sujeto,
        publica.export({ type: 'spki', format: 'der' }),
        tlv(0xa3, seq(...extensiones)),
    );
    const firma = sign(hash === 'SHA-384' ? 'sha384' : 'sha256', tbs, firmante);
    return seq(tbs, alg, tlv(0x03, Buffer.concat([Buffer.from([0]), firma])));
}

function par(curva) {
    return generateKeyPairSync('ec', { namedCurve: CURVA[curva] });
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64url');
}

// { raizDer, raizB64, bundleId, jws(campos) }. La hoja es siempre P-256 (el JWS es ES256).
export function crearCadena({ curvaRaiz = 'P-256', curvaIntermedia = 'P-256', notBefore = Date.UTC(2024, 0, 1), notAfter = Date.UTC(2035, 0, 1) } = {}) {
    const raiz = par(curvaRaiz);
    const media = par(curvaIntermedia);
    const hoja = par('P-256');
    const nombreRaiz = nombre('Raiz de prueba');
    const nombreMedia = nombre('Intermedia de prueba');
    const certRaiz = emitir({
        serial: 1, emisor: nombreRaiz, sujeto: nombreRaiz, publica: raiz.publicKey, firmante: raiz.privateKey,
        curvaFirmante: curvaRaiz, notBefore, notAfter, extensiones: [EXT_CA],
    });
    const certMedia = emitir({
        serial: 2, emisor: nombreRaiz, sujeto: nombreMedia, publica: media.publicKey, firmante: raiz.privateKey,
        curvaFirmante: curvaRaiz, notBefore, notAfter, extensiones: [EXT_CA],
    });
    const certHoja = emitir({
        serial: 3, emisor: nombreMedia, sujeto: nombre('Hoja de prueba'), publica: hoja.publicKey, firmante: media.privateKey,
        curvaFirmante: curvaIntermedia, notBefore, notAfter, extensiones: [EXT_APPLE],
    });
    const bundleId = 'app.metrica.prueba';
    const jws = (campos = {}) => {
        const payload = {
            bundleId,
            productId: 'metrica.ia',
            transactionId: '1',
            originalTransactionId: '1',
            type: 'Auto-Renewable Subscription',
            expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
            purchaseDate: Date.now(),
            environment: 'Sandbox',
            ...campos,
        };
        const header = { alg: 'ES256', x5c: [certHoja, certMedia].map(c => c.toString('base64')) };
        const h = b64url(JSON.stringify(header));
        const p = b64url(JSON.stringify(payload));
        const der = sign('sha256', Buffer.from(`${h}.${p}`), hoja.privateKey);
        return `${h}.${p}.${b64url(derARaw(der, TAM['P-256']))}`;
    };
    return { raizDer: new Uint8Array(certRaiz), raizB64: certRaiz.toString('base64'), bundleId, jws };
}

export function romperFirma(token) {
    const [h, p, s] = token.split('.');
    const bytes = Buffer.from(s, 'base64url');
    bytes[0] ^= 0xff;
    return `${h}.${p}.${bytes.toString('base64url')}`;
}
