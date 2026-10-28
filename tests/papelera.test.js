import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listarPapelera, sacarDePapelera, vaciarPapelera, diasQuedan, claveDe } from '../js/logica/papelera.js';
import { guardarLetra, borrarLetra, restaurarLetra, listarLetras } from '../js/logica/sesiones.js';
import { anotarFrase, borrarFrase, editarFrase, sacarFrase, restaurarFrase, listarFrases } from '../js/logica/baul.js';

function almacenDePrueba() {
    const datos = new Map();
    return { getItem: clave => datos.get(clave) ?? null, setItem: (clave, valor) => datos.set(clave, String(valor)) };
}
const DIA = 864e5;

test('borrar una letra o una frase la manda a la papelera, lo último borrado primero', () => {
    const almacen = almacenDePrueba();
    guardarLetra(almacen, { id: '1', titulo: 'Checkpoint', texto: 'hola' }, 1);
    anotarFrase(almacen, 'la luna no cobra entrada', 1);
    borrarLetra(almacen, '1', 10);
    borrarFrase(almacen, '1', 20);
    assert.deepEqual(listarLetras(almacen), []);
    assert.deepEqual(listarFrases(almacen), []);
    const papelera = listarPapelera(almacen, 30);
    assert.deepEqual(papelera.map(claveDe), ['frase-1', 'letra-1']);
    assert.equal(papelera[1].cosa.titulo, 'Checkpoint');
});

test('vaciar una frase al editarla o sacarla con «Al baúl» no la manda a la papelera', () => {
    const almacen = almacenDePrueba();
    anotarFrase(almacen, 'una', 1);
    anotarFrase(almacen, 'dos', 2);
    editarFrase(almacen, '1', ' ');
    sacarFrase(almacen, '2');
    assert.deepEqual(listarPapelera(almacen, 3), []);
});

test('a los 7 días se borran solas', () => {
    const almacen = almacenDePrueba();
    anotarFrase(almacen, 'vieja', 1);
    anotarFrase(almacen, 'nueva', 2);
    borrarFrase(almacen, '1', 0);
    borrarFrase(almacen, '2', 3 * DIA);
    assert.equal(diasQuedan(listarPapelera(almacen, DIA / 2)[1], DIA / 2), 7);
    assert.equal(diasQuedan(listarPapelera(almacen, 6.5 * DIA)[1], 6.5 * DIA), 1);
    assert.deepEqual(listarPapelera(almacen, 7 * DIA).map(e => e.cosa.texto), ['nueva']);
    // Ya no está guardada: no vuelve aunque se mire con una hora anterior.
    assert.deepEqual(listarPapelera(almacen, 0).map(e => e.cosa.texto), ['nueva']);
});

test('restaurar devuelve la letra o la frase tal como estaba; vaciar borra todo', () => {
    const almacen = almacenDePrueba();
    guardarLetra(almacen, { id: '1', titulo: 'A', texto: 'x' }, 5);
    anotarFrase(almacen, 'frase usada', 1);
    borrarLetra(almacen, '1', 10);
    borrarFrase(almacen, '1', 11);
    const letra = sacarDePapelera(almacen, 'letra-1');
    restaurarLetra(almacen, letra.cosa);
    assert.deepEqual(listarLetras(almacen).map(l => [l.titulo, l.editada]), [['A', 5]]);
    assert.equal(sacarDePapelera(almacen, 'letra-1'), null);
    restaurarFrase(almacen, sacarDePapelera(almacen, 'frase-1').cosa);
    assert.deepEqual(listarFrases(almacen).map(f => f.texto), ['frase usada']);
    borrarFrase(almacen, '1', 12);
    vaciarPapelera(almacen);
    assert.deepEqual(listarPapelera(almacen, 13), []);
});
