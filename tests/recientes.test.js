import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerRecientes, agregarReciente, titularReciente, etiquetaReciente, tituloDeArchivo, MAXIMO_RECIENTES, quitarReciente, sufijoReciente } from '../js/logica/recientes.js';

function almacen() {
    const datos = new Map();
    return { getItem: k => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)) };
}

test('recientes: el último arriba, sin repetir y como mucho 3', () => {
    const a = almacen();
    assert.deepEqual(leerRecientes(a), []);
    agregarReciente(a, { fuente: 'youtube', link: 'https://youtu.be/uno', titulo: 'Uno' });
    agregarReciente(a, { fuente: 'soundcloud', link: 'https://soundcloud.com/a/dos', titulo: 'Dos' });
    agregarReciente(a, { fuente: 'youtube', link: 'https://youtu.be/uno', titulo: '' });
    assert.deepEqual(leerRecientes(a).map(r => r.titulo), ['Uno', 'Dos'], 'repetido sube y conserva el título');
    agregarReciente(a, { fuente: 'archivo', id: 'f1', titulo: 'Mío' });
    const caidos = agregarReciente(a, { fuente: 'archivo', id: 'f2', titulo: 'Otro' });
    assert.equal(leerRecientes(a).length, MAXIMO_RECIENTES);
    assert.deepEqual(leerRecientes(a).map(r => r.titulo), ['Otro', 'Mío', 'Uno']);
    assert.deepEqual(caidos.map(r => r.titulo), ['Dos']);
});

test('recientes: el título se completa cuando carga el tema', () => {
    const a = almacen();
    const reciente = { fuente: 'youtube', link: 'https://youtu.be/uno', titulo: '' };
    agregarReciente(a, reciente);
    titularReciente(a, reciente, 'Beat sad 88 bpm');
    assert.equal(leerRecientes(a)[0].titulo, 'Beat sad 88 bpm');
});

test('recientes: título acortado y de dónde viene', () => {
    assert.equal(etiquetaReciente({ fuente: 'youtube', titulo: 'Beat corto' }), 'Beat corto (YT)');
    assert.equal(etiquetaReciente({ fuente: 'soundcloud', titulo: 'Un beat con un título larguísimo que no entra' }), 'Un beat con un título larguís… (SCLOUD)');
    assert.equal(etiquetaReciente({ fuente: 'archivo', titulo: 'mi beat' }), 'mi beat (ARCHIVO)');
    assert.equal(tituloDeArchivo('mi_beat-trap.mp3'), 'mi beat-trap');
    assert.equal(tituloDeArchivo(''), 'Beat del teléfono');
});

test('recientes: lo que no se entiende no rompe', () => {
    const a = almacen();
    a.setItem('metrica.recientes', 'no es json');
    assert.deepEqual(leerRecientes(a), []);
});

test('recientes: se pueden borrar de a uno', () => {
    const a = almacen();
    agregarReciente(a, { fuente: 'youtube', link: 'https://youtu.be/uno', titulo: 'Uno' });
    agregarReciente(a, { fuente: 'archivo', id: 'f1', titulo: 'Mío' });
    assert.equal(quitarReciente(a, { fuente: 'archivo', id: 'f1' }), true);
    assert.deepEqual(leerRecientes(a).map(r => r.titulo), ['Uno']);
    assert.equal(quitarReciente(a, { fuente: 'archivo', id: 'f1' }), false);
    assert.equal(sufijoReciente({ fuente: 'soundcloud' }), 'SCLOUD');
});
