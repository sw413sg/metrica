import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaLetra, listarLetras, guardarLetra, borrarLetra, moverLetra, lugarEnGrilla, listarGuardadas, alternarGuardada } from '../js/logica/sesiones.js';

// Imita localStorage: guarda texto por clave.
function almacenDePrueba(inicial = {}) {
    const datos = new Map(Object.entries(inicial));
    return { getItem: clave => datos.get(clave) ?? null, setItem: (clave, valor) => datos.set(clave, String(valor)) };
}

test('guardarLetra guarda, actualiza y lista de la última editada a la primera', () => {
    const almacen = almacenDePrueba();
    assert.deepEqual(listarLetras(almacen), []);
    const a = guardarLetra(almacen, { ...nuevaLetra(1), titulo: 'Primera' }, 10);
    guardarLetra(almacen, { ...nuevaLetra(2), texto: 'un verso' }, 20);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['2', '1']);
    guardarLetra(almacen, { ...a, texto: 'cambiada' }, 30);
    const letras = listarLetras(almacen);
    assert.deepEqual(letras.map(l => l.id), ['1', '2']);
    assert.equal(letras[0].texto, 'cambiada');
    assert.equal(letras[0].editada, 30);
    assert.equal(letras[0].creada, 1);
});

test('una letra vacía no se guarda, y si se vacía se borra', () => {
    const almacen = almacenDePrueba();
    guardarLetra(almacen, nuevaLetra(1));
    assert.equal(listarLetras(almacen).length, 0);
    const letra = guardarLetra(almacen, { ...nuevaLetra(1), titulo: 'Algo' });
    guardarLetra(almacen, { ...letra, titulo: '  ' });
    assert.equal(listarLetras(almacen).length, 0);
});

test('borrarLetra', () => {
    const almacen = almacenDePrueba();
    guardarLetra(almacen, { ...nuevaLetra(1), titulo: 'A' });
    guardarLetra(almacen, { ...nuevaLetra(2), titulo: 'B' });
    borrarLetra(almacen, '1');
    assert.deepEqual(listarLetras(almacen).map(l => l.titulo), ['B']);
});

test('datos rotos en el almacén no rompen la app', () => {
    const almacen = almacenDePrueba({ 'metrica.letras': '{roto' });
    assert.deepEqual(listarLetras(almacen), []);
});


test('moverLetra acomoda a mano, y editar vuelve a poner la letra primera', () => {
    const almacen = almacenDePrueba();
    for (const [id, t] of [['a', 10], ['b', 20], ['c', 30]]) guardarLetra(almacen, { ...nuevaLetra(id), id, titulo: id }, t);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['c', 'b', 'a']);
    moverLetra(almacen, 'a', 0);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['a', 'c', 'b']);
    moverLetra(almacen, 'a', 2);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['c', 'b', 'a']);
    moverLetra(almacen, 'c', 1);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['b', 'c', 'a']);
    const a = listarLetras(almacen)[2];
    guardarLetra(almacen, { ...a, texto: 'nuevo' }, 40);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['a', 'b', 'c']);
});

test('letras guardadas antes, sin orden, se listan por la última edición', () => {
    const almacen = almacenDePrueba({ 'metrica.letras': JSON.stringify([{ id: '1', titulo: 'x', texto: '', editada: 5 }, { id: '2', titulo: 'y', texto: '', editada: 9 }]) });
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['2', '1']);
});

test('lugarEnGrilla: dos chicas y una larga, y después al revés', () => {
    const lugares = Array.from({ length: 9 }, (_, i) => lugarEnGrilla(i));
    assert.deepEqual(lugares.map(l => `${l.columna}/${l.fila}${l.larga ? 'L' : ''}`),
        ['1/1', '2/1L', '1/2', '1/3L', '2/3', '2/4', '1/5', '2/5L', '1/6']);
});

test('palabras guardadas: guardar, sacar y la última primero', () => {
    const almacen = almacenDePrueba({ 'metrica.guardadas': '"rota"' });
    assert.deepEqual(listarGuardadas(almacen), []);
    assert.equal(alternarGuardada(almacen, 'luna'), true);
    assert.equal(alternarGuardada(almacen, 'corazón'), true);
    assert.deepEqual(listarGuardadas(almacen), ['corazón', 'luna']);
    assert.equal(alternarGuardada(almacen, 'luna'), false);
    assert.deepEqual(listarGuardadas(almacen), ['corazón']);
});
