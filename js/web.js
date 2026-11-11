// Métrica web: vincular esta compu con el iPhone escaneando un QR, como WhatsApp Web, y mantener las
// letras, el baúl y las palabras guardadas al día con él. La parte pura (QR, cifrado, cómo juntar) está
// en js/logica/enlace.js y js/logica/qr.js; el servidor, en worker/src/enlace.js. Acá van los pedidos,
// el Llavero de la compu (IndexedDB, con claves que no se pueden exportar) y la vuelta cada 4 segundos.
import {
    textoQR, nuevoParECDH, claveCompartida, abrirClaveDeDatos, clavesDeDatos, cifrarRegistro, abrirRegistro,
    nombreCifrado, elementosLocales, cambiosLocales, aplicarRemotos, olvidarDatos,
} from './logica/enlace.js';
import { qrSVG } from './logica/qr.js';

const SERVIDOR = 'https://metrica.emas1397.workers.dev';
const CLAVE_SESION = 'metrica.web-sesion';
const CLAVE_SINC = 'metrica.web-sincronizados';
const CLAVE_PLAN = 'metrica.web-plan';
const QR_POR_VEZ = 3; // como WhatsApp: después de 3 códigos vencidos, hay que pedir otro a mano
const POR_ENVIO = 100;

const servidor = () => {
    try { return localStorage.getItem('metrica.web-endpoint') || SERVIDOR; } catch { return SERVIDOR; }
};

function leerJSON(clave, porDefecto) {
    try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch { return porDefecto; }
}

export const sesionWeb = () => leerJSON(CLAVE_SESION, null);
export const estaVinculada = () => Boolean(sesionWeb()?.token);
/** El plan del iPhone vinculado: { extras: bool, plan: 'gratis' | 'mas' }. */
export const planDelIphone = () => leerJSON(CLAVE_PLAN, { extras: false, plan: 'gratis' });

async function pedir(ruta, cuerpo, sesion) {
    const cabeceras = { 'Content-Type': 'application/json' };
    if (sesion) cabeceras.Authorization = `Bearer ${sesion.espacio}.${sesion.token}`;
    const respuesta = await fetch(servidor() + ruta, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo ?? {}) });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw Object.assign(new Error(datos.error ?? 'red'), { estado: respuesta.status });
    return datos;
}

// --- Las claves, en IndexedDB (CryptoKey que no se pueden exportar: ni el código de la página las lee) ---

function abrirBase() {
    return new Promise((ok, mal) => {
        const pedido = indexedDB.open('metrica-web', 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore('claves');
        pedido.onsuccess = () => ok(pedido.result);
        pedido.onerror = () => mal(pedido.error);
    });
}

async function enBase(modo, accion) {
    const base = await abrirBase();
    return new Promise((ok, mal) => {
        const pedido = accion(base.transaction('claves', modo).objectStore('claves'));
        pedido.onsuccess = () => { ok(pedido.result); base.close(); };
        pedido.onerror = () => { mal(pedido.error); base.close(); };
    });
}

const guardarClaves = claves => enBase('readwrite', tienda => tienda.put(claves, 'datos'));
const leerClaves = () => enBase('readonly', tienda => tienda.get('datos')).catch(() => null);
const borrarClaves = () => enBase('readwrite', tienda => tienda.delete('datos')).catch(() => {});

// «Chrome en Windows»: lo que ve el iPhone en la lista de compus vinculadas.
export function nombreDelNavegador(agente = navigator.userAgent) {
    const navegador = /Edg\//.test(agente) ? 'Edge' : /OPR\//.test(agente) ? 'Opera' : /Firefox\//.test(agente) ? 'Firefox'
        : /Chrome\//.test(agente) ? 'Chrome' : /Safari\//.test(agente) ? 'Safari' : 'Navegador';
    const sistema = /iPhone|iPad/.test(agente) ? 'iPhone' : /Android/.test(agente) ? 'Android' : /Windows/.test(agente) ? 'Windows'
        : /Mac OS X/.test(agente) ? 'Mac' : /CrOS/.test(agente) ? 'Chromebook' : /Linux/.test(agente) ? 'Linux' : '';
    return sistema ? `${navegador} en ${sistema}` : navegador;
}

// --- Vincular ---

/**
 * Muestra QR nuevos hasta que el iPhone escanee uno (o venzan 3). Devuelve una función para cortar.
 * avisos: pintar(svg), escaneado(), listo(), vencido(), error().
 */
export function vincular(avisos) {
    let cortado = false;
    const esperar = ms => new Promise(ok => setTimeout(ok, ms));
    (async () => {
        try {
            for (let vez = 0; vez < QR_POR_VEZ && !cortado; vez++) {
                const par = await nuevoParECDH();
                const { codigo, secreto } = await pedir('/web/qr', { navegador: nombreDelNavegador() });
                if (cortado) return;
                avisos.pintar(qrSVG(textoQR(codigo, par.publica)));
                for (;;) {
                    await esperar(2000);
                    if (cortado) return;
                    const estado = await pedir('/web/qr/estado', { codigo, secreto });
                    if (estado.estado === 'escaneado') avisos.escaneado?.();
                    if (estado.estado === 'vencido') break;
                    if (estado.estado === 'listo') {
                        const compartida = await claveCompartida(par.privada, estado.publica, codigo);
                        const claves = await clavesDeDatos(await abrirClaveDeDatos(compartida, estado.clave));
                        await guardarClaves(claves);
                        localStorage.setItem(CLAVE_SESION, JSON.stringify({ espacio: estado.espacio, token: estado.token, rev: 0 }));
                        localStorage.setItem(CLAVE_SINC, '{}');
                        if (!cortado) avisos.listo();
                        return;
                    }
                }
            }
            if (!cortado) avisos.vencido();
        } catch {
            if (!cortado) avisos.error();
        }
    })();
    return () => { cortado = true; };
}

// --- Mantener al día ---

let corriendo = false;
const nombresPorC = new Map();

async function cDe(claves, nombre) {
    for (const [c, n] of nombresPorC) if (n === nombre) return c;
    const c = await nombreCifrado(claves, nombre);
    nombresPorC.set(c, nombre);
    return c;
}

/**
 * Trae lo que cambió en el iPhone (o en otra compu), lo junta con lo de acá y manda lo de acá.
 * alCambiar() se llama si cambió algo de lo que se ve; alCerrar() si el iPhone cerró la sesión.
 */
export async function sincronizar({ alCambiar, alCerrar }) {
    const sesion = sesionWeb();
    if (!sesion || corriendo) return;
    corriendo = true;
    try {
        const claves = await leerClaves();
        if (!claves) {
            await cerrarLocal();
            return alCerrar();
        }
        const sincronizados = leerJSON(CLAVE_SINC, {});
        // Los nombres ya conocidos, para reconocer los borrados (el servidor solo ve el HMAC).
        for (const nombre of Object.keys(sincronizados)) await cDe(claves, nombre);

        const modificados = {}, borrados = [];
        let cambioPlan = false;
        for (let mas = true; mas;) {
            const traido = await pedir('/web/traer', { desde: sesion.rev }, sesion);
            for (const { c, d } of traido.registros) {
                if (d == null) {
                    if (nombresPorC.has(c)) borrados.push(nombresPorC.get(c));
                    continue;
                }
                const registro = await abrirRegistro(claves, d);
                if (!registro) continue;
                nombresPorC.set(c, registro.n);
                if (registro.n === 'plan-iphone') {
                    localStorage.setItem(CLAVE_PLAN, registro.j);
                    localStorage.setItem('metrica.extras', planDelIphone().extras ? 'comprado' : '');
                    cambioPlan = true;
                } else modificados[registro.n] = registro.j;
            }
            sesion.rev = traido.rev;
            mas = traido.mas;
        }
        const cambio = aplicarRemotos(localStorage, modificados, borrados, sincronizados);
        localStorage.setItem(CLAVE_SINC, JSON.stringify(sincronizados));
        localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
        if (cambio || cambioPlan) alCambiar();

        // Lo de acá, de a POR_ENVIO por pedido.
        const locales = elementosLocales(localStorage);
        const { guardar, borrar } = cambiosLocales(locales, sincronizados);
        const lote = [...guardar.map(n => ['guardar', n]), ...borrar.map(n => ['borrar', n])];
        for (let i = 0; i < lote.length; i += POR_ENVIO) {
            const parte = lote.slice(i, i + POR_ENVIO);
            const cuerpo = { guardar: [], borrar: [] };
            for (const [que, nombre] of parte) {
                if (que === 'guardar') cuerpo.guardar.push(await cifrarRegistro(claves, nombre, locales[nombre]));
                else cuerpo.borrar.push(await cDe(claves, nombre));
            }
            await pedir('/web/guardar', cuerpo, sesion);
            for (const [que, nombre] of parte) {
                if (que === 'guardar') sincronizados[nombre] = locales[nombre];
                else delete sincronizados[nombre];
            }
            localStorage.setItem(CLAVE_SINC, JSON.stringify(sincronizados));
        }
    } catch (error) {
        // 401: el iPhone cerró la sesión, o venció. Sin internet, se prueba en la próxima vuelta.
        if (error.estado === 401) {
            await cerrarLocal();
            alCerrar();
        }
    } finally {
        corriendo = false;
    }
}

/** La compu se queda sin nada del iPhone (como al cerrar sesión en WhatsApp Web). */
async function cerrarLocal() {
    olvidarDatos(localStorage);
    for (const clave of [CLAVE_SESION, CLAVE_SINC, CLAVE_PLAN]) localStorage.removeItem(clave);
    localStorage.setItem('metrica.extras', '');
    nombresPorC.clear();
    await borrarClaves();
}

/** Cerrar sesión desde la web: avisa al servidor (si hay internet) y borra todo lo de acá. */
export async function cerrarSesion() {
    const sesion = sesionWeb();
    if (sesion) await pedir('/web/cerrar', {}, sesion).catch(() => {});
    await cerrarLocal();
}
