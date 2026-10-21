import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMAS, tieneExtras, comprarExtras, borrarCompra, mostrarPublicidad, temaDisponible, temaActual, elegirTema } from '../js/logica/compra.js';

function almacenDePrueba(inicial = {}) {
    const datos = new Map(Object.entries(inicial));
    return { getItem: clave => datos.get(clave) ?? null, setItem: (clave, valor) => datos.set(clave, String(valor)) };
}

test('sin comprar: hay publicidad y los temas de pago están bloqueados', () => {
    const almacen = almacenDePrueba();
    assert.equal(tieneExtras(almacen), false);
    assert.equal(mostrarPublicidad(almacen), true);
    assert.equal(temaDisponible('gris', almacen), true);
    assert.equal(temaDisponible('blanco', almacen), true);
    assert.equal(temaDisponible('pizarra', almacen), false);
    assert.equal(temaDisponible('no-existe', almacen), false);
});

test('al comprar se va la publicidad y se desbloquean todos los temas', () => {
    const almacen = almacenDePrueba();
    assert.equal(comprarExtras(almacen), true);
    assert.equal(tieneExtras(almacen), true);
    assert.equal(mostrarPublicidad(almacen), false);
    assert.ok(TEMAS.every(t => temaDisponible(t.clave, almacen)));
});

test('elegirTema no deja elegir uno bloqueado', () => {
    const almacen = almacenDePrueba();
    assert.equal(temaActual(almacen), 'gris');
    assert.equal(elegirTema(almacen, 'medianoche'), false);
    assert.equal(temaActual(almacen), 'gris');
    assert.equal(elegirTema(almacen, 'blanco'), true);
    assert.equal(temaActual(almacen), 'blanco');
    comprarExtras(almacen);
    assert.equal(elegirTema(almacen, 'medianoche'), true);
    assert.equal(temaActual(almacen), 'medianoche');
});

test('si se borra la compra, un tema de pago vuelve al inicial', () => {
    const almacen = almacenDePrueba();
    comprarExtras(almacen);
    elegirTema(almacen, 'papel');
    borrarCompra(almacen);
    assert.equal(tieneExtras(almacen), false);
    assert.equal(temaActual(almacen), 'gris');
});

test('datos raros en el almacén no desbloquean nada', () => {
    const almacen = almacenDePrueba({ 'metrica.extras': 'true', 'metrica.tema-libreta': 'pizarra' });
    assert.equal(tieneExtras(almacen), false);
    assert.equal(temaActual(almacen), 'gris');
});

test('siempre hay al menos un tema gratis', () => {
    assert.ok(TEMAS.some(t => !t.extra));
});
