// Worker de Cloudflare de Métrica (ver README.md). Cada función va en su ruta, así se pueden sumar
// otras (por ejemplo, conectar la web con iCloud) sin tocar las que ya andan:
// - GET /salud: para ver que está desplegado (no gasta nada).
// - POST /ia: «Mejorar frase» y «Lo que cambiaría». Recibe el pedido que arma la app, arma el mensaje
//   (el mismo de js/logica/ia-prompt.js), llama a OpenAI con la clave guardada como secret y cuenta
//   el uso de cada persona por mes en KV.
import { MODELO_IA, GASTO_IA, pedidoValido, promptDeSugerencias, leerRespuesta, revisionValida, promptDeRevision, leerRevision, temasValido, promptDeTemas, leerTemas } from '../../js/logica/ia-prompt.js';

const DIAS_KV = 40; // el contador de un mes se borra solo después

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
            'Access-Control-Allow-Headers': 'Content-Type, X-Metrica-Id, X-Metrica-Plan',
            Vary: 'Origin',
        };
        const responder = (datos, status = 200) => new Response(JSON.stringify(datos), {
            status, headers: { ...cors, 'Content-Type': 'application/json' },
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

    // Límite por persona y por mes, y un techo de todo el día para que la cuenta no se dispare.
    const ahora = new Date().toISOString();
    const clavePersona = `uso:${ahora.slice(0, 7)}:${id}`;
    const claveDia = `dia:${ahora.slice(0, 10)}`;
    const [usadas, delDia] = (await Promise.all([env.USO.get(clavePersona), env.USO.get(claveDia)])).map(v => Number(v) || 0);
    // Con Métrica + IA (suscripción `metrica.ia`), TOPE_PLAN; si no, CUPO_GRATIS. TODO antes del App
    // Store: verificar el comprobante firmado de StoreKit en vez de creerle a la cabecera (mientras
    // tanto, PLAN_SIN_VERIFICAR = "si" la acepta, para probar en TestFlight).
    const plan = request.headers.get('X-Metrica-Plan') === 'metrica.ia' && env.PLAN_SIN_VERIFICAR === 'si';
    const tope = plan ? Number(env.TOPE_PLAN) || 500 : Number(env.CUPO_GRATIS) || 20;
    // Cada consulta gasta lo suyo de la cuota: la letra entera, más.
    const gasto = revision ? GASTO_IA.revision(cuerpo.revision.versos.length) : temas ? GASTO_IA.temas : GASTO_IA.frase;
    if (usadas + gasto > tope) return responder({ error: 'cupo', quedan: Math.max(0, tope - usadas) }, 429);
    if (delDia >= (Number(env.TOPE_DIA) || 5000)) return responder({ error: 'ocupado' }, 503);

    const { instrucciones, entrada } = revision ? promptDeRevision(cuerpo.revision)
        : temas ? promptDeTemas(cuerpo.temas) : promptDeSugerencias(cuerpo.pedido);
    const { contenido, error } = await llamarModelo(env, instrucciones, entrada, revision ? 3000 : 1000, id, revision ? env.ESFUERZO_REVISION : env.ESFUERZO);
    if (error) return responder({ error: 'modelo' }, 502);
    const sugerencias = revision ? leerRevision(contenido) : temas ? leerTemas(contenido) : leerRespuesta(contenido).slice(0, 10);
    if (!sugerencias.length) {
        console.log('El modelo no devolvió sugerencias que se puedan leer:', contenido.slice(0, 300));
        return responder({ error: 'modelo' }, 502);
    }

    // Solo cuenta si salió bien.
    const ttl = { expirationTtl: DIAS_KV * 24 * 60 * 60 };
    await Promise.all([env.USO.put(clavePersona, String(usadas + gasto), ttl), env.USO.put(claveDia, String(delDia + 1), ttl)]);
    return responder({ sugerencias, quedan: tope - usadas - gasto });
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
