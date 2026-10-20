import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearPalabras, parsearFrecuencias } from '../js/logica/diccionario.js';
import { palabrasAlAzar, filtrarPorTerminacion } from '../js/logica/generador.js';

test('parsearPalabras saca líneas vacías y repetidas', () => {
    assert.deepEqual(parsearPalabras('\ncasa\r\nmesa\n\ncasa\n'), ['casa', 'mesa']);
});

test('palabrasAlAzar no repite y respeta la cantidad', () => {
    const lista = ['a', 'b', 'c', 'd', 'e'];
    const elegidas = palabrasAlAzar(lista, 3);
    assert.equal(elegidas.length, 3);
    assert.equal(new Set(elegidas).size, 3);
    assert.equal(palabrasAlAzar(lista, 10).length, 5);
    assert.deepEqual(lista, ['a', 'b', 'c', 'd', 'e']);
});

test('filtrarPorTerminacion', () => {
    assert.deepEqual(filtrarPorTerminacion(['canción', 'casa', 'avión'], 'ión'), ['canción', 'avión']);
    assert.equal(filtrarPorTerminacion(['casa'], '  ').length, 1);
});

test('parsearFrecuencias lee "palabra cantidad" y se queda con la primera', () => {
    const frecuencias = parsearFrecuencias('de 100\r\ncanción 7\n\nmal\ncanción 3\n');
    assert.equal(frecuencias.get('de'), 100);
    assert.equal(frecuencias.get('canción'), 7);
    assert.equal(frecuencias.has('mal'), false);
});
