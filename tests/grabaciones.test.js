import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerVolumenes, guardarVolumen, moverSincronia, textoSincronia, inicioDeVoz, tipoDeGrabacion, desfaseDeVoz, describirGrabacion, extensionDeAudio, nombreDeArchivo, codificarWav } from '../js/logica/grabaciones.js';

test('grabaciones: qué se guarda con la voz según lo que suena', () => {
    assert.equal(tipoDeGrabacion({ link: null, acapella: false }), 'beat');
    assert.equal(tipoDeGrabacion({ link: null, acapella: true }), 'voz');
    assert.equal(tipoDeGrabacion({ link: { fuente: 'archivo' } }), 'archivo');
    assert.equal(tipoDeGrabacion({ link: { fuente: 'youtube' } }), 'link');
    assert.equal(tipoDeGrabacion({ link: { fuente: 'soundcloud' } }), 'link');
});

test('grabaciones: la voz se adelanta lo que tardan el parlante y el micrófono', () => {
    assert.equal(desfaseDeVoz({ salida: 0.04, base: 0.01, entrada: 0.02 }), 0.07);
    assert.equal(desfaseDeVoz({}), 0.09, 'sin datos, se estima');
});

test('grabaciones: título y detalle', () => {
    const fecha = new Date(2026, 9, 25, 23, 51).getTime();
    assert.deepEqual(describirGrabacion({ titulo: 'Boombap 1', fecha, duracion: 72 }), { titulo: 'Boombap 1', detalle: '25/10 · 23:51 · 1:12' });
    assert.deepEqual(describirGrabacion({ titulo: '', fecha, duracion: 5, fuente: 'youtube' }), { titulo: 'Freestyle', detalle: '25/10 · 23:51 · 0:05 · YouTube' });
});

test('grabaciones: nombre y extensión del archivo', () => {
    assert.equal(extensionDeAudio('audio/mp4'), 'm4a');
    assert.equal(extensionDeAudio('audio/webm;codecs=opus'), 'webm');
    assert.equal(extensionDeAudio('audio/wav'), 'wav');
    assert.equal(nombreDeArchivo({ fecha: new Date(2026, 9, 5, 9, 3).getTime() }, 'wav'), 'Métrica freestyle 2026-10-05 09-03.wav');
});

test('grabaciones: WAV de 16 bits', () => {
    const wav = new DataView(codificarWav([new Float32Array([0, 1, -1]), new Float32Array([0.5, 2, 0])], 44100));
    const texto = (en, largo) => String.fromCharCode(...Array.from({ length: largo }, (_, i) => wav.getUint8(en + i)));
    assert.equal(texto(0, 4), 'RIFF');
    assert.equal(texto(8, 4), 'WAVE');
    assert.equal(wav.getUint16(22, true), 2, 'dos canales');
    assert.equal(wav.getUint32(24, true), 44100);
    assert.equal(wav.getUint32(40, true), 12, '3 muestras × 2 canales × 2 bytes');
    assert.equal(wav.byteLength, 56);
    assert.equal(wav.getInt16(46, true), 16383, 'medio volumen');
    assert.equal(wav.getInt16(48, true), 32767, 'se recorta en 1');
    assert.equal(wav.getInt16(52, true), -32768);
});

test('grabaciones: volumen de la voz y del beat, para todas', () => {
    const datos = new Map();
    const almacen = { getItem: k => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) };
    assert.deepEqual(leerVolumenes(almacen), { voz: 10, beat: 5 });
    guardarVolumen(almacen, 'beat', 0);
    guardarVolumen(almacen, 'voz', 14);
    assert.deepEqual(leerVolumenes(almacen), { voz: 10, beat: 0 });
});

test('grabaciones: sincronía de a 20 ms, hasta medio segundo', () => {
    assert.equal(moverSincronia(0, 1), 20);
    assert.equal(moverSincronia(undefined, -2), -40);
    assert.equal(moverSincronia(500, 1), 500);
    assert.equal(textoSincronia(40), '+40 ms');
    assert.equal(textoSincronia(-20), '-20 ms');
    assert.equal(textoSincronia(0), '0 ms');
});

test('grabaciones: desde dónde suena la voz', () => {
    assert.deepEqual(inicioDeVoz(0.1, 0, 0), { espera: 0, desde: 0.1 });
    assert.deepEqual(inicioDeVoz(0.1, 40, 2), { espera: 0, desde: 2.06 });
    const tarde = inicioDeVoz(0.1, 300, 0);
    assert.equal(tarde.desde, 0);
    assert.ok(Math.abs(tarde.espera - 0.2) < 1e-9, 'la voz espera');
});
