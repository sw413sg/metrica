import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECCIONES, separador, esSeparador } from '../js/logica/secciones.js';

test('las secciones que pidió Swa', () => {
    assert.deepEqual(SECCIONES, ['Intro', 'Estribillo', 'Hook', 'Verso', 'Final']);
});

test('separador y cómo se reconoce', () => {
    assert.equal(separador('Hook'), '[Hook]');
    assert.ok(esSeparador('[Estribillo]'));
    assert.ok(esSeparador('  [Verso 2] '));
    assert.ok(!esSeparador('y al volver [la vista] atrás'));
    assert.ok(!esSeparador(''));
    assert.ok(!esSeparador('[]'));
});
