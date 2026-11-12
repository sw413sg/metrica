// Métrica web: vincular la web con el iPhone escaneando un QR, como WhatsApp Web (ver README.md).
//
// El servidor solo hace de buzón y nunca puede leer las letras:
// 1. La web pide un código (`crear`) y muestra un QR con ese código y su clave pública (ECDH P-256).
//    El código vence en 60 s y sirve una sola vez.
// 2. El iPhone lo escanea, arma con esa clave pública la clave compartida y le manda por acá su
//    clave pública y la clave de sus datos cifrada (`vincular`). El servidor crea la sesión de la web
//    y deja todo en el buzón del código.
// 3. La web lo retira (`mirar`) y desde ahí manda y trae registros cifrados (AES-GCM) con su sesión.
//
// Cada iPhone tiene un «espacio» (un Durable Object por espacio) con sus registros cifrados y las
// sesiones de la web. Una sesión que no se usa en 14 días se cierra sola; el iPhone ve las sesiones
// y puede cerrar cualquiera, o borrar todo. Un espacio sin uso en 30 días se borra entero.
// Los nombres de los registros llegan como HMAC (no dicen de qué letra o palabra son) y el
// contenido, cifrado: el servidor guarda bytes que no puede abrir.

export const VENCE_QR = 60 * 1000;
export const QR_POR_HORA = 30;
export const SESION_INACTIVA = 14 * 24 * 60 * 60 * 1000;
export const ESPACIO_INACTIVO = 30 * 24 * 60 * 60 * 1000;
export const SESIONES_MAX = 5;
// Gratis con límites, para que convenga Métrica+ (pedido de Swa): una sola compu a la vez y la sesión
// se cierra a los 3 días sin uso. Con Métrica+, hasta 5 y 14 días. El plan lo dice el iPhone al vincular.
export const PLANES_WEB = {
    gratis: { sesiones: 1, inactiva: 3 * 24 * 60 * 60 * 1000 },
    mas: { sesiones: SESIONES_MAX, inactiva: SESION_INACTIVA },
};
export const REGISTROS_MAX = 20000;
export const POR_PAGINA = 300;
const MINUTO = 60 * 1000;

export const NOMBRE_ENLACES = 'metrica-enlaces';
export const formatos = {
    codigo: /^[0-9a-f]{32}$/,
    espacio: /^[0-9a-f]{32}$/,
    token: /^[0-9a-f]{64}$/,
    id: /^[0-9a-f]{16}$/,
    registro: /^[0-9a-f]{64}$/,
    publica: /^[A-Za-z0-9_-]{80,100}$/,
    clave: /^[A-Za-z0-9+/=_-]{40,200}$/,
    ia: /^[a-z0-9]{16,64}$/,
};

function aleatorio(bytes) {
    const datos = crypto.getRandomValues(new Uint8Array(bytes));
    return [...datos].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hash(texto) {
    const datos = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(datos)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const navegadorCorto = texto => String(texto ?? '').slice(0, 80);

// --- Los códigos del QR (un solo objeto para todos) ---

export async function operarQR(almacen, pedido) {
    const ahora = pedido.ahora;
    switch (pedido.accion) {
    case 'crear': {
        const claveIp = `ip:${pedido.ip}:${Math.floor(ahora / (60 * MINUTO))}`;
        const usados = (await almacen.get(claveIp)) ?? 0;
        if (usados >= QR_POR_HORA) return { error: 'muchos' };
        await almacen.put(claveIp, usados + 1);
        const codigo = aleatorio(16), secreto = aleatorio(32);
        await almacen.put(`qr:${codigo}`, { secreto: await hash(secreto), vence: ahora + VENCE_QR, navegador: navegadorCorto(pedido.navegador) });
        return { codigo, secreto, vence: ahora + VENCE_QR };
    }
    case 'mirar': {
        const qr = await almacen.get(`qr:${pedido.codigo}`);
        if (!qr || qr.secreto !== await hash(pedido.secreto)) return { estado: 'vencido' };
        if (qr.listo) {
            await almacen.delete(`qr:${pedido.codigo}`);
            return { estado: 'listo', ...qr.listo };
        }
        if (qr.vence < ahora) {
            await almacen.delete(`qr:${pedido.codigo}`);
            return { estado: 'vencido' };
        }
        return { estado: qr.reclamado ? 'escaneado' : 'esperando' };
    }
    case 'reclamar': {
        // Una sola vez: un QR fotografiado no sirve para vincular otra vez.
        const qr = await almacen.get(`qr:${pedido.codigo}`);
        if (!qr || qr.reclamado || qr.vence < ahora) return { ok: false };
        await almacen.put(`qr:${pedido.codigo}`, { ...qr, reclamado: true, vence: ahora + VENCE_QR });
        return { ok: true, navegador: qr.navegador };
    }
    case 'entregar': {
        const qr = await almacen.get(`qr:${pedido.codigo}`);
        if (!qr || !qr.reclamado) return { ok: false };
        await almacen.put(`qr:${pedido.codigo}`, { ...qr, listo: pedido.datos });
        return { ok: true };
    }
    case 'limpiar': {
        const hora = Math.floor(ahora / (60 * MINUTO));
        for (const [clave, valor] of await almacen.list({ prefix: 'qr:' })) if (valor.vence < ahora) await almacen.delete(clave);
        for (const clave of (await almacen.list({ prefix: 'ip:' })).keys()) if (Number(clave.split(':').pop()) < hora) await almacen.delete(clave);
        return { ok: true };
    }
    }
    return { error: 'accion' };
}

// --- El espacio de cada iPhone ---

const claveRev = rev => `rev:${String(rev).padStart(12, '0')}`;

// Quién pide: el iPhone (con su token) o una sesión de la web. Nil si el token no vale o la sesión venció.
async function quien(almacen, token, ahora) {
    const clave = await hash(token);
    const telefono = await almacen.get('tel');
    if (telefono && telefono.hash === clave) return { autor: 'tel', telefono: true };
    const sesion = await almacen.get(`ses:${clave}`);
    if (!sesion) return null;
    if (sesion.usada < ahora - (sesion.inactiva ?? SESION_INACTIVA)) {
        await almacen.delete(`ses:${clave}`);
        return null;
    }
    // La hora de uso se anota como mucho una vez por minuto (cada escritura cuesta).
    if (sesion.usada < ahora - MINUTO) await almacen.put(`ses:${clave}`, { ...sesion, usada: ahora });
    return { autor: sesion.id, telefono: false, clave: `ses:${clave}` };
}

async function sesiones(almacen) {
    return [...(await almacen.list({ prefix: 'ses:' })).entries()].map(([clave, s]) => ({ ...s, clave }));
}

export async function operarEspacio(almacen, pedido) {
    const ahora = pedido.ahora;
    const meta = (await almacen.get('meta')) ?? { rev: 0, registros: 0, actividad: ahora };
    // Solo un pedido que vale cuenta como uso (uno con un token inventado no mantiene vivo el espacio).
    const anotarUso = async () => {
        if (meta.actividad >= ahora - MINUTO) return;
        meta.actividad = ahora;
        await almacen.put('meta', meta);
    };

    if (pedido.accion === 'nuevaSesion') {
        // Solo el iPhone dueño del espacio (el primero que lo crea deja su token).
        const telefono = await almacen.get('tel');
        const clave = await hash(pedido.token);
        if (telefono && telefono.hash !== clave) return { error: 'token' };
        if (!telefono) await almacen.put('tel', { hash: clave, creado: ahora });
        // El id de la IA del iPhone (X-Metrica-Id): la web vinculada gasta esos créditos y no otros.
        if (formatos.ia.test(pedido.ia ?? '')) await almacen.put('tel', { ...((await almacen.get('tel')) ?? {}), ia: pedido.ia });
        // Si ya está el máximo del plan, se cierra la usada hace más tiempo (como WhatsApp: la nueva entra).
        const plan = PLANES_WEB[pedido.plan] ?? PLANES_WEB.gratis;
        const todas = (await sesiones(almacen)).sort((a, b) => a.usada - b.usada);
        for (const vieja of todas.slice(0, Math.max(0, todas.length - plan.sesiones + 1))) await almacen.delete(vieja.clave);
        const token = aleatorio(32), id = aleatorio(8);
        await almacen.put(`ses:${await hash(token)}`, { id, navegador: navegadorCorto(pedido.navegador), creada: ahora, usada: ahora, inactiva: plan.inactiva });
        meta.actividad = ahora;
        await almacen.put('meta', meta);
        // `nuevo`: el espacio estaba vacío (primera vez, o se borró): el iPhone tiene que mandar todo.
        return { token, id, nuevo: !telefono };
    }

    const yo = await quien(almacen, pedido.token ?? '', ahora);
    if (!yo) return { error: 'sesion' };
    await anotarUso();

    switch (pedido.accion) {
    case 'traer': {
        const desde = Math.max(0, Math.floor(Number(pedido.desde) || 0));
        const lista = await almacen.list({ prefix: 'rev:', start: claveRev(desde + 1), limit: POR_PAGINA });
        const registros = [];
        let ultimo = desde;
        for (const [claveDeRev, c] of lista) {
            ultimo = Number(claveDeRev.slice(4));
            const registro = await almacen.get(`reg:${c}`);
            if (registro && registro.autor !== yo.autor) registros.push({ c, d: registro.d });
        }
        const mas = lista.size >= POR_PAGINA;
        return { registros, rev: mas ? ultimo : Math.max(ultimo, meta.rev), mas };
    }
    case 'guardar': {
        // El iPhone deja (o actualiza) el id de su IA, para los que se vincularon antes de mandarlo al vincular.
        if (yo.telefono && formatos.ia.test(pedido.ia ?? '')) {
            const telefono = await almacen.get('tel');
            if (telefono && telefono.ia !== pedido.ia) await almacen.put('tel', { ...telefono, ia: pedido.ia });
        }
        const cambios = [...(pedido.guardar ?? []).map(r => [r.c, r.d]), ...(pedido.borrar ?? []).map(c => [c, null])];
        for (const [c, d] of cambios) {
            const anterior = await almacen.get(`reg:${c}`);
            if (anterior) await almacen.delete(claveRev(anterior.rev));
            else if (meta.registros >= REGISTROS_MAX) return { error: 'lleno' };
            else meta.registros += 1;
            meta.rev += 1;
            await almacen.put(`reg:${c}`, { d, rev: meta.rev, autor: yo.autor });
            await almacen.put(claveRev(meta.rev), c);
        }
        await almacen.put('meta', meta);
        return { rev: meta.rev };
    }
    case 'sesiones': {
        if (!yo.telefono) return { error: 'sesion' };
        return { sesiones: (await sesiones(almacen)).sort((a, b) => b.usada - a.usada)
            .map(({ id, navegador, creada, usada, inactiva }) => ({ id, navegador, creada, usada, vence: usada + (inactiva ?? SESION_INACTIVA) })) };
    }
    case 'cerrar': {
        // La web cierra la suya; el iPhone, la que diga.
        if (!yo.telefono) {
            await almacen.delete(yo.clave);
            return { ok: true };
        }
        const sesion = (await sesiones(almacen)).find(s => s.id === pedido.id);
        if (sesion) await almacen.delete(sesion.clave);
        return { ok: Boolean(sesion) };
    }
    case 'validarIA': {
        // La IA desde la web: solo con una sesión vinculada que vale, y con el id del iPhone si lo dejó.
        if (yo.telefono) return { error: 'sesion' };
        return { ok: true, ia: (await almacen.get('tel'))?.ia ?? null };
    }
        case 'borrarTodo':
        if (!yo.telefono) return { error: 'sesion' };
        return { borrarTodo: true };
    }
    return { error: 'accion' };
}

// Revisa una vez por día: borra las sesiones vencidas y, si nadie lo usó en 30 días, el espacio entero.
export async function revisarEspacio(almacen, ahora) {
    const meta = await almacen.get('meta');
    if (!meta || meta.actividad < ahora - ESPACIO_INACTIVO) return { borrarTodo: true };
    for (const sesion of await sesiones(almacen)) if (sesion.usada < ahora - (sesion.inactiva ?? SESION_INACTIVA)) await almacen.delete(sesion.clave);
    return { borrarTodo: false };
}

// --- Durable Objects ---

const DIA = 24 * 60 * MINUTO;

export class Enlaces {
    constructor(ctx) { this.ctx = ctx; }

    async fetch(request) {
        const pedido = await request.json();
        const resultado = await this.ctx.storage.transaction(txn => operarQR(txn, pedido));
        if (pedido.accion === 'crear' && !(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 5 * MINUTO);
        return Response.json(resultado);
    }

    async alarm() {
        await this.ctx.storage.transaction(txn => operarQR(txn, { accion: 'limpiar', ahora: Date.now() }));
        if ((await this.ctx.storage.list({ prefix: 'qr:', limit: 1 })).size) await this.ctx.storage.setAlarm(Date.now() + 5 * MINUTO);
    }
}

export class Espacio {
    constructor(ctx) { this.ctx = ctx; }

    async fetch(request) {
        const pedido = await request.json();
        const resultado = await this.ctx.storage.transaction(txn => operarEspacio(txn, pedido));
        if (resultado.borrarTodo) {
            await this.ctx.storage.deleteAll();
            return Response.json({ ok: true });
        }
        if (!resultado.error && !(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + DIA);
        return Response.json(resultado);
    }

    async alarm() {
        const { borrarTodo } = await this.ctx.storage.transaction(txn => revisarEspacio(txn, Date.now()));
        if (borrarTodo) await this.ctx.storage.deleteAll();
        else await this.ctx.storage.setAlarm(Date.now() + DIA);
    }
}

// --- Rutas (/web/...) ---

async function llamar(espacio, pedido) {
    const respuesta = await espacio.fetch('https://enlace.internal/', { method: 'POST', body: JSON.stringify(pedido) });
    return respuesta.json();
}

const enlaces = env => env.ENLACES.get(env.ENLACES.idFromName(NOMBRE_ENLACES));
const espacioDe = (env, id) => env.ESPACIO.get(env.ESPACIO.idFromName(`espacio:${id}`));

// La IA pedida desde la web (con Origin): solo con una sesión vinculada a un iPhone que vale. Devuelve
// el id de la IA del iPhone (o null si el iPhone todavía no lo mandó), o un error.
export async function sesionParaIA(request, env) {
    if (!env.ENLACES || !env.ESPACIO) return { error: 'vincular' };
    const quien = credencial(request);
    if (!quien) return { error: 'vincular' };
    const respuesta = await llamar(espacioDe(env, quien.espacio), { accion: 'validarIA', token: quien.token, ahora: Date.now() });
    return respuesta.ok ? { ia: respuesta.ia } : { error: 'vincular' };
}

// «Authorization: Bearer <espacio>.<token>», el mismo para el iPhone y para la web.
function credencial(request) {
    const [espacio, token] = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').split('.');
    return formatos.espacio.test(espacio ?? '') && formatos.token.test(token ?? '') ? { espacio, token } : null;
}

const ESTADOS = { sesion: 401, token: 401, lleno: 413, muchos: 429, accion: 400 };

export async function web(request, env, responder, ruta, ip) {
    if (!env.ENLACES || !env.ESPACIO) return responder({ error: 'enlace' }, 503);
    const ahora = Date.now();
    const contestar = datos => datos.error ? responder({ error: datos.error }, ESTADOS[datos.error] ?? 400) : responder(datos);
    let cuerpo = {};
    if (request.method === 'POST') {
        const texto = await request.text();
        if (texto.length > 2_000_000) return responder({ error: 'grande' }, 413);
        try { cuerpo = texto ? JSON.parse(texto) : {}; } catch { return responder({ error: 'json' }, 400); }
    }

    // La web pide un código para el QR.
    if (ruta === '/web/qr' && request.method === 'POST') {
        return contestar(await llamar(enlaces(env), { accion: 'crear', ip, navegador: cuerpo.navegador, ahora }));
    }
    // La web pregunta si ya la escanearon.
    if (ruta === '/web/qr/estado' && request.method === 'POST') {
        if (!formatos.codigo.test(cuerpo.codigo ?? '') || !formatos.token.test(cuerpo.secreto ?? '')) return responder({ error: 'pedido' }, 400);
        return contestar(await llamar(enlaces(env), { accion: 'mirar', codigo: cuerpo.codigo, secreto: cuerpo.secreto, ahora }));
    }
    // El iPhone escaneó el QR.
    if (ruta === '/web/vincular' && request.method === 'POST') {
        const { codigo, espacio, token, publica, clave, plan, ia } = cuerpo;
        if (!formatos.codigo.test(codigo ?? '') || !formatos.espacio.test(espacio ?? '') || !formatos.token.test(token ?? '')
            || !formatos.publica.test(publica ?? '') || !formatos.clave.test(clave ?? '')) return responder({ error: 'pedido' }, 400);
        const reclamo = await llamar(enlaces(env), { accion: 'reclamar', codigo, ahora });
        if (!reclamo.ok) return responder({ error: 'vencido' }, 410);
        const sesion = await llamar(espacioDe(env, espacio), { accion: 'nuevaSesion', token, navegador: reclamo.navegador, plan, ia, ahora });
        if (sesion.error) return contestar(sesion);
        await llamar(enlaces(env), { accion: 'entregar', codigo, ahora, datos: { espacio, token: sesion.token, publica, clave } });
        return responder({ ok: true, id: sesion.id, navegador: reclamo.navegador, nuevo: sesion.nuevo });
    }

    const quien = credencial(request);
    if (!quien) return responder({ error: 'sesion' }, 401);
    const espacio = espacioDe(env, quien.espacio);
    if (ruta === '/web/traer' && request.method === 'POST') {
        return contestar(await llamar(espacio, { accion: 'traer', token: quien.token, desde: cuerpo.desde, ahora }));
    }
    if (ruta === '/web/guardar' && request.method === 'POST') {
        const guardar = Array.isArray(cuerpo.guardar) ? cuerpo.guardar : [];
        const borrar = Array.isArray(cuerpo.borrar) ? cuerpo.borrar : [];
        if (guardar.length + borrar.length > 200
            || !guardar.every(r => formatos.registro.test(r?.c ?? '') && typeof r.d === 'string' && r.d.length < 400_000)
            || !borrar.every(c => formatos.registro.test(c ?? ''))) return responder({ error: 'pedido' }, 400);
        return contestar(await llamar(espacio, { accion: 'guardar', token: quien.token, guardar, borrar, ia: cuerpo.ia, ahora }));
    }
    if (ruta === '/web/sesiones' && request.method === 'POST') {
        return contestar(await llamar(espacio, { accion: 'sesiones', token: quien.token, ahora }));
    }
    if (ruta === '/web/cerrar' && request.method === 'POST') {
        if (cuerpo.id != null && !formatos.id.test(cuerpo.id)) return responder({ error: 'pedido' }, 400);
        return contestar(await llamar(espacio, { accion: 'cerrar', token: quien.token, id: cuerpo.id, ahora }));
    }
    if (ruta === '/web/borrar' && request.method === 'POST') {
        return contestar(await llamar(espacio, { accion: 'borrarTodo', token: quien.token, ahora }));
    }
    return responder({ error: 'ruta' }, 404);
}
