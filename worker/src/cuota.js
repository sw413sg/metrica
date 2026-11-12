// Cuánto da cada compra. Ids de App/Extras.storekit (app Swift) y cantidades de CLAUDE.md.
// Métrica + (`metrica.extras`, pago único) regala 100 una sola vez. Métrica + IA son 300 por mes.
// Los cinco paquetes de «Más IA» son exactamente estos; cualquier otro productId se rechaza.
const PAQUETES = {
    'metrica.ia.mas': 300,
    'metrica.ia.mas5': 800,
    'metrica.ia.mas10': 1650,
    'metrica.ia.mas30': 5000,
    'metrica.ia.mas50': 8500,
};

export const PRODUCTOS = {
    'metrica.extras': { tipo: 'plus', consultas: 100 },
    'metrica.ia': { tipo: 'suscripcion', consultas: 300 },
};
for (const [id, consultas] of Object.entries(PAQUETES)) {
    PRODUCTOS[id] = { tipo: 'paquete', consultas };
}

const TIPO = {
    plus: 'Non-Consumable',
    suscripcion: 'Auto-Renewable Subscription',
    paquete: 'Consumable',
};

const ID_TX = /^[A-Za-z0-9]{1,64}$/;

function fechaApple(valor) {
    if (valor == null || valor === '') return null;
    const n = Number(valor);
    if (!Number.isFinite(n)) return null;
    // StoreKit manda milisegundos. Si viniera en segundos (menor a 1e12), se pasa.
    return n < 1e12 ? n * 1000 : n;
}

// { ok, compra } si suma, { ok, inactiva } si está firmada pero no da cuota
// (revocada o suscripción vencida), { ok: false, error } si el producto no es de Métrica.
export function clasificar(tx, ahora) {
    const producto = PRODUCTOS[tx.productId];
    if (!producto) return { ok: false, error: 'producto' };
    if (tx.type !== TIPO[producto.tipo]) return { ok: false, error: 'firma' };
    if (!ID_TX.test(tx.transactionId)) return { ok: false, error: 'firma' };
    const original = tx.originalTransactionId || tx.transactionId;
    if (!ID_TX.test(original)) return { ok: false, error: 'firma' };
    if (tx.revocationDate != null && tx.revocationDate !== '') return { ok: true, inactiva: true };
    if (producto.tipo === 'suscripcion') {
        const vence = fechaApple(tx.expiresDate);
        if (vence == null || vence <= ahora) return { ok: true, inactiva: true };
    }
    let consultas = producto.consultas;
    if (producto.tipo === 'paquete') {
        const cantidad = tx.quantity == null ? 1 : Number(tx.quantity);
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10) return { ok: false, error: 'firma' };
        consultas *= cantidad;
    }
    return {
        ok: true,
        compra: {
            tipo: producto.tipo, consultas, transactionId: tx.transactionId, originalTransactionId: original,
            vence: producto.tipo === 'suscripcion' ? fechaApple(tx.expiresDate) : 0,
            // Sandbox (y cualquier cosa que no sea Production) no usa la cuota real del producto.
            sandbox: tx.environment !== 'Production',
        },
    };
}

function restanteDe(pool) {
    return pool.bolsa ? Math.max(0, pool.restante) : Math.max(0, pool.tope - pool.usadas);
}

// Lo que se puede gastar ahora. Gratis y Sandbox comparten el tope de la IP.
// Sandbox, además, no pasa el tope global del día.
// `conDia` en false: lo que se le muestra a la persona, sin el tope global de Sandbox del día (es un freno
// del servidor para las pruebas, no su cuota; si lo pasa, el Worker contesta «ocupado»).
export function totalUsable(cuenta, conDia = true) {
    let ip = Math.max(0, cuenta.ipTope - cuenta.ipUsadas);
    let sandboxDia = conDia ? Math.max(0, cuenta.sandboxDiaTope - cuenta.sandboxDiaUsadas) : Infinity;
    let suma = 0;
    for (const pool of cuenta.pools) {
        const queda = restanteDe(pool);
        if (pool.tipo === 'gratis') {
            const toma = Math.min(queda, ip);
            suma += toma;
            ip -= toma;
        } else if (pool.tipo === 'sandbox') {
            const toma = Math.min(queda, ip, sandboxDia);
            suma += toma;
            ip -= toma;
            sandboxDia -= toma;
        } else if (pool.prueba) {
            const toma = Math.min(queda, sandboxDia);
            suma += toma;
            sandboxDia -= toma;
        } else suma += queda;
    }
    return suma;
}

async function usadas(kv, clave) {
    const valor = await kv.get(clave);
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

// Arma las bolsas de esta persona. La suscripción reemplaza al cupo gratis (no se suman).
// El regalo y los paquetes quedan en una bolsa por transactionId: si la clave ya existe,
// se usa lo que queda y no se vuelve a sumar el paquete.
export async function prepararCuenta(kv, { mes, id, ip, compras, cupoGratis, topeIp, sandboxTope = 0, sandboxDiaTope = 0, claveDia = '', prueba = '', paquetesPrueba = [], topePrueba = 300, regaloPrueba = 100 }) {
    const reales = compras.filter(c => !c.sandbox);
    const deSandbox = compras.filter(c => c.sandbox);
    const subs = reales.filter(c => c.tipo === 'suscripcion');
    const subsSandbox = deSandbox.filter(c => c.tipo === 'suscripcion');
    let sub = null;
    if (subs.length) {
        for (const candidata of subs) {
            const clave = `cuota:mes:${mes}:sub:${candidata.originalTransactionId}`;
            if (await kv.get(clave) != null) { sub = candidata; break; }
        }
        sub ??= subs.reduce((a, b) => (a.vence > b.vence ? a : b));
    }
    const pools = [];
    if (sub) {
        const clave = `cuota:mes:${mes}:sub:${sub.originalTransactionId}`;
        pools.push({ tipo: 'mes', clave, tope: sub.consultas, usadas: await usadas(kv, clave) });
    } else if (subsSandbox.length) {
        // La suscripción comprada en Sandbox (TestFlight con los productos en App Store Connect, App Review):
        // 300 por mes como la compra de prueba, con el tope de Sandbox del día (pedido de Swa: con 30
        // parecía que la cuota y los paquetes se perdían). Por recibo, así rotar el id no la renueva.
        const sandboxSub = subsSandbox.reduce((a, b) => (a.vence > b.vence ? a : b));
        const clave = `cuota:mes:${mes}:sandbox-sub:${sandboxSub.originalTransactionId}`;
        pools.push({ tipo: 'prueba', prueba: true, clave, tope: topePrueba, usadas: await usadas(kv, clave) });
    } else if (prueba === 'metrica.ia') {
        // La «Compra de prueba» de TestFlight (sin productos en App Store Connect): el AppTransaction
        // firmado por Apple dice que es TestFlight. Da la cuota del plan, con el tope de Sandbox del día.
        const clave = `cuota:mes:${mes}:prueba:${id}`;
        pools.push({ tipo: 'prueba', prueba: true, clave, tope: topePrueba, usadas: await usadas(kv, clave) });
    } else if (deSandbox.length) {
        // El tope va por el recibo (originalTransactionId), no por el id del teléfono.
        const vistos = new Set();
        for (const compra of deSandbox) {
            if (vistos.has(compra.originalTransactionId)) continue;
            vistos.add(compra.originalTransactionId);
            const clave = `cuota:mes:${mes}:sandbox:${compra.originalTransactionId}`;
            pools.push({ tipo: 'sandbox', clave, tope: sandboxTope, usadas: await usadas(kv, clave) });
        }
    } else {
        const clave = `cuota:mes:${mes}:id:${id}`;
        pools.push({ tipo: 'gratis', clave, tope: cupoGratis, usadas: await usadas(kv, clave) });
    }
    // Los paquetes ya vistos de este id: la app cierra la transacción del paquete apenas el Worker
    // contesta y no vuelve a mandar su JWS, así que lo que queda se busca por el id.
    const claveDelId = `cuota:bolsas:id:${id}`;
    let delId = [];
    try { delId = JSON.parse(await kv.get(claveDelId) ?? '[]'); } catch { delId = []; }
    if (!Array.isArray(delId)) delId = [];
    const porTx = new Map();
    // Los de Sandbox van con «s:» adelante: siguen contando en el tope de Sandbox del día.
    for (const anotado of delId) {
        if (typeof anotado !== 'string') continue;
        const sandbox = anotado.startsWith('s:');
        const tid = sandbox ? anotado.slice(2) : anotado;
        porTx.set(tid, { transactionId: tid, consultas: 0, guardada: true, sandbox });
    }
    // Los paquetes y el regalo de Sandbox también suman (pedido de Swa), pero con el tope de Sandbox del día.
    for (const c of compras) {
        if (c.tipo === 'plus' || c.tipo === 'paquete') porTx.set(c.transactionId, { ...c, guardada: porTx.has(c.transactionId) });
    }
    const bolsas = [...porTx.values()].sort((a, b) => (a.transactionId < b.transactionId ? -1 : 1));
    for (const compra of bolsas) {
        const clave = `cuota:bolsa:${compra.transactionId}`;
        const guardado = await kv.get(clave);
        // null: primera vez que vemos esta transacción, y vale el paquete entero.
        // "0" o cualquier número: ya se acreditó y esto es lo que queda.
        const restante = guardado == null ? compra.consultas : Math.max(0, Number(guardado) || 0);
        pools.push({ tipo: 'bolsa', bolsa: true, prueba: Boolean(compra.sandbox), sandbox: Boolean(compra.sandbox), clave, restante, nueva: guardado == null, transactionId: compra.transactionId, delId: compra.guardada });
    }
    if (prueba === 'metrica.extras' && !sub) {
        // El regalo de Métrica + en la compra de prueba: una bolsa por id, que no se renueva.
        const clave = `cuota:bolsa:prueba:${id}`;
        const guardado = await kv.get(clave);
        const restante = guardado == null ? regaloPrueba : Math.max(0, Number(guardado) || 0);
        pools.push({ tipo: 'bolsa', bolsa: true, prueba: true, clave, restante, nueva: guardado == null, delId: true });
    }
    // Los paquetes de «Más IA» de la compra de prueba (TestFlight): una bolsa por id y paquete, que cuenta
    // en el tope de Sandbox del día como el resto de la prueba.
    for (const paquete of paquetesPrueba) {
        const clave = `cuota:bolsa:prueba-paquete:${id}:${paquete.idLocal}`;
        const guardado = await kv.get(clave);
        const restante = guardado == null ? paquete.consultas : Math.max(0, Number(guardado) || 0);
        pools.push({ tipo: 'bolsa', bolsa: true, prueba: true, clave, restante, nueva: guardado == null, delId: true });
    }
    const ipClave = `cuota:mes:${mes}:ip:${ip}`;
    const sandboxDiaClave = `sandbox:${claveDia}`;
    return {
        pools,
        ipClave,
        claveDelId,
        ipTope: topeIp,
        ipUsadas: await usadas(kv, ipClave),
        sandboxDiaClave,
        sandboxDiaTope,
        sandboxDiaUsadas: await usadas(kv, sandboxDiaClave),
        clavesVacias: sub
            ? [`vacias:${mes}:sub:${sub.originalTransactionId}`]
            : [`vacias:${mes}:id:${id}`, `vacias:${mes}:ip:${ip}`],
    };
}

// Descuenta `gasto` (primero el mes, que se renueva; después el regalo y los paquetes).
// Devuelve lo que queda, o null si no alcanza (y no escribe nada).
export async function descontar(kv, cuenta, gasto, ttl) {
    if (totalUsable(cuenta) < gasto) return null;
    let falta = gasto;
    let ipLibre = Math.max(0, cuenta.ipTope - cuenta.ipUsadas);
    let sandboxDiaLibre = Math.max(0, cuenta.sandboxDiaTope - cuenta.sandboxDiaUsadas);
    const escrituras = [];
    let tocoIp = false;
    let tocoSandboxDia = false;
    for (const pool of cuenta.pools) {
        if (!falta) break;
        const queda = restanteDe(pool);
        const puede = pool.tipo === 'gratis' ? Math.min(queda, ipLibre)
            : pool.tipo === 'sandbox' ? Math.min(queda, ipLibre, sandboxDiaLibre)
            : pool.prueba ? Math.min(queda, sandboxDiaLibre)
            : queda;
        const toma = Math.min(puede, falta);
        if (!toma) continue;
        falta -= toma;
        if (pool.prueba) {
            cuenta.sandboxDiaUsadas += toma;
            sandboxDiaLibre -= toma;
            tocoSandboxDia = true;
        }
        if (pool.bolsa) {
            pool.restante -= toma;
            // Sin vencimiento: si la clave se borrara, el mismo JWS volvería a sumar el paquete.
            escrituras.push(kv.put(pool.clave, String(pool.restante)));
        } else {
            pool.usadas += toma;
            escrituras.push(kv.put(pool.clave, String(pool.usadas), { expirationTtl: ttl }));
            if (pool.tipo === 'gratis' || pool.tipo === 'sandbox') {
                cuenta.ipUsadas += toma;
                ipLibre -= toma;
                tocoIp = true;
            }
            if (pool.tipo === 'sandbox') {
                cuenta.sandboxDiaUsadas += toma;
                sandboxDiaLibre -= toma;
                tocoSandboxDia = true;
            }
        }
    }
    if (tocoIp) escrituras.push(kv.put(cuenta.ipClave, String(cuenta.ipUsadas), { expirationTtl: ttl }));
    if (tocoSandboxDia) escrituras.push(kv.put(cuenta.sandboxDiaClave, String(cuenta.sandboxDiaUsadas), { expirationTtl: ttl }));
    await Promise.all(escrituras);
    return totalUsable(cuenta);
}

// Un paso de la cuota, para correrlo adentro de la transacción del Durable Object.
// accion: mirar (no escribe), cupo (`/ia/cupo`: no gasta, pero anota los paquetes nuevos, porque la app
// cierra la transacción al ver X-Metrica-Restantes), vacia (la revisión sin cambios) o gastar.
export async function operarCuota(kv, pedido) {
    const cuenta = await prepararCuenta(kv, pedido);
    const dia = Number(await kv.get(pedido.claveDia)) || 0;
    const quedan = totalUsable(cuenta);
    const mostrar = totalUsable(cuenta, false);
    if (pedido.accion === 'mirar') return { quedan, mostrar, dia };
    if (pedido.accion !== 'cupo' && dia >= pedido.topeDia) return { error: 'ocupado', quedan };
    // Un paquete que llega por primera vez se anota ya, aunque este pedido lo pague el mes: la app
    // cierra la transacción cuando ve X-Metrica-Restantes y no vuelve a mandar ese JWS. Si no quedara
    // anotado acá, el paquete se perdía entero.
    await Promise.all(cuenta.pools.filter(p => p.nueva).map(p => {
        p.nueva = false;
        return kv.put(p.clave, String(p.restante));
    }));
    const sinId = cuenta.pools.filter(p => p.bolsa && !p.delId);
    if (sinId.length) {
        const lista = cuenta.pools.filter(p => p.bolsa && p.transactionId).map(p => (p.sandbox ? 's:' : '') + p.transactionId);
        await kv.put(cuenta.claveDelId, JSON.stringify(lista));
        for (const p of sinId) p.delId = true;
    }
    if (pedido.accion === 'cupo') return { quedan, mostrar, dia };
    if (pedido.accion === 'vacia') {
        const hechas = await Promise.all(cuenta.clavesVacias.map(async k => Number(await kv.get(k)) || 0));
        if (Math.max(0, ...hechas) >= pedido.limiteVacias) return { ok: false, quedan };
        await Promise.all([
            ...cuenta.clavesVacias.map((k, i) => kv.put(k, String(hechas[i] + 1))),
            kv.put(pedido.claveDia, String(dia + 1)),
        ]);
        return { ok: true, quedan, mostrar };
    }
    const despues = await descontar(kv, cuenta, pedido.gasto, pedido.ttl);
    if (despues == null) return { error: 'cupo', quedan, mostrar };
    await kv.put(pedido.claveDia, String(dia + 1));
    return { quedan: despues, mostrar: totalUsable(cuenta, false) };
}
