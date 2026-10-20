import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaLetra, listarLetras, guardarLetra, borrarLetra, listarFavoritos, alternarFavorito } from '../js/logica/sesiones.js';

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
    const almacen = almacenDePrueba({ 'metrica.letras': '{roto', 'metrica.favoritos': '"hola"' });
    assert.deepEqual(listarLetras(almacen), []);
    assert.deepEqual(listarFavoritos(almacen), []);
});

test('favoritos: marcar, desmarcar y la última primero', () => {
    const almacen = almacenDePrueba();
    assert.equal(alternarFavorito(almacen, 'luna'), true);
    assert.equal(alternarFavorito(almacen, 'corazón'), true);
    assert.deepEqual(listarFavoritos(almacen), ['corazón', 'luna']);
    assert.equal(alternarFavorito(almacen, 'luna'), false);
    assert.deepEqual(listarFavoritos(almacen), ['corazón']);
});
