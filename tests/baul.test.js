import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listarFrases, anotarFrase, editarFrase, borrarFrase, alternarUsada, filtrarFrases } from '../js/logica/baul.js';

// Imita localStorage: guarda texto por clave.
function almacenDePrueba() {
    const datos = new Map();
    return { getItem: clave => datos.get(clave) ?? null, setItem: (clave, valor) => datos.set(clave, String(valor)) };
}

test('anotarFrase guarda y lista de la última a la primera; vacía no se guarda', () => {
    const almacen = almacenDePrueba();
    assert.deepEqual(listarFrases(almacen), []);
    anotarFrase(almacen, '  la calle me enseñó  ', 1);
    anotarFrase(almacen, 'barrio de cemento', 2);
    assert.equal(anotarFrase(almacen, '   ', 3), null);
    assert.deepEqual(listarFrases(almacen).map(f => f.texto), ['barrio de cemento', 'la calle me enseñó']);
    assert.equal(listarFrases(almacen)[0].usada, false);
});

test('editarFrase cambia el texto sin moverla, y vaciarla la borra', () => {
    const almacen = almacenDePrueba();
    anotarFrase(almacen, 'una', 1);
    anotarFrase(almacen, 'dos', 2);
    editarFrase(almacen, '1', 'una cambiada ');
    assert.deepEqual(listarFrases(almacen).map(f => f.texto), ['dos', 'una cambiada']);
    editarFrase(almacen, '2', ' ');
    assert.deepEqual(listarFrases(almacen).map(f => f.id), ['1']);
});

test('alternarUsada y borrarFrase', () => {
    const almacen = almacenDePrueba();
    anotarFrase(almacen, 'una', 1);
    anotarFrase(almacen, 'dos', 2);
    assert.equal(alternarUsada(almacen, '1'), true);
    assert.equal(listarFrases(almacen).find(f => f.id === '1').usada, true);
    assert.equal(alternarUsada(almacen, '1'), false);
    borrarFrase(almacen, '1');
    assert.deepEqual(listarFrases(almacen).map(f => f.id), ['2']);
});

test('filtrarFrases por usadas y por palabra, sin tildes ni mayúsculas', () => {
    const frases = [
        { id: '1', texto: 'barrio de cemento, corazón de madera', usada: false, creada: 1 },
        { id: '2', texto: 'mi vieja me dijo que no aflojé', usada: true, creada: 2 },
        { id: '3', texto: 'el año que viene', usada: false, creada: 3 },
    ];
    assert.equal(filtrarFrases(frases).length, 3);
    assert.deepEqual(filtrarFrases(frases, { filtro: 'usadas' }).map(f => f.id), ['2']);
    assert.deepEqual(filtrarFrases(frases, { filtro: 'sin-usar' }).map(f => f.id), ['1', '3']);
    assert.deepEqual(filtrarFrases(frases, { busqueda: 'CORAZON' }).map(f => f.id), ['1']);
    assert.deepEqual(filtrarFrases(frases, { busqueda: 'afloje' }).map(f => f.id), ['2']);
    // La ñ no es una n con tilde: «ano» no encuentra «año».
    assert.deepEqual(filtrarFrases(frases, { busqueda: 'año' }).map(f => f.id), ['3']);
    assert.deepEqual(filtrarFrases(frases, { busqueda: 'ano' }).map(f => f.id), []);
    assert.deepEqual(filtrarFrases(frases, { filtro: 'sin-usar', busqueda: 'de' }).map(f => f.id), ['1']);
});
