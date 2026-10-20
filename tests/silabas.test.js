import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarSilabasVerso, separarSilabas } from '../js/logica/silabas.js';

const todo = 'paso 2: conteo de sílabas';

test('separar sílabas con diptongo', { todo }, () => {
    assert.deepEqual(separarSilabas('cuidado'), ['cui', 'da', 'do']);
});
test('verso grave con sinalefa: "Caminante, no hay camino" = 8', { todo }, () => {
    assert.equal(contarSilabasVerso('Caminante, no hay camino'), 8);
});
test('sinalefa: "La princesa está triste" = 7', { todo }, () => {
    assert.equal(contarSilabasVerso('La princesa está triste'), 7);
});
test('verso agudo suma una: "mi corazón" = 5', { todo }, () => {
    assert.equal(contarSilabasVerso('mi corazón'), 5);
});
