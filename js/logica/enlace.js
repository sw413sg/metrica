// Métrica web: la web vinculada con el iPhone por un QR, como WhatsApp Web (servidor en
// worker/src/enlace.js; en Swift, `EnlaceWeb.swift`). Acá va la parte pura: el texto del QR, el
// cifrado y cómo juntar lo que llega con lo de acá. La pantalla y los pedidos están en js/app.js.
//
// Cifrado (el servidor nunca ve las letras):
// - La web arma un par de claves ECDH P-256 y pone la pública en el QR, con el código.
// - El iPhone arma el suyo y saca la clave compartida: HKDF-SHA256 del secreto ECDH, con el código
//   de sal e INFO_ENLACE. Con ella cifra (AES-GCM) la clave de sus datos, 32 bytes al azar que
//   quedan en el Llavero, y la manda por el servidor con su clave pública.
// - De la clave de los datos salen dos: una para cifrar cada registro (AES-GCM, nonce de 12 bytes
//   adelante) y otra para el nombre que ve el servidor (HMAC-SHA256 del nombre, en hexadecimal).
//
// Registros: los mismos de iCloud (`Nube.swift`): «letra-<id>», «frase-<id>», «carpeta-<id>» y
// «palabra-<hex>», cada uno con su JSON. `sincronizados` guarda el último JSON mandado o traído de
// cada uno: lo que difiere de ahí es lo que cambió en esta compu.

export const PREFIJO_QR = 'metrica-web:1:';
const INFO_ENLACE = 'metrica-web-1';
const SAL_DATOS = 'metrica';
const texto = valor => new TextEncoder().encode(valor);

export const CLAVES_ENLACE = {
    letras: 'metrica.letras',
    frases: 'metrica.frases',
    guardadas: 'metrica.guardadas',
    carpetas: 'metrica.carpetas',
};

// --- Base64 ---

export function aBase64(bytes, url = false) {
    let binario = '';
    for (const b of new Uint8Array(bytes)) binario += String.fromCharCode(b);
    const b64 = btoa(binario);
    return url ? b64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') : b64;
}

export function deBase64(cadena) {
    const b64 = cadena.replaceAll('-', '+').replaceAll('_', '/');
    const binario = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    return Uint8Array.from(binario, c => c.charCodeAt(0));
}

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');

// --- El QR ---

export const textoQR = (codigo, publica) => `${PREFIJO_QR}${codigo}:${publica}`;

/** «metrica-web:1:<código>:<clave pública>» → { codigo, publica }, o null si no es un QR de Métrica. */
export function leerQR(cadena) {
    if (typeof cadena !== 'string' || !cadena.startsWith(PREFIJO_QR)) return null;
    const [codigo, publica] = cadena.slice(PREFIJO_QR.length).split(':');
    if (!/^[0-9a-f]{32}$/.test(codigo ?? '') || !/^[A-Za-z0-9_-]{80,100}$/.test(publica ?? '')) return null;
    return { codigo, publica };
}

// --- Claves ---

/** El par ECDH de la web: la privada no se puede exportar; la pública va en el QR (65 bytes, base64url). */
export async function nuevoParECDH() {
    const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const publica = aBase64(await crypto.subtle.exportKey('raw', par.publicKey), true);
    return { privada: par.privateKey, publica };
}

/** La clave AES-GCM que comparten la web y el iPhone para pasarse la clave de los datos. */
export async function claveCompartida(privada, publicaDelOtro, codigo) {
    const otra = await crypto.subtle.importKey('raw', deBase64(publicaDelOtro), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const secreto = await crypto.subtle.deriveBits({ name: 'ECDH', public: otra }, privada, 256);
    const base = await crypto.subtle.importKey('raw', secreto, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: texto(codigo), info: texto(INFO_ENLACE) },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function sellar(clave, datos) {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, clave, datos));
    const junto = new Uint8Array(12 + cifrado.length);
    junto.set(nonce);
    junto.set(cifrado, 12);
    return aBase64(junto);
}

async function abrir(clave, b64) {
    const junto = deBase64(b64);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: junto.slice(0, 12) }, clave, junto.slice(12)));
}

/** Lo que hace el iPhone (en los tests, para probar la web): cifra la clave de los datos. */
export const cifrarClaveDeDatos = (compartida, bruta) => sellar(compartida, bruta);
/** La web abre la clave de los datos que mandó el iPhone (32 bytes). */
export const abrirClaveDeDatos = (compartida, b64) => abrir(compartida, b64);

/** De la clave de los datos (32 bytes) salen la de cifrar y la de los nombres; ninguna se puede exportar. */
export async function clavesDeDatos(bruta) {
    const base = await crypto.subtle.importKey('raw', bruta, 'HKDF', false, ['deriveKey']);
    const derivar = (info, algoritmo, usos) => crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: texto(SAL_DATOS), info: texto(info) }, base, algoritmo, false, usos);
    return {
        cifrar: await derivar('metrica-cifrar', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
        nombres: await derivar('metrica-nombres', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']),
    };
}

/** El nombre que ve el servidor: HMAC del nombre del registro, en hexadecimal (64). */
export async function nombreCifrado(claves, nombre) {
    return hex(await crypto.subtle.sign('HMAC', claves.nombres, texto(nombre)));
}

/** { c, d }: el nombre cifrado y el registro (`{"n": nombre, "j": json}`) cifrado. */
export async function cifrarRegistro(claves, nombre, json) {
    return { c: await nombreCifrado(claves, nombre), d: await sellar(claves.cifrar, texto(JSON.stringify({ n: nombre, j: json }))) };
}

/** { n, j } o null si no se puede abrir. */
export async function abrirRegistro(claves, d) {
    try {
        const { n, j } = JSON.parse(new TextDecoder().decode(await abrir(claves.cifrar, d)));
        return typeof n === 'string' && typeof j === 'string' ? { n, j } : null;
    } catch {
        return null;
    }
}

// --- Qué se sincroniza (como Nube.swift) ---

function leer(almacen, clave) {
    try {
        const valor = JSON.parse(almacen.getItem(clave));
        return Array.isArray(valor) ? valor : [];
    } catch {
        return [];
    }
}

/** JSON con las claves ordenadas, para comparar sin que importe el orden. */
export function jsonCanonico(valor) {
    if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
    if (valor && typeof valor === 'object') {
        return `{${Object.keys(valor).sort().filter(k => valor[k] !== undefined)
            .map(k => `${JSON.stringify(k)}:${jsonCanonico(valor[k])}`).join(',')}}`;
    }
    return JSON.stringify(valor ?? null);
}

/** «canción» → su UTF-8 en hexadecimal (`idDePalabra` de Nube.swift). */
export const idDePalabra = palabra => hex(texto(palabra.normalize('NFC')));

const TIPOS = { letra: 'letras', frase: 'frases', carpeta: 'carpetas' };

export function separarNombre(nombre) {
    const guion = nombre.indexOf('-');
    if (guion < 1) return null;
    const tipo = nombre.slice(0, guion), id = nombre.slice(guion + 1);
    return id && (TIPOS[tipo] || tipo === 'palabra') ? { tipo, id } : null;
}

/** Lo que hay en esta compu: nombre del registro → JSON. */
export function elementosLocales(almacen) {
    const elementos = {};
    for (const [tipo, lista] of Object.entries(TIPOS)) {
        for (const item of leer(almacen, CLAVES_ENLACE[lista])) {
            if (item && item.id != null) elementos[`${tipo}-${item.id}`] = jsonCanonico(item);
        }
    }
    for (const palabra of leer(almacen, CLAVES_ENLACE.guardadas)) {
        if (typeof palabra === 'string') elementos[`palabra-${idDePalabra(palabra)}`] = jsonCanonico({ palabra });
    }
    return elementos;
}

/** Lo que cambió acá desde la última vez: { guardar: [nombres], borrar: [nombres] }. */
export function cambiosLocales(locales, sincronizados) {
    return {
        guardar: Object.keys(locales).filter(n => sincronizados[n] !== locales[n]).sort(),
        borrar: Object.keys(sincronizados).filter(n => locales[n] == null).sort(),
    };
}

/**
 * Junta con lo de acá lo que llegó (`modificados`: nombre → JSON; `borrados`: nombres) y deja
 * `sincronizados` al día (lo cambia en el lugar). Si algo cambió de los dos lados, en una letra gana
 * la editada más tarde, y en lo demás, lo de acá (que se vuelve a mandar después). Devuelve si cambió algo.
 */
export function aplicarRemotos(almacen, modificados, borrados, sincronizados) {
    const locales = elementosLocales(almacen);
    const listas = Object.fromEntries(Object.values(TIPOS).map(l => [l, leer(almacen, CLAVES_ENLACE[l])]));
    let guardadas = leer(almacen, CLAVES_ENLACE.guardadas);
    const cambiadas = new Set();
    const cambiadoAca = nombre => locales[nombre] != null && locales[nombre] !== sincronizados[nombre];

    for (const nombre of Object.keys(modificados).sort()) {
        const partes = separarNombre(nombre);
        let remoto;
        try { remoto = JSON.parse(modificados[nombre]); } catch { continue; }
        if (!partes || !remoto || typeof remoto !== 'object') continue;
        const canonico = jsonCanonico(remoto);
        if (partes.tipo === 'palabra') {
            if (typeof remoto.palabra !== 'string' || idDePalabra(remoto.palabra) !== partes.id) continue;
            if (!guardadas.includes(remoto.palabra)) {
                guardadas = [remoto.palabra, ...guardadas];
                cambiadas.add('guardadas');
            }
            sincronizados[nombre] = canonico;
            continue;
        }
        if (String(remoto.id) !== partes.id) continue;
        const lista = TIPOS[partes.tipo], items = listas[lista];
        const lugar = items.findIndex(i => String(i.id) === partes.id);
        const gana = !cambiadoAca(nombre)
            || (partes.tipo === 'letra' && (lugar < 0 || (items[lugar].editada ?? 0) < (remoto.editada ?? 0)));
        if (gana && canonico !== locales[nombre]) {
            if (lugar >= 0) items[lugar] = remoto; else items.push(remoto);
            cambiadas.add(lista);
        }
        sincronizados[nombre] = canonico;
    }

    for (const nombre of borrados) {
        const partes = separarNombre(nombre);
        if (partes && !cambiadoAca(nombre)) {
            if (partes.tipo === 'palabra') {
                const quedan = guardadas.filter(p => idDePalabra(p) !== partes.id);
                if (quedan.length !== guardadas.length) cambiadas.add('guardadas');
                guardadas = quedan;
            } else {
                const lista = TIPOS[partes.tipo];
                const quedan = listas[lista].filter(i => String(i.id) !== partes.id);
                if (quedan.length !== listas[lista].length) cambiadas.add(lista);
                listas[lista] = quedan;
            }
        }
        delete sincronizados[nombre];
    }

    for (const lista of cambiadas) {
        almacen.setItem(CLAVES_ENLACE[lista], JSON.stringify(lista === 'guardadas' ? guardadas : listas[lista]));
    }
    return cambiadas.size > 0;
}

/** Al cerrar la sesión, la compu se queda sin las letras del iPhone (como WhatsApp Web). */
export function olvidarDatos(almacen) {
    for (const clave of Object.values(CLAVES_ENLACE)) almacen.removeItem(clave);
}
