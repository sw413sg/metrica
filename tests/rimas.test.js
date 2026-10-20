import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveConsonante, claveAsonante } from '../js/logica/rimas.js';

// Casos difíciles que tiene que cubrir el paso 1. Marcados como "todo"
// hasta que el motor esté implementado: corren, pero no rompen la suite.
const todo = 'paso 1: motor de rimas';

test('consonante: aguda con tilde', { todo }, () => {
    assert.equal(claveConsonante('canción'), 'ón');
    assert.equal(claveConsonante('avión'), 'ón');
});
test('consonante: grave sin tilde', { todo }, () => {
    assert.equal(claveConsonante('casa'), 'asa');
});
test('consonante: esdrújula', { todo }, () => {
    assert.equal(claveConsonante('música'), 'úsica');
});
test('consonante: diptongo ("cielo" rima con "suelo" no, con "hielo" sí)', { todo }, () => {
    assert.equal(claveConsonante('cielo'), claveConsonante('hielo'));
    assert.notEqual(claveConsonante('cielo'), claveConsonante('suelo'));
});
test('asonante: hiato con tilde ("día" es i-a)', { todo }, () => {
    assert.equal(claveAsonante('día'), claveAsonante('vida'));
});
test('asonante: aguda', { todo }, () => {
    assert.equal(claveAsonante('amor'), claveAsonante('dolor'));
});
