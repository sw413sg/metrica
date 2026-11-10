// Worker de Cloudflare de Métrica (ver README.md). Cada función va en su ruta, así se pueden sumar
// otras (por ejemplo, conectar la web con iCloud) sin tocar las que ya andan:
// - GET /salud: para ver que está desplegado (no gasta nada).
// - POST /ia: «Mejorar frase» y «Lo que cambiaría». Recibe el pedido que arma la app, arma el mensaje
//   (el mismo de js/logica/ia-prompt.js), llama a OpenAI con la clave guardada como secret y descuenta
//   la cuota en KV. La compra se lee de X-Metrica-JWS (StoreKit 2), no de X-Metrica-Plan.
import { MODELO_IA, GASTO_IA, PEDIDAS_IA, REVISIONES_SIN_CAMBIOS, pedidoValido, promptDeSugerencias, leerRespuesta, revisionValida, promptDeRevision, leerRevision, temasValido, promptDeTemas, leerTemas } from '../../js/logica/ia-prompt.js';
import { clasificar, prepararCuenta, descontar, totalUsable } from './cuota.js';
import { APPLE_RAIZ, desdeBase64, verificarJws } from './verificar.js';

const DIAS_KV = 40; // el contador de un mes se borra solo después
const TTL = DIAS_KV * 24 * 60 * 60;

function entero(valor, porDefecto) {
    if (valor == null || valor === '') return porDefecto;
    const n = Number(valor);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : porDefecto;
}

// Solo CF-Connecting-IP (Cloudflare lo pisa). Si no está, todos los que no lo traen comparten tope.
function ipDe(request) {
    const ip = request.headers.get('CF-Connecting-IP') ?? '';
    return /^[A-Za-z0-9.:]{1,64}$/.test(ip) ? ip : 'sin-ip';
}

export default {
    async fetch(request, env) {
        // La web manda su Origin, que tiene que estar en ORIGENES. La app nativa no manda ninguno: se la
        // deja pasar, porque un Origin se puede inventar fuera del navegador; lo que frena el abuso es
        // el cupo por persona, el techo del día y que solo acepta pedidos con la forma de Métrica.
        const origen = request.headers.get('Origin');
        const permitido = origen == null
            || (env.ORIGENES ?? '').split(',').map(o => o.trim()).filter(Boolean).includes(origen);
        const cors = {
            'Access-Control-Allow-Origin': permitido && origen ? origen : 'null',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Metrica-Id, X-Metrica-JWS, X-Metrica-Pais, X-Metrica-Plan, X-Metrica-Extra',
            'Access-Control-Expose-Headers': 'X-Metrica-Restantes',
            Vary: 'Origin',
        };
        const responder = (datos, status = 200, extra) => new Response(JSON.stringify(datos), {
            status, headers: { ...cors, 'Content-Type': 'application/json', ...extra },
        });

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (!permitido) return responder({ error: 'origen' }, 403);
        const ruta = new URL(request.url).pathname.replace(/\/+$/, '');
        if (ruta === '/salud' && request.method === 'GET') {
            return responder({ ok: true, modelo: env.MODELO || MODELO_IA, clave: Boolean(env.OPENAI_API_KEY), kv: Boolean(env.USO),
                // Solo los nombres de lo cargado (nunca los valores), para ver si falta o se llama distinto.
                nombres: Object.keys(env).sort() });
        }
        if (ruta === '/probar' && request.method === 'GET') return probar(env, responder);
        if (ruta === '/ia') {
            if (request.method !== 'POST') return responder({ error: 'metodo' }, 405);
            return ia(request, env, responder);
        }
        return responder({ error: 'ruta' }, 404);
    },
};

async function ia(request, env, responder) {
    const id = request.headers.get('X-Metrica-Id') ?? '';
    if (!/^[a-z0-9]{16,64}$/.test(id)) return responder({ error: 'id' }, 400);
    let cuerpo;
    try { cuerpo = await request.json(); } catch { return responder({ error: 'json' }, 400); }
    // Tres clases de pedido: mejorar una frase o palabra (`pedido`), revisar la letra entera (`revision`)
    // o ideas de qué hablar en una canción (`temas`).
    const revision = cuerpo?.revision != null;
    const temas = !revision && cuerpo?.temas != null;
    const valido = revision ? revisionValida(cuerpo.revision) : temas ? temasValido(cuerpo.temas) : pedidoValido(cuerpo?.pedido);
    if (!valido) return responder({ error: 'pedido' }, 400);

    // La cuota la decide el servidor. X-Metrica-Plan y X-Metrica-Extra se ignoran: cualquiera podía
    // mandarlos y gastar OpenAI. La compra llega en X-Metrica-JWS (uno o varios JWS de StoreKit, separados
    // por coma) y se verifica contra Apple Root CA - G3.
    const ahoraFecha = new Date();
    const ahora = ahoraFecha.getTime();
    const mes = ahoraFecha.toISOString().slice(0, 7);
    const claveDia = `dia:${ahoraFecha.toISOString().slice(0, 10)}`;
    const compras = await leerCompras(request, env, ahora);
    if (compras.error) return responder({ error: compras.error }, 401);
    const cuenta = await prepararCuenta(env.USO, {
        mes, id, ip: ipDe(request), compras: compras.lista,
        cupoGratis: entero(env.CUPO_GRATIS, 20), topeIp: entero(env.TOPE_IP, 100),
    });
    const delDia = Number(await env.USO.get(claveDia)) || 0;
    // Cada consulta gasta lo suyo de la cuota: la letra entera, más.
    const gasto = revision ? GASTO_IA.revision(cuerpo.revision.versos.length, Array.isArray(cuerpo.revision.ya) && cuerpo.revision.ya.length > 0) : temas ? GASTO_IA.temas : GASTO_IA.frase;
    const quedanAntes = totalUsable(cuenta);
    if (quedanAntes < gasto) return conRestantes(responder, { error: 'cupo', quedan: quedanAntes }, 402, quedanAntes);
    if (delDia >= entero(env.TOPE_DIA, 5000)) return responder({ error: 'ocupado' }, 503);

    // El país del iPhone, para la voz de Métrica IA (rioplatense solo en Argentina; pedido de Swa).
    const opciones = { pais: (request.headers.get('X-Metrica-Pais') ?? '').toUpperCase() };
    const { instrucciones, entrada } = revision ? promptDeRevision(cuerpo.revision, undefined, opciones)
        : temas ? promptDeTemas(cuerpo.temas, undefined, opciones) : promptDeSugerencias(cuerpo.pedido, undefined, opciones);
    const { contenido, error } = await llamarModelo(env, instrucciones, entrada, revision ? 3000 : 1600, id, revision ? env.ESFUERZO_REVISION : env.ESFUERZO);
    if (error) return responder({ error: 'modelo' }, 502);
    const ya = new Set(revision && Array.isArray(cuerpo.revision.ya) ? cuerpo.revision.ya : []);
    const sugerencias = revision ? leerRevision(contenido).filter(s => !ya.has(s.verso)) : temas ? leerTemas(contenido) : leerRespuesta(contenido).slice(0, PEDIDAS_IA);
    // La letra entera puede volver sin cambios (estaba bien): no es un error.
    const sinCambios = revision && !sugerencias.length && contestoLista(contenido);
    if (!sugerencias.length && !sinCambios) {
        console.log('El modelo no devolvió sugerencias que se puedan leer:', contenido.slice(0, 300));
        return responder({ error: 'modelo' }, 502);
    }

    // Solo cuenta si salió bien.
    const ttl = { expirationTtl: TTL };
    // Sin cambios no gasta cuota, hasta REVISIONES_SIN_CAMBIOS por mes (pedido de Swa).
    // Sin compra se cuenta por id y por IP, así rotar X-Metrica-Id no da revisiones de más.
    if (sinCambios) {
        const hechas = await Promise.all(cuenta.clavesVacias.map(async k => Number(await env.USO.get(k)) || 0));
        if (Math.max(0, ...hechas) < REVISIONES_SIN_CAMBIOS) {
            await Promise.all([
                ...cuenta.clavesVacias.map((k, i) => env.USO.put(k, String(hechas[i] + 1), ttl)),
                env.USO.put(claveDia, String(delDia + 1), ttl),
            ]);
            return conRestantes(responder, { sugerencias: [], quedan: quedanAntes }, 200, quedanAntes);
        }
    }
    const quedan = await descontar(env.USO, cuenta, gasto, TTL);
    if (quedan == null) return conRestantes(responder, { error: 'cupo', quedan: totalUsable(cuenta) }, 402, totalUsable(cuenta));
    await env.USO.put(claveDia, String(delDia + 1), ttl);
    return conRestantes(responder, { sugerencias, quedan }, 200, quedan);
}

function conRestantes(responder, datos, status, restantes) {
    return responder(datos, status, { 'X-Metrica-Restantes': String(restantes) });
}

// Los JWS de X-Metrica-JWS. Vacío: sin compra (cupo gratis). Uno malo: 401, no se lo trata como gratis.
async function leerCompras(request, env, ahora) {
    const crudo = request.headers.get('X-Metrica-JWS') ?? '';
    if (crudo.length > 80_000) return { error: 'firma' };
    const tokens = crudo.split(',').map(t => t.trim()).filter(Boolean);
    if (tokens.length > 12) return { error: 'firma' };
    // RAIZ_DE_PRUEBA solo corre si PRUEBA=si (los tests). En producción no se define y vale la raíz de Apple.
    const raiz = env.PRUEBA === 'si' && env.RAIZ_DE_PRUEBA ? desdeBase64(env.RAIZ_DE_PRUEBA) : APPLE_RAIZ;
    const bundleId = env.BUNDLE_ID || 'com.sw413sg.metrica';
    const lista = [];
    const vistos = new Set();
    for (const token of tokens) {
        const verificado = await verificarJws(token, { raiz, bundleId, ahora });
        if (!verificado.ok) return { error: verificado.error };
        const clasificado = clasificar(verificado.transaccion, ahora);
        if (!clasificado.ok) return { error: clasificado.error };
        if (clasificado.inactiva || vistos.has(clasificado.compra.transactionId)) continue;
        vistos.add(clasificado.compra.transactionId);
        lista.push(clasificado.compra);
    }
    return { lista };
}

// Si el modelo contestó la lista, aunque venga vacía (no un texto que no se puede leer).
function contestoLista(contenido) {
    try {
        return Array.isArray(JSON.parse(String(contenido).match(/\{[\s\S]*\}/)?.[0] ?? '').sugerencias);
    } catch {
        return false;
    }
}

// Llama a OpenAI. Devuelve { contenido } o { error } (el error también queda en los logs del Worker,
// Observability en el panel de Cloudflare, para saber por qué falló sin adivinar).
async function llamarModelo(env, instrucciones, entrada, tope, id, esfuerzo = env.ESFUERZO) {
    let respuesta;
    try {
        respuesta = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: env.MODELO || MODELO_IA,
                messages: [{ role: 'system', content: instrucciones }, { role: 'user', content: entrada }],
                response_format: { type: 'json_object' },
                // Lo que piensa el modelo antes de contestar también se cobra y sale de este tope:
                // por eso se le pide que piense poco (ESFUERZO, «low») y el tope deja lugar para eso.
                ...(esfuerzo ? { reasoning_effort: esfuerzo } : {}),
                max_completion_tokens: tope,
                user: id,
                // Las instrucciones son siempre las mismas y la letra se repite entre pedidos de una misma
                // persona: con esta clave OpenAI reusa lo ya leído y lo cobra mucho más barato.
                prompt_cache_key: `metrica-${id}`,
            }),
        });
    } catch (e) {
        console.log('No se pudo llegar a OpenAI:', String(e));
        return { error: `red: ${String(e)}` };
    }
    if (!respuesta.ok) {
        const texto = await respuesta.text().catch(() => '');
        let mensaje = texto.slice(0, 300);
        try { mensaje = JSON.parse(texto).error?.message ?? mensaje; } catch { /* queda el texto */ }
        console.log(`OpenAI respondió ${respuesta.status}:`, mensaje);
        return { error: `${respuesta.status}: ${mensaje}` };
    }
    const datos = await respuesta.json().catch(() => ({}));
    return { contenido: datos.choices?.[0]?.message?.content ?? '' };
}

// GET /probar: un pedido mínimo a OpenAI para ver desde el navegador si la clave, el modelo y los
// parámetros andan (dice el error de OpenAI tal cual, sin la clave). Cuenta en el techo del día y
// tiene su propio tope chico, así no sirve para gastar.
async function probar(env, responder) {
    const clave = `probar:${new Date().toISOString().slice(0, 10)}`;
    const hechas = Number(await env.USO.get(clave)) || 0;
    if (hechas >= 30) return responder({ ok: false, error: 'Ya se probó mucho hoy.' }, 429);
    await env.USO.put(clave, String(hechas + 1), { expirationTtl: 2 * 24 * 60 * 60 });
    const { contenido, error } = await llamarModelo(env, 'Respondé solo con JSON.', 'Devolvé {"sugerencias": ["hola"]}.', 300, 'prueba000000000000');
    return error ? responder({ ok: false, error }, 502) : responder({ ok: true, respuesta: contenido });
}
