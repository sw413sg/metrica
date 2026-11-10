// Un solo Durable Object para toda la cuota. Así dos pedidos a la vez (el mismo paquete,
// el mismo id o la misma IP) leen y descuentan en una transacción, sin pisarse.
import { operarCuota } from './cuota.js';

function kvDe(txn) {
    return {
        async get(clave) {
            const valor = await txn.get(clave);
            return valor === undefined ? null : valor;
        },
        put(clave, valor) {
            return txn.put(clave, valor);
        },
    };
}

export class Cuota {
    constructor(ctx) {
        this.ctx = ctx;
    }

    async fetch(request) {
        const pedido = await request.json();
        const resultado = await this.ctx.storage.transaction(async txn => operarCuota(kvDe(txn), pedido));
        return Response.json(resultado);
    }
}

export const NOMBRE_CUOTA = 'metrica-cuota';
