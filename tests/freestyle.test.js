import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, PASOS_POR_COMPAS, msPorTiempo, msPorPaso, sonidosDelPaso, tiempoDelPaso, cambiaLaPalabra,
    silabaFuerte, segundosRestantes, formatoReloj } from '../js/logica/freestyle.js';

test('msPorTiempo y msPorPaso', () => {
    assert.equal(msPorTiempo(90), 60000 / 90);
    assert.equal(msPorTiempo(120), 500);
    assert.equal(msPorPaso(120), 125);
});

test('todos los beats tienen 16 pasos por instrumento y el bombo cae en el 1', () => {
    for (const beat of Object.values(BEATS)) {
        for (const sonido of ['bombo', 'caja', 'hihat']) assert.equal(beat[sonido].length, PASOS_POR_COMPAS);
        assert.ok(sonidosDelPaso(beat, 0).includes('bombo'));
    }
});

test('sonidosDelPaso sigue el patrón y se repite cada compás', () => {
    assert.deepEqual(sonidosDelPaso(BEATS['boom-bap'], 4), ['caja', 'hihat']);
    assert.deepEqual(sonidosDelPaso(BEATS['boom-bap'], 4 + PASOS_POR_COMPAS * 3), ['caja', 'hihat']);
    assert.deepEqual(sonidosDelPaso(BEATS.metronomo, 1), []);
});

test('tiempoDelPaso y cambiaLaPalabra', () => {
    assert.deepEqual([0, 3, 4, 8, 15, 16].map(tiempoDelPaso), [1, 1, 2, 3, 4, 1]);
    assert.equal(cambiaLaPalabra(0, 2), true);
    assert.equal(cambiaLaPalabra(16, 2), false);
    assert.equal(cambiaLaPalabra(32, 2), true);
    assert.equal(cambiaLaPalabra(16, 1), true);
});

test('silabaFuerte marca la tónica en agudas, graves y esdrújulas', () => {
    assert.deepEqual(silabaFuerte('canción'), { silabas: ['can', 'ción'], tonica: 1 });
    assert.deepEqual(silabaFuerte('noche'), { silabas: ['no', 'che'], tonica: 0 });
    assert.deepEqual(silabaFuerte('música'), { silabas: ['mú', 'si', 'ca'], tonica: 0 });
    assert.deepEqual(silabaFuerte('sol'), { silabas: ['sol'], tonica: 0 });
    assert.equal(silabaFuerte('123'), null);
});

test('segundosRestantes y formatoReloj', () => {
    assert.equal(segundosRestantes(1000, 1000, 60), 60);
    assert.equal(segundosRestantes(1000, 1500, 60), 60);
    assert.equal(segundosRestantes(1000, 31000, 60), 30);
    assert.equal(segundosRestantes(1000, 99000, 60), 0);
    assert.equal(formatoReloj(65), '1:05');
    assert.equal(formatoReloj(0), '0:00');
});
