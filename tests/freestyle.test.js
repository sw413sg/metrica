import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, CATALOGO_BEATS, DURACIONES, PASOS_POR_COMPAS, COMPASES_POR_RONDA, msPorTiempo, msPorPaso, sonidosDelPaso, tiempoDelPaso, cambiaLaPalabra,
    estadoCompas, proximasPalabras, avanzarPalabras, silabaFuerte, segundosRestantes, formatoReloj, estadoRonda,
    elegirDuracion, etiquetaBeat, patronDeBeat, archivoDeBeat, segundosDeLoop, fuenteFreestyle, playEnBandeja, GENEROS_BEAT, beatsDeGenero, beatVecino, msPorPalabra } from '../js/logica/freestyle.js';

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

test('estadoRonda: el aro se llena y el reloj muestra lo que queda', () => {
    assert.deepEqual(estadoRonda(0, 0, 60), { restantes: 60, avance: 0, texto: '1:00' });
    const aTrece = estadoRonda(0, 13000, 60);
    assert.equal(aTrece.restantes, 47);
    assert.equal(aTrece.texto, '0:47');
    assert.ok(Math.abs(aTrece.avance - 13 / 60) < 1e-9);
    assert.equal(estadoRonda(1000, 31000, 60).restantes, segundosRestantes(1000, 31000, 60));
    assert.equal(estadoRonda(0, 60000, 90).texto, '0:30');
    assert.equal(estadoRonda(0, 60000, 90).restantes, 30);
    assert.equal(estadoRonda(0, 120000, 120).restantes, 0);
    assert.equal(estadoRonda(0, 130000, 120).avance, 1);
    assert.deepEqual(estadoRonda(0, 5000, null), { restantes: null, avance: 0, texto: '' });
});

test('elegir duración: ilimitado está bloqueado sin Extras', () => {
    assert.deepEqual(DURACIONES.map(d => d.etiqueta), ['1 min', '1:30', '2 min', 'Ilimitado']);
    assert.equal(elegirDuracion('60', false).segundos, 60);
    assert.equal(elegirDuracion('90', false).segundos, 90);
    assert.equal(elegirDuracion('120', true).segundos, 120);
    assert.equal(elegirDuracion('ilimitado', false), null);
    assert.equal(elegirDuracion('ilimitado', true).premium, true);
    assert.equal(elegirDuracion('ilimitado', true).segundos, null);
    assert.equal(elegirDuracion('no-existe', true), null);
});

test('un link reemplaza al beat; sin link se elige un beat', () => {
    const beat = fuenteFreestyle({ beatId: 'trap-clasico', link: null });
    assert.equal(beat.tipo, 'beat');
    assert.equal(beat.beat.id, 'trap-clasico');
    assert.equal(beat.link, null);
    assert.equal(playEnBandeja(beat), true);
    const link = fuenteFreestyle({ beatId: 'trap-clasico', link: { fuente: 'youtube', id: 'dQw4w9WgXcQ' } });
    assert.equal(link.tipo, 'link');
    assert.equal(link.beat, null);
    assert.equal(link.link.fuente, 'youtube');
    assert.equal(playEnBandeja(link), false);
    assert.equal(fuenteFreestyle({}).beat.id, CATALOGO_BEATS[0].id);
    assert.equal(fuenteFreestyle({ beatId: 'no-esta' }).beat.id, CATALOGO_BEATS[0].id);
});

test('el catálogo son 2 géneros de 3, en el orden de Swa: Clásico sintetizado y cuatro mp3, y Acapella', () => {
    assert.equal(CATALOGO_BEATS.length, 7);
    assert.ok(CATALOGO_BEATS.every(b => !b.placeholder));
    const porGenero = {};
    for (const b of CATALOGO_BEATS) porGenero[b.genero] = (porGenero[b.genero] ?? 0) + 1;
    assert.deepEqual(porGenero, { Boombap: 3, Trap: 3, Acapella: 1 });
    assert.deepEqual(CATALOGO_BEATS.map(etiquetaBeat), ['Boombap 1', 'Trap 1', 'Boombap 2', 'Boombap 3', 'Trap 2', 'Trap 3', 'Acapella']);
    assert.deepEqual(CATALOGO_BEATS.slice(0, 3).map(b => b.id), ['boom-bap-bateria', 'trap-seco', 'boom-bap-jazz']);
    assert.deepEqual(GENEROS_BEAT, ['Boombap', 'Trap', 'Acapella']);
    // Acapella no suena: ni patrón ni mp3, y las flechas del reproductor no pasan por él.
    assert.equal(patronDeBeat('acapella'), null);
    assert.equal(archivoDeBeat('acapella'), null);
    assert.equal(beatVecino('acapella', 1), 'acapella');
    assert.deepEqual(beatsDeGenero('Trap').map(b => b.id), ['trap-seco', 'trap-grave', 'trap-clasico']);
    assert.equal(patronDeBeat('boom-bap-clasico'), BEATS['boom-bap']);
    assert.equal(patronDeBeat('trap-clasico'), BEATS.trap);
    assert.equal(patronDeBeat('boom-bap-jazz'), null);
    assert.equal(patronDeBeat('trap-grave'), null);
    assert.equal(patronDeBeat('no-esta'), null);
    assert.equal(archivoDeBeat('boom-bap-clasico'), null);
    assert.equal(archivoDeBeat('no-esta'), null);
    const grabados = CATALOGO_BEATS.filter(b => b.archivo);
    assert.deepEqual(grabados.map(b => b.nombre), ['Boombap 1', 'Trap 1', 'Boombap 2', 'Trap 2']);
    for (const b of grabados) {
        const enRango = b.genero === 'Boombap' ? b.bpm >= 85 && b.bpm <= 95 : b.bpm >= 130 && b.bpm <= 145;
        assert.ok(enRango, `${b.id} a ${b.bpm} bpm`);
        assert.equal(b.compases, Math.round(b.compases));
        assert.ok(b.compases >= 2);
        // El loop cierra justo en un compás, así no se desfasa al repetir.
        assert.ok(Math.abs(segundosDeLoop(b.bpm, b.compases) - b.compases * 4 * 60 / b.bpm) < 1e-9);
    }
    assert.equal(archivoDeBeat('boom-bap-jazz').archivo, 'beats/boom-bap-jazz.mp3');
    assert.equal(archivoDeBeat('boom-bap-jazz').bpm, 93);
    assert.equal(segundosDeLoop(90, 8), 32 / 1.5);
    assert.equal(segundosDeLoop(140, 4), 48 / 7);
});

test('deslizar el botón de un género pasa al beat de al lado, sin dar la vuelta', () => {
    assert.equal(beatVecino('boom-bap-bateria', 1), 'boom-bap-jazz');
    assert.equal(beatVecino('boom-bap-jazz', 1), 'boom-bap-clasico');
    assert.equal(beatVecino('boom-bap-clasico', 1), 'boom-bap-clasico');
    assert.equal(beatVecino('boom-bap-bateria', -1), 'boom-bap-bateria');
    assert.equal(beatVecino('trap-grave', -1), 'trap-seco');
    assert.equal(beatVecino('no-esta', 1), CATALOGO_BEATS[0].id);
});

test('cada palabra dura 2 compases del beat: la barrita se vacía en ese tiempo', () => {
    assert.equal(msPorPalabra(90, 2), 8 * 60000 / 90);
    assert.equal(msPorPalabra(140, 2), 8 * 60000 / 140);
});

test('la velocidad de cambio de palabra va de 1 a 10 y en 5 son 2 compases', async () => {
    const { leerVelocidad, guardarVelocidad, compasesDeVelocidad, PASOS_POR_COMPAS } = await import('../js/logica/freestyle.js');
    const datos = new Map();
    const almacen = { getItem: k => datos.has(k) ? datos.get(k) : null, setItem: (k, v) => datos.set(k, v) };
    assert.equal(leerVelocidad(almacen), 5);
    assert.equal(compasesDeVelocidad(5), 2);
    // La más lenta es un mínimo, no la congela: 4 compases.
    assert.equal(compasesDeVelocidad(1), 4);
    assert.equal(guardarVelocidad(almacen, '9'), 9);
    assert.equal(leerVelocidad(almacen), 9);
    assert.equal(guardarVelocidad(almacen, 30), 10);
    assert.equal(guardarVelocidad(almacen, 0), 5);
    datos.set('metrica.velocidad-palabras', 'rapido');
    assert.equal(leerVelocidad(almacen), 5);
    // Más alto, más rápido, y siempre en pasos enteros del beat.
    for (let v = 1; v < 10; v++) assert.ok(compasesDeVelocidad(v) > compasesDeVelocidad(v + 1));
    for (let v = 1; v <= 10; v++) assert.ok(Number.isInteger(compasesDeVelocidad(v) * PASOS_POR_COMPAS));
});
