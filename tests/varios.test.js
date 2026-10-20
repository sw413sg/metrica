import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaLetra } from '../js/logica/sesiones.js';
import { msPorTiempo } from '../js/logica/freestyle.js';

test('nuevaLetra arranca vacía', () => {
    const letra = nuevaLetra(1000);
    assert.deepEqual(letra, { id: '1000', titulo: '', texto: '', creada: 1000, editada: 1000 });
});

test('msPorTiempo', () => {
    assert.equal(msPorTiempo(90), 60000 / 90);
    assert.equal(msPorTiempo(120), 500);
});
