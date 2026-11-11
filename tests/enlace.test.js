import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { Enlaces, Espacio, PLANES_WEB, SESION_INACTIVA, VENCE_QR, operarEspacio, revisarEspacio } from '../worker/src/enlace.js';
import { generarQR } from '../js/logica/qr.js';
import {
    textoQR, leerQR, nuevoParECDH, claveCompartida, cifrarClaveDeDatos, abrirClaveDeDatos, clavesDeDatos,
    cifrarRegistro, abrirRegistro, nombreCifrado, elementosLocales, cambiosLocales, aplicarRemotos, idDePalabra,
    jsonCanonico, olvidarDatos, aBase64,
} from '../js/logica/enlace.js';

function almacenDePrueba(inicial = {}) {
    const datos = new Map(Object.entries(inicial).map(([k, v]) => [k, JSON.stringify(v)]));
    return {
        getItem: k => datos.has(k) ? datos.get(k) : null,
        setItem: (k, v) => datos.set(k, String(v)),
        removeItem: k => datos.delete(k),
        leer: k => JSON.parse(datos.get(k) ?? 'null'),
    };
}

// El storage de un Durable Object, con list ordenado (prefix, start, limit) y transacciones de a una.
function storageDePrueba() {
    const datos = new Map();
    let alarma = null, cola = Promise.resolve();
    const list = async ({ prefix = '', start = '', limit = Infinity } = {}) => new Map([...datos.keys()]
        .filter(k => k.startsWith(prefix) && k >= start).sort().slice(0, limit).map(k => [k, structuredClone(datos.get(k))]));
    const storage = {
        datos,
        list,
        getAlarm: async () => alarma,
        setAlarm: async t => { alarma = t; },
        deleteAll: async () => datos.clear(),
        transaction(fn) {
            const corre = cola.then(() => fn({
                get: async k => datos.has(k) ? structuredClone(datos.get(k)) : undefined,
                put: async (k, v) => { datos.set(k, structuredClone(v)); },
                delete: async k => { datos.delete(k); },
                list,
            }));
            cola = corre.then(() => {}, () => {});
            return corre;
        },
    };
    return storage;
}

function namespace(Clase) {
    const objetos = new Map();
    return {
        objetos,
        idFromName: nombre => nombre,
        get(nombre) {
            if (!objetos.has(nombre)) objetos.set(nombre, new Clase({ storage: storageDePrueba() }));
            const objeto = objetos.get(nombre);
            return { fetch: (url, init) => objeto.fetch(new Request(url, init)) };
        },
    };
}

const ORIGEN = 'https://metricarimas.com';
const nuevoEnv = () => ({ ORIGENES: ORIGEN, ENLACES: namespace(Enlaces), ESPACIO: namespace(Espacio) });
const pedir = (env, ruta, cuerpo, cabeceras = {}) => worker.fetch(new Request(`https://metrica.ejemplo${ruta}`, {
    method: 'POST', body: JSON.stringify(cuerpo ?? {}), headers: { 'Content-Type': 'application/json', ...cabeceras },
}), env).then(async r => ({ status: r.status, datos: await r.json() }));

const hexAzar = bytes => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');

// Lo que hace el iPhone al escanear (en Swift, EnlaceWeb.swift): su par ECDH, la clave compartida y la
// clave de los datos cifrada.
async function telefonoEscanea(qr, claveDeDatos) {
    const { codigo, publica } = leerQR(qr);
    const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const compartida = await claveCompartida(par.privateKey, publica, codigo);
    return {
        codigo,
        publica: aBase64(await crypto.subtle.exportKey('raw', par.publicKey), true),
        clave: await cifrarClaveDeDatos(compartida, claveDeDatos),
    };
}

test('el texto del QR va y vuelve, y uno que no es de Métrica no se lee', async () => {
    const { publica } = await nuevoParECDH();
    const codigo = hexAzar(16);
    assert.deepEqual(leerQR(textoQR(codigo, publica)), { codigo, publica });
    assert.equal(leerQR('https://metricarimas.com'), null);
    assert.equal(leerQR(`metrica-web:1:XYZ:${publica}`), null);
});

test('la web abre la clave de los datos que cifró el iPhone, y con ella los registros', async () => {
    const web = await nuevoParECDH();
    const codigo = hexAzar(16);
    const claveDeDatos = crypto.getRandomValues(new Uint8Array(32));
    const telefono = await telefonoEscanea(textoQR(codigo, web.publica), claveDeDatos);
    const compartida = await claveCompartida(web.privada, telefono.publica, codigo);
    assert.deepEqual(await abrirClaveDeDatos(compartida, telefono.clave), claveDeDatos);

    const claves = await clavesDeDatos(claveDeDatos);
    const registro = await cifrarRegistro(claves, 'letra-1', '{"id":"1","titulo":"Canción"}');
    assert.match(registro.c, /^[0-9a-f]{64}$/);
    assert.equal(registro.c, await nombreCifrado(claves, 'letra-1'));
    assert.ok(!registro.d.includes('Canción'));
    assert.deepEqual(await abrirRegistro(claves, registro.d), { n: 'letra-1', j: '{"id":"1","titulo":"Canción"}' });
    // Con otra clave no se abre.
    const otras = await clavesDeDatos(crypto.getRandomValues(new Uint8Array(32)));
    assert.equal(await abrirRegistro(otras, registro.d), null);
});

test('el código de otro QR no abre la clave (la sal es el código)', async () => {
    const web = await nuevoParECDH();
    const telefono = await telefonoEscanea(textoQR(hexAzar(16), web.publica), new Uint8Array(32));
    const otra = await claveCompartida(web.privada, telefono.publica, hexAzar(16));
    await assert.rejects(abrirClaveDeDatos(otra, telefono.clave));
});

test('elementosLocales y cambiosLocales, como en Nube.swift', () => {
    const almacen = almacenDePrueba({
        'metrica.letras': [{ id: '1', titulo: 'A', texto: 'x', creada: 1, editada: 2 }],
        'metrica.frases': [{ id: '5', texto: 'una frase', usada: false, creada: 5 }],
        'metrica.guardadas': ['canción'],
    });
    const locales = elementosLocales(almacen);
    assert.deepEqual(Object.keys(locales).sort(), ['frase-5', 'letra-1', `palabra-${idDePalabra('canción')}`]);
    assert.equal(idDePalabra('canción'), '63616e6369c3b36e');
    assert.equal(locales['letra-1'], '{"creada":1,"editada":2,"id":"1","texto":"x","titulo":"A"}');
    assert.deepEqual(cambiosLocales(locales, { 'letra-1': locales['letra-1'], 'letra-9': '{}' }),
        { guardar: ['frase-5', `palabra-${idDePalabra('canción')}`], borrar: ['letra-9'] });
});

test('aplicarRemotos: en una letra cambiada de los dos lados gana la editada más tarde', () => {
    const vieja = { id: '1', titulo: 'A', texto: 'viejo', creada: 1, editada: 10 };
    const almacen = almacenDePrueba({ 'metrica.letras': [{ ...vieja, texto: 'acá', editada: 20 }] });
    const sincronizados = { 'letra-1': jsonCanonico(vieja) };
    // Llega una más vieja que la de acá: queda la de acá (y se manda después).
    aplicarRemotos(almacen, { 'letra-1': JSON.stringify({ ...vieja, texto: 'allá', editada: 15 }) }, [], sincronizados);
    assert.equal(almacen.leer('metrica.letras')[0].texto, 'acá');
    assert.deepEqual(cambiosLocales(elementosLocales(almacen), sincronizados).guardar, ['letra-1']);
    // Llega una más nueva: gana.
    assert.equal(aplicarRemotos(almacen, { 'letra-1': JSON.stringify({ ...vieja, texto: 'allá', editada: 30, acordes: [] }) }, [], sincronizados), true);
    assert.equal(almacen.leer('metrica.letras')[0].texto, 'allá');
    assert.deepEqual(almacen.leer('metrica.letras')[0].acordes, [], 'los campos que la web no usa se guardan igual');
    assert.deepEqual(cambiosLocales(elementosLocales(almacen), sincronizados), { guardar: [], borrar: [] });
});

test('aplicarRemotos suma letras, frases y palabras nuevas, y borra lo que se borró allá', () => {
    const almacen = almacenDePrueba({ 'metrica.letras': [{ id: '1', titulo: 'A', texto: '', creada: 1, editada: 1 }], 'metrica.guardadas': ['sol'] });
    const sincronizados = {};
    aplicarRemotos(almacen, {
        'letra-1': JSON.stringify({ id: '1', titulo: 'A', texto: '', creada: 1, editada: 1 }),
        'letra-2': JSON.stringify({ id: '2', titulo: 'B', texto: 'b', creada: 2, editada: 2 }),
        'frase-3': JSON.stringify({ id: '3', texto: 'f', usada: false, creada: 3 }),
        [`palabra-${idDePalabra('razón')}`]: JSON.stringify({ palabra: 'razón' }),
        [`palabra-${idDePalabra('otra')}`]: JSON.stringify({ palabra: 'mentira' }),
    }, [], sincronizados);
    assert.deepEqual(almacen.leer('metrica.letras').map(l => l.id), ['1', '2']);
    assert.deepEqual(almacen.leer('metrica.frases').map(f => f.texto), ['f']);
    assert.deepEqual(almacen.leer('metrica.guardadas'), ['razón', 'sol']);
    aplicarRemotos(almacen, {}, ['letra-2', `palabra-${idDePalabra('razón')}`], sincronizados);
    assert.deepEqual(almacen.leer('metrica.letras').map(l => l.id), ['1']);
    assert.deepEqual(almacen.leer('metrica.guardadas'), ['sol']);
    assert.equal(sincronizados['letra-2'], undefined);
    olvidarDatos(almacen);
    assert.equal(almacen.getItem('metrica.letras'), null);
});

test('el Worker vincula la web con el QR y pasa registros cifrados de un lado al otro', async () => {
    const env = nuevoEnv();
    const web = await nuevoParECDH();
    const qr = await pedir(env, '/web/qr', { navegador: 'Chrome en Windows' }, { Origin: ORIGEN });
    assert.equal(qr.status, 200);
    const { codigo, secreto } = qr.datos;
    assert.deepEqual((await pedir(env, '/web/qr/estado', { codigo, secreto }, { Origin: ORIGEN })).datos, { estado: 'esperando' });
    // Con otro secreto no se puede espiar el código.
    assert.equal((await pedir(env, '/web/qr/estado', { codigo, secreto: hexAzar(32) }, { Origin: ORIGEN })).datos.estado, 'vencido');

    // El iPhone escanea (sin Origin, como la app nativa).
    const claveDeDatos = crypto.getRandomValues(new Uint8Array(32));
    const espacio = hexAzar(16), tokenTelefono = hexAzar(32);
    const escaneo = await telefonoEscanea(textoQR(codigo, web.publica), claveDeDatos);
    const vincular = await pedir(env, '/web/vincular', { ...escaneo, espacio, token: tokenTelefono });
    assert.equal(vincular.status, 200);
    assert.equal(vincular.datos.navegador, 'Chrome en Windows');
    assert.equal(vincular.datos.nuevo, true, 'la primera vez el iPhone manda todo');
    // El mismo QR no sirve dos veces.
    assert.equal((await pedir(env, '/web/vincular', { ...escaneo, espacio, token: tokenTelefono })).status, 410);

    // La web retira la sesión una sola vez.
    const listo = (await pedir(env, '/web/qr/estado', { codigo, secreto }, { Origin: ORIGEN })).datos;
    assert.equal(listo.estado, 'listo');
    assert.equal(listo.espacio, espacio);
    assert.equal((await pedir(env, '/web/qr/estado', { codigo, secreto }, { Origin: ORIGEN })).datos.estado, 'vencido');
    const compartida = await claveCompartida(web.privada, listo.publica, codigo);
    const claves = await clavesDeDatos(await abrirClaveDeDatos(compartida, listo.clave));

    const comoTelefono = { Authorization: `Bearer ${espacio}.${tokenTelefono}` };
    const comoWeb = { Authorization: `Bearer ${espacio}.${listo.token}`, Origin: ORIGEN };

    // El iPhone sube una letra; la web la trae y la abre.
    const letra = await cifrarRegistro(claves, 'letra-1', '{"id":"1"}');
    assert.equal((await pedir(env, '/web/guardar', { guardar: [letra] }, comoTelefono)).datos.rev, 1);
    const traidos = (await pedir(env, '/web/traer', { desde: 0 }, comoWeb)).datos;
    assert.equal(traidos.rev, 1);
    assert.deepEqual(await abrirRegistro(claves, traidos.registros[0].d), { n: 'letra-1', j: '{"id":"1"}' });
    // Lo que sube cada uno no le vuelve a él.
    assert.deepEqual((await pedir(env, '/web/traer', { desde: 0 }, comoTelefono)).datos.registros, []);

    // La web borra la letra; el iPhone ve el borrado.
    await pedir(env, '/web/guardar', { borrar: [letra.c] }, comoWeb);
    assert.deepEqual((await pedir(env, '/web/traer', { desde: 1 }, comoTelefono)).datos.registros, [{ c: letra.c, d: null }]);

    // El iPhone ve la sesión y la cierra: la web queda afuera.
    const { sesiones } = (await pedir(env, '/web/sesiones', {}, comoTelefono)).datos;
    assert.equal(sesiones.length, 1);
    assert.equal(sesiones[0].navegador, 'Chrome en Windows');
    assert.equal((await pedir(env, '/web/sesiones', {}, comoWeb)).status, 401, 'la web no ve las sesiones');
    await pedir(env, '/web/cerrar', { id: sesiones[0].id }, comoTelefono);
    assert.equal((await pedir(env, '/web/traer', { desde: 0 }, comoWeb)).status, 401);

    // Otro iPhone no puede sumar sesiones al espacio de este.
    const ajeno = await pedir(env, '/web/qr', {}, { Origin: ORIGEN });
    const escaneoAjeno = await telefonoEscanea(textoQR(ajeno.datos.codigo, web.publica), claveDeDatos);
    assert.equal((await pedir(env, '/web/vincular', { ...escaneoAjeno, espacio, token: hexAzar(32) })).status, 401);

    // Borrar todo deja el espacio vacío.
    await pedir(env, '/web/borrar', {}, comoTelefono);
    assert.equal(env.ESPACIO.objetos.get(`espacio:${espacio}`).ctx.storage.datos.size, 0);
});

test('el QR vence a los 60 segundos, y una sesión sin uso en 14 días se cierra', async () => {
    const env = nuevoEnv();
    const { codigo } = (await pedir(env, '/web/qr', {}, { Origin: ORIGEN })).datos;
    const enlaces = env.ENLACES.objetos.get('metrica-enlaces').ctx.storage;
    const qr = enlaces.datos.get(`qr:${codigo}`);
    enlaces.datos.set(`qr:${codigo}`, { ...qr, vence: Date.now() - 1 });
    const escaneo = await telefonoEscanea(textoQR(codigo, (await nuevoParECDH()).publica), new Uint8Array(32));
    assert.equal((await pedir(env, '/web/vincular', { ...escaneo, espacio: hexAzar(16), token: hexAzar(32) })).status, 410);
    assert.ok(VENCE_QR <= 60_000);

    const storage = storageDePrueba();
    const ahora = 1_000_000_000_000;
    const { token } = await storage.transaction(txn => operarEspacio(txn, { accion: 'nuevaSesion', token: 'a'.repeat(64), plan: 'mas', ahora }));
    assert.ok(!(await storage.transaction(txn => operarEspacio(txn, { accion: 'traer', token, desde: 0, ahora: ahora + 1000 }))).error);
    const tarde = ahora + 1000 + SESION_INACTIVA + 1;
    assert.equal((await storage.transaction(txn => operarEspacio(txn, { accion: 'traer', token, desde: 0, ahora: tarde }))).error, 'sesion');
    // A los 30 días sin uso, el espacio se borra entero (el pedido rechazado no cuenta como uso).
    assert.equal((await storage.transaction(txn => revisarEspacio(txn, ahora + 29 * 24 * 3600 * 1000))).borrarTodo, false);
    assert.equal((await storage.transaction(txn => revisarEspacio(txn, ahora + 31 * 24 * 3600 * 1000))).borrarTodo, true);
});

test('pide de a páginas y nunca más de 5 sesiones por iPhone', async () => {
    const storage = storageDePrueba();
    const ahora = Date.now(), tel = 'b'.repeat(64);
    const fila = (txn, pedido) => operarEspacio(txn, { ahora, ...pedido });
    for (let i = 0; i < 7; i++) await storage.transaction(txn => fila(txn, { accion: 'nuevaSesion', token: tel, plan: 'mas', ahora: ahora + i }));
    assert.equal((await storage.transaction(txn => fila(txn, { accion: 'sesiones', token: tel }))).sesiones.length, 5);
    const guardar = Array.from({ length: 350 }, (_, i) => ({ c: i.toString(16).padStart(64, '0'), d: 'x' }));
    await storage.transaction(txn => fila(txn, { accion: 'guardar', token: tel, guardar: guardar.slice(0, 200) }));
    await storage.transaction(txn => fila(txn, { accion: 'guardar', token: tel, guardar: guardar.slice(200) }));
    const { token } = await storage.transaction(txn => fila(txn, { accion: 'nuevaSesion', token: tel }));
    const primera = await storage.transaction(txn => fila(txn, { accion: 'traer', token, desde: 0 }));
    assert.equal(primera.registros.length, 300);
    assert.equal(primera.mas, true);
    const segunda = await storage.transaction(txn => fila(txn, { accion: 'traer', token, desde: primera.rev }));
    assert.equal(segunda.registros.length, 50);
    assert.equal(segunda.mas, false);
    assert.equal(segunda.rev, 350);
});

test('gratis: una sola compu a la vez y la sesión vence a los 3 días sin uso', async () => {
    const storage = storageDePrueba();
    const ahora = 1_000_000_000_000, tel = 'c'.repeat(64);
    const fila = pedido => storage.transaction(txn => operarEspacio(txn, { ahora, ...pedido }));
    const primera = await fila({ accion: 'nuevaSesion', token: tel });
    const segunda = await fila({ accion: 'nuevaSesion', token: tel, ahora: ahora + 1 });
    assert.equal((await fila({ accion: 'traer', token: primera.token })).error, 'sesion', 'la nueva cierra la anterior');
    const { sesiones } = await fila({ accion: 'sesiones', token: tel });
    assert.equal(sesiones.length, 1);
    assert.equal(sesiones[0].vence, ahora + 1 + PLANES_WEB.gratis.inactiva);
    const tarde = ahora + 1 + PLANES_WEB.gratis.inactiva + 1;
    assert.equal((await fila({ accion: 'traer', token: segunda.token, ahora: tarde })).error, 'sesion');
});

test('el QR de Métrica: versión justa, con los tres cuadrados de las esquinas', () => {
    assert.equal(generarQR('hola').length, 21);
    const m = generarQR('metrica-web:1:' + 'a'.repeat(32) + ':' + 'B'.repeat(87));
    assert.equal(m.length, 49);
    for (const [x, y] of [[0, 0], [42, 0], [0, 42]]) {
        assert.equal(m[y][x], true);
        assert.equal(m[y + 1][x + 1], false);
        assert.equal(m[y + 3][x + 3], true);
    }
    assert.equal(generarQR('z'.repeat(400)), null);
});
