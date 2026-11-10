// Cuánto da cada compra de la app. Las cantidades están en CLAUDE.md (pedido de Swa):
// Métrica + (pago único) regala 100 una sola vez; Métrica + IA son 300 por mes;
// los cinco paquetes de «Más IA» suman 300, 800, 1.650, 5.000 y 8.500.
// El id del pago único es `metrica.extras` (PENDIENTES-SWIFT.md y compra.js: el id de
// StoreKit no se renombra; en la tienda se muestra como «Métrica +»).
// El de 300 consultas está escrito como `metrica.ia.mas`. Los otros cuatro no están
// escritos enteros en este repo (la app Swift es privada): se aceptan las dos formas
// del prefijo `metrica.ia.mas*` con la cantidad. Cualquier otro productId se rechaza.
const PAQUETES = [
    [300, ['metrica.ia.mas', 'metrica.ia.mas.300', 'metrica.ia.mas300']],
    [800, ['metrica.ia.mas.800', 'metrica.ia.mas800']],
    [1650, ['metrica.ia.mas.1650', 'metrica.ia.mas1650']],
    [5000, ['metrica.ia.mas.5000', 'metrica.ia.mas5000']],
    [8500, ['metrica.ia.mas.8500', 'metrica.ia.mas8500']],
];

export const PRODUCTOS = {
    'metrica.extras': { tipo: 'plus', consultas: 100 },
    'metrica.ia': { tipo: 'suscripcion', consultas: 300 },
};
for (const [consultas, ids] of PAQUETES) {
    for (const id of ids) PRODUCTOS[id] = { tipo: 'paquete', consultas };
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
        },
    };
}

function restanteDe(pool) {
    return pool.bolsa ? Math.max(0, pool.restante) : Math.max(0, pool.tope - pool.usadas);
}

// Lo que esta persona puede gastar ahora. El cupo gratis además no puede pasar el tope de la IP.
export function totalUsable(cuenta) {
    let ip = Math.max(0, cuenta.ipTope - cuenta.ipUsadas);
    let suma = 0;
    for (const pool of cuenta.pools) {
        if (pool.tipo === 'gratis') suma += Math.min(restanteDe(pool), ip);
        else suma += restanteDe(pool);
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
export async function prepararCuenta(kv, { mes, id, ip, compras, cupoGratis, topeIp }) {
    const subs = compras.filter(c => c.tipo === 'suscripcion');
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
    } else {
        const clave = `cuota:mes:${mes}:id:${id}`;
        pools.push({ tipo: 'gratis', clave, tope: cupoGratis, usadas: await usadas(kv, clave) });
    }
    const bolsas = compras
        .filter(c => c.tipo === 'plus' || c.tipo === 'paquete')
        .sort((a, b) => (a.transactionId < b.transactionId ? -1 : 1));
    for (const compra of bolsas) {
        const clave = `cuota:bolsa:${compra.transactionId}`;
        const guardado = await kv.get(clave);
        // null: primera vez que vemos esta transacción, y vale el paquete entero.
        // "0" o cualquier número: ya se acreditó y esto es lo que queda.
        const restante = guardado == null ? compra.consultas : Math.max(0, Number(guardado) || 0);
        pools.push({ tipo: 'bolsa', bolsa: true, clave, restante });
    }
    const ipClave = `cuota:mes:${mes}:ip:${ip}`;
    return {
        pools,
        ipClave,
        ipTope: topeIp,
        ipUsadas: await usadas(kv, ipClave),
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
    const escrituras = [];
    for (const pool of cuenta.pools) {
        if (!falta) break;
        const puede = pool.tipo === 'gratis' ? Math.min(restanteDe(pool), ipLibre) : restanteDe(pool);
        const toma = Math.min(puede, falta);
        if (!toma) continue;
        falta -= toma;
        if (pool.bolsa) {
            pool.restante -= toma;
            // Sin vencimiento: si la clave se borrara, el mismo JWS volvería a sumar el paquete.
            escrituras.push(kv.put(pool.clave, String(pool.restante)));
        } else {
            pool.usadas += toma;
            escrituras.push(kv.put(pool.clave, String(pool.usadas), { expirationTtl: ttl }));
            if (pool.tipo === 'gratis') {
                cuenta.ipUsadas += toma;
                ipLibre -= toma;
                escrituras.push(kv.put(cuenta.ipClave, String(cuenta.ipUsadas), { expirationTtl: ttl }));
            }
        }
    }
    await Promise.all(escrituras);
    return totalUsable(cuenta);
}
