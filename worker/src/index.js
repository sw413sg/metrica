// Worker de Cloudflare de Métrica (ver README.md). Cada función va en su ruta, así se pueden sumar
// otras (por ejemplo, conectar la web con iCloud) sin tocar las que ya andan:
// - GET /salud: para ver que está desplegado (no gasta nada).
// - POST /ia: «Mejorar frase» y «Lo que cambiaría». Recibe el pedido que arma la app, arma el mensaje
//   (el mismo de js/logica/ia-prompt.js), llama a OpenAI con la clave guardada como secret y cuenta
//   el uso de cada persona por mes en KV.
import { MODELO_IA, pedidoValido, promptDeSugerencias, leerRespuesta, revisionValida, promptDeRevision, leerRevision } from '../../js/logica/ia-prompt.js';

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
            'Access-Control-Allow-Headers': 'Content-Type, X-Metrica-Id',
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
    // Dos clases de pedido: mejorar una frase o palabra (`pedido`) o revisar la letra entera (`revision`).
    const revision = cuerpo?.revision != null;
    if (revision ? !revisionValida(cuerpo.revision) : !pedidoValido(cuerpo?.pedido)) return responder({ error: 'pedido' }, 400);

    // Límite por persona y por mes, y un techo de todo el día para que la cuenta no se dispare.
    const ahora = new Date().toISOString();
    const clavePersona = `uso:${ahora.slice(0, 7)}:${id}`;
    const claveDia = `dia:${ahora.slice(0, 10)}`;
    const [usadas, delDia] = (await Promise.all([env.USO.get(clavePersona), env.USO.get(claveDia)])).map(v => Number(v) || 0);
    // TODO cuando se decida el plan: con un comprobante válido de StoreKit, el tope es TOPE_PLAN.
    const tope = Number(env.CUPO_GRATIS) || 20;
    if (usadas >= tope) return responder({ error: 'cupo', quedan: 0 }, 429);
    if (delDia >= (Number(env.TOPE_DIA) || 5000)) return responder({ error: 'ocupado' }, 503);

    const { instrucciones, entrada } = revision ? promptDeRevision(cuerpo.revision) : promptDeSugerencias(cuerpo.pedido);
    let respuesta;
    try {
        respuesta = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: env.MODELO || MODELO_IA,
                messages: [{ role: 'system', content: instrucciones }, { role: 'user', content: entrada }],
                response_format: { type: 'json_object' },
                max_completion_tokens: revision ? 900 : 600,
                user: id,
            }),
        });
    } catch {
        return responder({ error: 'modelo' }, 502);
    }
    if (!respuesta.ok) return responder({ error: 'modelo' }, 502);
    const datos = await respuesta.json().catch(() => ({}));
    const contenido = datos.choices?.[0]?.message?.content ?? '';
    const sugerencias = revision ? leerRevision(contenido) : leerRespuesta(contenido).slice(0, 10);
    if (!sugerencias.length) return responder({ error: 'modelo' }, 502);

    // Solo cuenta si salió bien.
    const ttl = { expirationTtl: DIAS_KV * 24 * 60 * 60 };
    await Promise.all([env.USO.put(clavePersona, String(usadas + 1), ttl), env.USO.put(claveDia, String(delDia + 1), ttl)]);
    return responder({ sugerencias, quedan: tope - usadas - 1 });
}
