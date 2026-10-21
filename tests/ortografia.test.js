import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinTildes, crearCorrector } from '../js/logica/ortografia.js';

const palabras = ['balcón', 'acción', 'accion', 'querer', 'temor', 'mas', 'más', 'esta', 'está', 'bay', 'casa', 'teléfono'];
const frecuencias = new Map([['balcón', 3191], ['acción', 28381], ['accion', 863], ['querer', 50000], ['temor', 5329],
    ['mas', 103445], ['más', 1503527], ['esta', 1051900], ['está', 2433246], ['bay', 3242], ['casa', 90000], ['teléfono', 60000]]);
const corregir = crearCorrector(palabras, frecuencias);

test('sinTildes deja la ñ', () => {
    assert.equal(sinTildes('canción'), 'cancion');
    assert.equal(sinTildes('pingüino'), 'pinguino');
    assert.equal(sinTildes('año'), 'año');
});

test('falta de tilde', () => {
    assert.equal(corregir('balcon'), 'balcón');
    assert.equal(corregir('Balcon'), 'balcón');
    assert.equal(corregir('accion'), 'acción'); // con tilde se usa 30 veces más
});

test('las palabras bien escritas no se tocan', () => {
    for (const p of ['balcón', 'casa', 'mas', 'esta', 'está']) assert.equal(corregir(p), null, p);
});

test('voseo sin tilde', () => {
    assert.equal(corregir('queres'), 'querés');
});

test('una letra mal en palabras de 5 o más', () => {
    assert.equal(corregir('tmeor'), 'temor');
    assert.equal(corregir('telefno'), 'teléfono');
    assert.equal(corregir('baby'), null); // corta: puede ser inglés
    assert.equal(corregir('qwertyu'), null);
});
