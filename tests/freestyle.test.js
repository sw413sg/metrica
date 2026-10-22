import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, PASOS_POR_COMPAS, COMPASES_POR_RONDA, msPorTiempo, msPorPaso, sonidosDelPaso, tiempoDelPaso, cambiaLaPalabra,
    estadoCompas, proximasPalabras, avanzarPalabras, silabaFuerte, segundosRestantes, formatoReloj } from '../js/logica/freestyle.js';

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

test('estadoCompas cuenta compás y ronda de a 8, y el aro se carga dentro de la ronda', () => {
    assert.equal(COMPASES_POR_RONDA, 8);
    assert.deepEqual(estadoCompas(0), { compas: 1, de: 8, ronda: 1, avance: 0 });
    assert.equal(estadoCompas(PASOS_POR_COMPAS * 4).compas, 5);
    assert.equal(estadoCompas(PASOS_POR_COMPAS * 4).ronda, 1);
    assert.equal(estadoCompas(PASOS_POR_COMPAS * 4).avance, 0.5);
    // Compás 5 de la ronda 3: dos rondas completas y cuatro compases.
    assert.deepEqual(estadoCompas(PASOS_POR_COMPAS * 20), { compas: 5, de: 8, ronda: 3, avance: 0.5 });
    assert.equal(estadoCompas(PASOS_POR_COMPAS * 4 + 8).avance, (4 + 0.5) / 8);
});

test('proximasPalabras y avanzarPalabras: ahora, después y luego', () => {
    assert.deepEqual(proximasPalabras(['callejón', 'fuego', 'camino']), {
        ahora: 'callejón', despues: 'fuego', luego: 'camino',
    });
    assert.deepEqual(proximasPalabras(['solo']), { ahora: 'solo', despues: null, luego: null });
    assert.deepEqual(proximasPalabras([]), { ahora: null, despues: null, luego: null });
    assert.deepEqual(avanzarPalabras(['callejón', 'fuego', 'camino'], 'noche'), ['fuego', 'camino', 'noche']);
    assert.deepEqual(proximasPalabras(avanzarPalabras(['callejón', 'fuego', 'camino'], 'noche')), {
        ahora: 'fuego', despues: 'camino', luego: 'noche',
    });
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
