import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { crearIndiceRelacionados, buscarRelacionados } from '../js/logica/relacionados.js';

test('busca por palabra, en minúscula y sin la palabra misma', () => {
    const indice = crearIndiceRelacionados('noche:luna,madrugada,noche');
    assert.deepEqual(buscarRelacionados('noche', indice), ['luna', 'madrugada']);
    assert.deepEqual(buscarRelacionados('Noche', indice), ['luna', 'madrugada']);
    assert.deepEqual(buscarRelacionados('día', indice), []);
});

test('un plural usa las de su singular', () => {
    const indice = crearIndiceRelacionados('noche:luna\nflor:pétalo');
    assert.deepEqual(buscarRelacionados('noches', indice), ['luna']);
    assert.deepEqual(buscarRelacionados('flores', indice), ['pétalo']);
});

// Con el archivo de verdad.
const contexto = {};
vm.runInNewContext(fs.readFileSync('relacionados.js', 'utf8') + '\nthis.r = textoRelacionados;', contexto);
const indice = crearIndiceRelacionados(contexto.r);

test('relacionados.js: lo propio primero y lo de Numberbatch después', () => {
    assert.deepEqual(buscarRelacionados('noche', indice).slice(0, 3), ['oscuridad', 'luna', 'madrugada']);
    assert.ok(buscarRelacionados('noche', indice).includes('medianoche'));
    assert.ok(buscarRelacionados('triste', indice).includes('melancólico'));
    assert.ok(buscarRelacionados('fuego', indice).includes('hoguera'));
    assert.ok(buscarRelacionados('luna', indice).includes('planeta'));
    assert.ok(buscarRelacionados('lunas', indice).includes('planeta'));
});

test('relacionados.js: sin repetidas ni la misma familia', () => {
    for (const palabra of ['noche', 'amor', 'mar', 'calle', 'sueño']) {
        const lista = buscarRelacionados(palabra, indice);
        assert.equal(new Set(lista).size, lista.length, palabra);
    }
    assert.ok(!buscarRelacionados('noche', indice).includes('noches'));
    assert.ok(!buscarRelacionados('amor', indice).includes('amores'));
});
