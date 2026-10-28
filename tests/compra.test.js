import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMAS, tieneExtras, comprarExtras, borrarCompra, mostrarPublicidad, temaDisponible, temaDeLetra } from '../js/logica/compra.js';

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
    assert.equal(temaDisponible('sierra', almacen), false);
    assert.equal(temaDisponible('no-existe', almacen), false);
});

test('al comprar se va la publicidad y se desbloquean todos los temas', () => {
    const almacen = almacenDePrueba();
    assert.equal(comprarExtras(almacen), true);
    assert.equal(tieneExtras(almacen), true);
    assert.equal(mostrarPublicidad(almacen), false);
    assert.ok(TEMAS.every(t => temaDisponible(t.clave, almacen)));
});

test('cada letra tiene su tema; sin elegir, el gris', () => {
    const almacen = almacenDePrueba();
    assert.equal(temaDeLetra({ id: '1' }, almacen), 'gris');
    assert.equal(temaDeLetra(null, almacen), 'gris');
    assert.equal(temaDeLetra({ id: '1', tema: 'blanco' }, almacen), 'blanco');
    assert.equal(temaDeLetra({ id: '2' }, almacen), 'gris', 'el tema de una no pasa a las otras');
});

test('un tema de pago en una letra solo vale con Extras', () => {
    const almacen = almacenDePrueba();
    const letra = { id: '1', tema: 'madrugada' };
    assert.equal(temaDeLetra(letra, almacen), 'gris');
    comprarExtras(almacen);
    assert.equal(temaDeLetra(letra, almacen), 'madrugada');
    borrarCompra(almacen);
    assert.equal(tieneExtras(almacen), false);
    assert.equal(temaDeLetra(letra, almacen), 'gris');
});

test('datos raros no desbloquean nada', () => {
    const almacen = almacenDePrueba({ 'metrica.extras': 'true' });
    assert.equal(tieneExtras(almacen), false);
    assert.equal(temaDeLetra({ tema: 'sierra' }, almacen), 'gris');
    assert.equal(temaDeLetra({ tema: 'inventado' }, almacen), 'gris');
});

test('siempre hay al menos un tema gratis', () => {
    assert.ok(TEMAS.some(t => !t.extra));
});

test('gris y blanco son los gratis; los otros veinte, de Extras', () => {
    assert.deepEqual(TEMAS.filter(t => !t.extra).map(t => t.clave), ['gris', 'blanco']);
    assert.equal(TEMAS.filter(t => t.extra).length, 20);
});

test('opacidadDeTema: de 1 a 10, arranca en 10', async () => {
    const { opacidadDeTema } = await import('../js/logica/compra.js');
    assert.equal(opacidadDeTema(undefined), 10);
    assert.equal(opacidadDeTema(4), 4);
    assert.equal(opacidadDeTema(0), 1);
    assert.equal(opacidadDeTema(15), 10);
    assert.equal(opacidadDeTema('7'), 7);
});

test('los temas van ordenados: gratis, claros, oscuros y los del espacio al final', () => {
    const claves = TEMAS.map(t => t.clave);
    assert.deepEqual(claves.slice(0, 2), ['gris', 'blanco']);
    assert.deepEqual(claves.slice(-5), ['galaxia', 'nebulosa', 'saturno', 'eclipse', 'luna']);
});
