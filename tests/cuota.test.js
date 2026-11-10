import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararCuenta, descontar, totalUsable, clasificar, operarCuota } from '../worker/src/cuota.js';

function kvDe() {
    const datos = new Map();
    return { get: async k => datos.get(k) ?? null, put: async (k, v) => { datos.set(k, v); } };
}

const ID = 'abcdefghij0123456789';

test('la suscripción son 300 por mes y el regalo de Métrica + no se renueva ni se suma dos veces', async () => {
    const kv = kvDe();
    const compras = [
        { tipo: 'suscripcion', consultas: 300, transactionId: '9', originalTransactionId: '9' },
        { tipo: 'plus', consultas: 100, transactionId: '8', originalTransactionId: '8' },
    ];
    const armar = mes => prepararCuenta(kv, { mes, id: ID, ip: '1.1.1.1', compras, cupoGratis: 20, topeIp: 100 });
    let cuenta = await armar('2026-11');
    // Con suscripción no se suman las 20 gratis: 300 + 100 de regalo.
    assert.equal(totalUsable(cuenta), 400);
    assert.equal(await descontar(kv, cuenta, 340, 99999), 60);
    cuenta = await armar('2026-12');
    // El mes vuelve a 300; el regalo sigue en lo que quedaba (60), no en 100 otra vez.
    assert.equal(totalUsable(cuenta), 360);
});

test('los cinco paquetes de Más IA son los de Extras.storekit', () => {
    const ahora = Date.now();
    const base = { transactionId: '7', originalTransactionId: '7', type: 'Consumable' };
    const esperados = {
        'metrica.ia.mas': 300,
        'metrica.ia.mas5': 800,
        'metrica.ia.mas10': 1650,
        'metrica.ia.mas30': 5000,
        'metrica.ia.mas50': 8500,
    };
    for (const [productId, consultas] of Object.entries(esperados)) {
        assert.equal(clasificar({ ...base, productId }, ahora).compra.consultas, consultas);
    }
    assert.equal(clasificar({ ...base, productId: 'metrica.ia.mas', revocationDate: ahora }, ahora).inactiva, true);
    assert.equal(clasificar({ ...base, productId: 'metrica.ia.mas800' }, ahora).error, 'producto');
    assert.equal(clasificar({ ...base, productId: 'metrica.ia.mas.800' }, ahora).error, 'producto');
    assert.equal(clasificar({ ...base, productId: 'metrica.ia', type: 'Auto-Renewable Subscription', expiresDate: ahora - 1000 }, ahora).inactiva, true);
    assert.equal(clasificar({ ...base, productId: 'metrica.extras', type: 'Non-Consumable' }, ahora).compra.consultas, 100);
});

test('un paquete queda anotado aunque el pedido lo pague el mes (la app cierra la transacción)', async () => {
    const kv = kvDe();
    const paquete = { tipo: 'paquete', consultas: 300, transactionId: 'p1', originalTransactionId: 'p1' };
    const base = { mes: '2026-11', id: ID, ip: '1.1.1.1', cupoGratis: 20, topeIp: 100, claveDia: 'dia:x', topeDia: 1000, ttl: 99999, limiteVacias: 10 };
    // Con cuota del mes, el gasto sale del mes, pero la bolsa del paquete ya queda guardada.
    const r = await operarCuota(kv, { ...base, compras: [paquete], accion: 'gastar', gasto: 1 });
    assert.equal(r.quedan, 319);
    assert.equal(await kv.get('cuota:bolsa:p1'), '300');
    // El próximo pedido ya no trae el JWS (la app cerró la transacción): las 300 siguen estando.
    const sinJws = await operarCuota(kv, { ...base, compras: [], accion: 'gastar', gasto: 19 });
    assert.equal(sinJws.quedan, 300);
    const delPaquete = await operarCuota(kv, { ...base, compras: [], accion: 'gastar', gasto: 2 });
    assert.equal(delPaquete.quedan, 298);
    assert.equal(await kv.get('cuota:bolsa:p1'), '298');
    // Y si vuelve a llegar el mismo JWS, no se suma dos veces.
    const otraVez = await operarCuota(kv, { ...base, compras: [paquete], accion: 'mirar' });
    assert.equal(otraVez.quedan, 298);
});
