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

test('los temas van en dos grupos, oscuros (Gris liso primero) y claros (Blanco primero)', () => {
    const oscuros = TEMAS.filter(t => t.oscuro).map(t => t.clave);
    const claros = TEMAS.filter(t => !t.oscuro).map(t => t.clave);
    assert.equal(oscuros[0], 'gris');
    assert.equal(claros[0], 'blanco');
    assert.equal(oscuros.length, 13);
    assert.equal(claros.length, 9);
});

test('al cambiar de modo, cada uno vuelve al último tema que usó en ese modo', async () => {
    const { claseDeTema, recordarTema, temaParaModo, comprarExtras: comprar } = await import('../js/logica/compra.js');
    const { guardarLetra, listarLetras, adaptarTemasDeLetras } = await import('../js/logica/sesiones.js');
    const almacen = almacenDePrueba();
    comprar(almacen);
    assert.equal(claseDeTema('gris'), null);
    assert.equal(claseDeTema('arena'), 'claro');
    assert.equal(claseDeTema('galaxia'), 'oscuro');
    // Sin nada recordado, un tema claro pasa a Gris liso en oscuro.
    assert.equal(temaParaModo(almacen, 'arena', {}, 'oscuro').tema, 'gris');
    // Se eligió Galaxia en algún lado: es el último oscuro.
    recordarTema(almacen, 'galaxia');
    const { tema, temas } = temaParaModo(almacen, 'arena', {}, 'oscuro');
    assert.equal(tema, 'galaxia');
    // Y al volver a claro, vuelve Arena.
    assert.equal(temaParaModo(almacen, tema, temas, 'claro').tema, 'arena');
    // Lo recordado por la letra gana sobre el último de la app.
    assert.equal(temaParaModo(almacen, 'arena', { oscuro: 'vinilo' }, 'oscuro').tema, 'vinilo');
    // Gris liso y los del mismo modo no cambian.
    assert.equal(temaParaModo(almacen, 'gris', {}, 'oscuro').tema, 'gris');
    assert.deepEqual(recordarTema(almacen, 'gris', { claro: 'arena' }), {});
    assert.equal(temaParaModo(almacen, 'bosque', {}, 'oscuro').tema, 'bosque');
    // Las letras guardadas pasan juntas, sin cambiar de lugar.
    guardarLetra(almacen, { id: 'a', titulo: 'A', texto: 'x', tema: 'menta' }, 1);
    guardarLetra(almacen, { id: 'b', titulo: 'B', texto: 'y', tema: 'brasa' }, 2);
    adaptarTemasDeLetras(almacen, 'oscuro');
    assert.deepEqual(listarLetras(almacen).map(l => [l.id, l.tema]), [['b', 'brasa'], ['a', 'galaxia']]);
    adaptarTemasDeLetras(almacen, 'claro');
    assert.deepEqual(listarLetras(almacen).map(l => [l.id, l.tema]), [['b', 'gris'], ['a', 'menta']]);
    adaptarTemasDeLetras(almacen, 'oscuro');
    assert.deepEqual(listarLetras(almacen).map(l => [l.id, l.tema]), [['b', 'brasa'], ['a', 'galaxia']]);
});
